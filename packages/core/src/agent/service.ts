import {
  agentConfigSchema,
  type AgentConfig,
  type AgentState,
  type AgentVersionDetail,
  type AgentVersionSummary,
  type ReviewResult,
  type TestSession,
} from "@cergo/contracts";
import {
  agentConfigVersions,
  agents,
  and,
  desc,
  eq,
  inArray,
  organizations,
  sql,
  users,
  type Db,
  type DbOrTx,
  type Tx,
} from "@cergo/db";
import { audit } from "../audit";
import type { Deps } from "../deps";
import { AppError } from "../errors";
import { enqueue } from "../queue/queue";
import { BASE_LAYER, BASE_LAYER_VERSION } from "./base-layer";
import { compileAgent } from "./compose";
import { hasBlocking, reviewConfig } from "./review";

type VersionRow = typeof agentConfigVersions.$inferSelect;
type Actor = { userId: string; ip?: string | null; viaStaff?: boolean };

export async function getHotelAgent(tx: DbOrTx, hotelId: string) {
  const [agent] = await tx.select().from(agents).where(eq(agents.hotelId, hotelId)).orderBy(agents.createdAt).limit(1);
  if (!agent) throw new AppError("not_found", "Este hotel todavía no tiene agente. Pedile a CERGO que lo configure.");
  return agent;
}

function parseConfig(raw: unknown): AgentConfig {
  const parsed = agentConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new AppError("internal", "La configuración guardada no es válida");
}

async function userNames(tx: DbOrTx, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return new Map();
  const rows = await tx.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r.name || r.email]));
}

function toSummary(v: VersionRow, names: Map<string, string>): AgentVersionSummary {
  return {
    id: v.id,
    version: v.version,
    status: v.status,
    notes: v.notes,
    error: v.error,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    publishedAt: v.publishedAt?.toISOString() ?? null,
    createdBy: v.createdBy ? (names.get(v.createdBy) ?? "Equipo CERGO") : null,
    publishedBy: v.publishedBy ? (names.get(v.publishedBy) ?? "Equipo CERGO") : null,
  };
}

function toDetail(v: VersionRow, names: Map<string, string>): AgentVersionDetail {
  return {
    ...toSummary(v, names),
    config: parseConfig(v.config),
    compiledPrompt: v.compiledPrompt,
    firstMessage: v.firstMessage,
  };
}

export async function getAgentState(
  deps: Deps,
  tx: Tx,
  hotelId: string,
  perms: { canDraft: boolean; canPublish: boolean },
): Promise<AgentState> {
  const agent = await getHotelAgent(tx, hotelId);
  const rows = await tx
    .select()
    .from(agentConfigVersions)
    .where(
      and(
        eq(agentConfigVersions.agentId, agent.id),
        inArray(agentConfigVersions.status, ["draft", "publishing", "published", "failed"]),
      ),
    )
    .orderBy(desc(agentConfigVersions.version));
  const names = await userNames(tx, rows.flatMap((r) => [r.createdBy, r.publishedBy]));
  const draft = rows.find((r) => r.status === "draft");
  const published = rows.find((r) => r.status === "published");
  const inFlight = rows.find((r) => r.status === "publishing" || (r.status === "failed" && (!published || r.version > published.version)));
  return {
    agent: {
      id: agent.id,
      name: agent.name,
      elevenlabsAgentId: agent.elevenlabsAgentId,
      hasTestAgent: Boolean(agent.elevenlabsTestAgentId),
      toolTokenHint: agent.toolTokenHint,
      voiceConfigured: Boolean(agent.elevenlabsAgentId),
    },
    draft: draft ? toDetail(draft, names) : null,
    published: published ? toDetail(published, names) : null,
    inFlight: inFlight ? toSummary(inFlight, names) : null,
    baseLayer: { version: BASE_LAYER_VERSION, text: BASE_LAYER },
    canDraft: perms.canDraft,
    canPublish: perms.canPublish,
    elevenlabsConfigured: deps.voice.configured,
  };
}

async function nextVersionNumber(tx: DbOrTx, agentId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${agentConfigVersions.version}), 0)` })
    .from(agentConfigVersions)
    .where(eq(agentConfigVersions.agentId, agentId));
  return Number(row?.max ?? 0) + 1;
}

/** Guarda (o actualiza) el único borrador del agente. No afecta al agente en vivo. */
export async function saveDraft(
  tx: Tx,
  hotelId: string,
  input: { config: AgentConfig; notes?: string },
  actor: Actor,
): Promise<AgentVersionDetail> {
  const agent = await getHotelAgent(tx, hotelId);
  const compiled = compileAgent(input.config);
  const review = reviewConfig(input.config, compiled);
  const values = {
    config: input.config as unknown as Record<string, unknown>,
    compiledPrompt: compiled.prompt,
    firstMessage: compiled.firstMessage,
    baseLayerVersion: compiled.baseLayerVersion,
    review,
    notes: input.notes ?? null,
  };
  const [existing] = await tx
    .select()
    .from(agentConfigVersions)
    .where(and(eq(agentConfigVersions.agentId, agent.id), eq(agentConfigVersions.status, "draft")))
    .limit(1);
  let row: VersionRow | undefined;
  if (existing) {
    [row] = await tx.update(agentConfigVersions).set(values).where(eq(agentConfigVersions.id, existing.id)).returning();
  } else {
    [row] = await tx
      .insert(agentConfigVersions)
      .values({ ...values, agentId: agent.id, hotelId, version: await nextVersionNumber(tx, agent.id), status: "draft", createdBy: actor.userId })
      .returning();
  }
  if (!row) throw new AppError("internal", "No se pudo guardar el borrador");
  return toDetail(row, await userNames(tx, [row.createdBy, row.publishedBy]));
}

export async function discardDraft(tx: Tx, hotelId: string): Promise<void> {
  const agent = await getHotelAgent(tx, hotelId);
  await tx
    .delete(agentConfigVersions)
    .where(and(eq(agentConfigVersions.agentId, agent.id), eq(agentConfigVersions.status, "draft")));
}

export async function reviewVersion(deps: Deps, config: AgentConfig): Promise<ReviewResult> {
  const compiled = compileAgent(config);
  const items = reviewConfig(config, compiled);
  let usedAi = false;
  if (deps.aiReviewer) {
    try {
      const extra = await deps.aiReviewer.review({ config, compiled, baseLayer: BASE_LAYER });
      // La IA solo avisa: nunca bloquea la publicación por sí sola.
      items.push(...extra.map((i) => ({ ...i, severity: i.severity === "error" ? ("warning" as const) : i.severity })));
      usedAi = true;
    } catch (err) {
      deps.log.warn({ err }, "La revisión con IA falló; sigo con la revisión automática");
    }
  }
  return { items, blocking: hasBlocking(items), usedAi };
}

/**
 * Pide publicar una versión. Queda "publicando" y el worker la envía a ElevenLabs; si falla,
 * queda "falló" con el motivo y el agente en vivo sigue con la versión anterior.
 */
export async function requestPublish(
  deps: Deps,
  tx: Tx,
  hotelId: string,
  input: { versionId: string; notes?: string },
  actor: Actor,
): Promise<AgentVersionSummary> {
  const agent = await getHotelAgent(tx, hotelId);
  const [version] = await tx
    .select()
    .from(agentConfigVersions)
    .where(and(eq(agentConfigVersions.id, input.versionId), eq(agentConfigVersions.agentId, agent.id)))
    .limit(1);
  if (!version) throw new AppError("not_found", "Versión no encontrada");
  if (version.status !== "draft" && version.status !== "failed") {
    throw new AppError("conflict", "Esta versión ya se publicó o se está publicando");
  }
  const [busy] = await tx
    .select({ id: agentConfigVersions.id })
    .from(agentConfigVersions)
    .where(and(eq(agentConfigVersions.agentId, agent.id), eq(agentConfigVersions.status, "publishing")))
    .limit(1);
  if (busy && busy.id !== version.id) throw new AppError("conflict", "Ya hay una publicación en curso. Esperá unos segundos.");

  const config = parseConfig(version.config);
  const review = await reviewVersion(deps, config);
  if (review.blocking) {
    throw new AppError("validation_failed", "Hay cosas para corregir antes de publicar", review.items);
  }
  const compiled = compileAgent(config);
  const [updated] = await tx
    .update(agentConfigVersions)
    .set({
      status: "publishing",
      compiledPrompt: compiled.prompt,
      firstMessage: compiled.firstMessage,
      baseLayerVersion: compiled.baseLayerVersion,
      review: review.items,
      error: null,
      notes: input.notes ?? version.notes,
      publishedBy: actor.userId,
    })
    .where(eq(agentConfigVersions.id, version.id))
    .returning();
  if (!updated) throw new AppError("internal", "No se pudo pedir la publicación");
  await enqueue(tx, {
    queue: "agent.publish",
    hotelId,
    payload: { versionId: version.id },
    dedupeKey: `agent.publish:${version.id}:${Date.now()}`,
    maxAttempts: 4,
  });
  await audit(tx, {
    organizationId: hotelId,
    actorUserId: actor.userId,
    action: "agent.publish_requested",
    targetType: "agent_version",
    targetId: version.id,
    after: { version: version.version, notes: input.notes ?? null },
    ip: actor.ip,
    viaStaff: actor.viaStaff,
  });
  return toSummary(updated, await userNames(tx, [updated.createdBy, updated.publishedBy]));
}

/** "Restaurar": crea una versión nueva con la configuración de una anterior y la publica. */
export async function restoreVersion(
  deps: Deps,
  tx: Tx,
  hotelId: string,
  versionId: string,
  actor: Actor,
): Promise<AgentVersionSummary> {
  const agent = await getHotelAgent(tx, hotelId);
  const [old] = await tx
    .select()
    .from(agentConfigVersions)
    .where(and(eq(agentConfigVersions.id, versionId), eq(agentConfigVersions.agentId, agent.id)))
    .limit(1);
  if (!old) throw new AppError("not_found", "Versión no encontrada");
  const config = parseConfig(old.config);
  const compiled = compileAgent(config);
  const [created] = await tx
    .insert(agentConfigVersions)
    .values({
      agentId: agent.id,
      hotelId,
      version: await nextVersionNumber(tx, agent.id),
      status: "failed",
      config: config as unknown as Record<string, unknown>,
      compiledPrompt: compiled.prompt,
      firstMessage: compiled.firstMessage,
      baseLayerVersion: compiled.baseLayerVersion,
      notes: `Restaurada desde la versión ${old.version}`,
      createdBy: actor.userId,
    })
    .returning();
  if (!created) throw new AppError("internal", "No se pudo restaurar");
  await audit(tx, {
    organizationId: hotelId,
    actorUserId: actor.userId,
    action: "agent.restore",
    targetType: "agent_version",
    targetId: created.id,
    before: { fromVersion: old.version },
    ip: actor.ip,
    viaStaff: actor.viaStaff,
  });
  return requestPublish(deps, tx, hotelId, { versionId: created.id, notes: `Restaurada desde la versión ${old.version}` }, actor);
}

export async function listVersions(tx: Tx, hotelId: string): Promise<AgentVersionSummary[]> {
  const agent = await getHotelAgent(tx, hotelId);
  const rows = await tx
    .select()
    .from(agentConfigVersions)
    .where(eq(agentConfigVersions.agentId, agent.id))
    .orderBy(desc(agentConfigVersions.version))
    .limit(200);
  const names = await userNames(tx, rows.flatMap((r) => [r.createdBy, r.publishedBy]));
  return rows.map((r) => toSummary(r, names));
}

export async function getVersion(tx: Tx, hotelId: string, versionId: string): Promise<AgentVersionDetail> {
  const agent = await getHotelAgent(tx, hotelId);
  const [row] = await tx
    .select()
    .from(agentConfigVersions)
    .where(and(eq(agentConfigVersions.id, versionId), eq(agentConfigVersions.agentId, agent.id)))
    .limit(1);
  if (!row) throw new AppError("not_found", "Versión no encontrada");
  return toDetail(row, await userNames(tx, [row.createdBy, row.publishedBy]));
}

/** Lo ejecuta el worker: envía la versión a ElevenLabs y la deja publicada. */
export async function performPublish(deps: Deps, versionId: string): Promise<void> {
  const db: Db = deps.db;
  const [version] = await db.select().from(agentConfigVersions).where(eq(agentConfigVersions.id, versionId)).limit(1);
  if (!version || version.status !== "publishing") return;
  const [agent] = await db.select().from(agents).where(eq(agents.id, version.agentId)).limit(1);
  if (!agent) return;
  const config = parseConfig(version.config);
  const compiled = compileAgent(config);

  let warning: string | null = null;
  if (!agent.elevenlabsAgentId) {
    warning = "Publicada en CERGO, pero el hotel todavía no tiene un agente de ElevenLabs asignado.";
  } else if (!deps.voice.configured) {
    warning = "Publicada en CERGO, pero no se envió a ElevenLabs porque falta configurar la API key.";
  } else {
    try {
      await deps.voice.updateAgent(agent.elevenlabsAgentId, {
        prompt: compiled.prompt,
        firstMessage: compiled.firstMessage,
        language: compiled.language,
        voiceId: config.voiceId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = (err as { retryable?: boolean }).retryable !== false;
      if (!retryable) {
        await db
          .update(agentConfigVersions)
          .set({ status: "failed", error: `ElevenLabs rechazó el cambio: ${message}` })
          .where(eq(agentConfigVersions.id, version.id));
        return;
      }
      throw err;
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(agentConfigVersions)
      .set({ status: "archived" })
      .where(and(eq(agentConfigVersions.agentId, agent.id), eq(agentConfigVersions.status, "published")));
    await tx
      .update(agentConfigVersions)
      .set({ status: "published", publishedAt: new Date(), error: warning })
      .where(eq(agentConfigVersions.id, version.id));
    await tx.update(agents).set({ publishedVersionId: version.id }).where(eq(agents.id, agent.id));
    // El horario de recepción publicado se usa para medir las llamadas fuera de horario.
    await tx
      .update(organizations)
      .set({
        settings: sql`jsonb_set(coalesce(${organizations.settings}, '{}'::jsonb), '{receptionHours}', ${JSON.stringify(config.receptionHours)}::jsonb)`,
      })
      .where(eq(organizations.id, version.hotelId));
    await audit(tx, {
      organizationId: version.hotelId,
      actorUserId: version.publishedBy,
      action: "agent.published",
      targetType: "agent_version",
      targetId: version.id,
      after: { version: version.version, warning },
    });
  });
}

/** Marca como fallida una publicación que agotó sus reintentos. */
export async function markPublishFailed(db: Db, versionId: string, error: string): Promise<void> {
  await db
    .update(agentConfigVersions)
    .set({ status: "failed", error: `No se pudo publicar: ${error}`.slice(0, 1000) })
    .where(and(eq(agentConfigVersions.id, versionId), eq(agentConfigVersions.status, "publishing")));
}

export type { TestSession };

/**
 * Prueba en el navegador. Si el hotel tiene agente de prueba, se le carga el borrador y se habla
 * con él. Si no, se habla con el agente real pasando el borrador como "override" (hay que
 * habilitar overrides en ElevenLabs) y la llamada queda marcada como prueba.
 */
export async function createTestSession(deps: Deps, tx: Tx, hotelId: string, config: AgentConfig): Promise<TestSession> {
  if (!deps.voice.configured) {
    throw new AppError("unavailable", "La prueba por voz necesita la API key de ElevenLabs configurada en CERGO.");
  }
  const agent = await getHotelAgent(tx, hotelId);
  const compiled = compileAgent(config);
  if (agent.elevenlabsTestAgentId) {
    await deps.voice.updateAgent(agent.elevenlabsTestAgentId, {
      prompt: compiled.prompt,
      firstMessage: compiled.firstMessage,
      language: compiled.language,
      voiceId: config.voiceId,
    });
    return { mode: "test_agent", signedUrl: await deps.voice.getSignedUrl(agent.elevenlabsTestAgentId) };
  }
  if (!agent.elevenlabsAgentId) {
    throw new AppError("unavailable", "Este hotel todavía no tiene un agente de ElevenLabs asignado.");
  }
  return {
    mode: "overrides",
    signedUrl: await deps.voice.getSignedUrl(agent.elevenlabsAgentId),
    overrides: { prompt: compiled.prompt, firstMessage: compiled.firstMessage, language: compiled.language },
    dynamicVariables: { cergo_test: "1" },
  };
}
