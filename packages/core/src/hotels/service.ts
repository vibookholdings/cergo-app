import {
  emptyAgentConfig,
  type AdminHotelRow,
  type HotelSettingsInput,
  type HotelSettingsView,
  type VersionStatus,
} from "@cergo/contracts";
import {
  agentConfigVersions,
  agents,
  and,
  eq,
  organizations,
  phoneLines,
  sql,
  type Db,
  type DbOrTx,
} from "@cergo/db";
import { compileAgent } from "../agent/compose";
import { reviewConfig } from "../agent/review";
import { audit } from "../audit";
import { inviteMember } from "../auth/service";
import { randomToken, sha256 } from "../crypto";
import type { Deps } from "../deps";
import { AppError } from "../errors";

type Actor = { userId: string; name?: string; ip?: string | null; viaStaff?: boolean };

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Ajustes del hotel (los edita el dueño)
// ---------------------------------------------------------------------------

export async function getHotelSettings(tx: DbOrTx, hotelId: string): Promise<HotelSettingsView> {
  const [h] = await tx.select().from(organizations).where(eq(organizations.id, hotelId)).limit(1);
  if (!h) throw new AppError("not_found", "Hotel no encontrado");
  const s = h.settings ?? {};
  return {
    id: h.id,
    name: h.name,
    city: h.city ?? "",
    timezone: h.timezone,
    plan: h.plan,
    monthlyMinutes: h.monthlyMinutes,
    notifyEmails: s.notifyEmails ?? [],
    notifyWhatsapp: s.notifyWhatsapp ?? null,
    retentionMonths: s.retentionMonths ?? 12,
    allowNonOwnersToDraft: s.allowNonOwnersToDraft ?? false,
  };
}

export async function updateHotelSettings(tx: DbOrTx, hotelId: string, input: HotelSettingsInput, actor: Actor): Promise<HotelSettingsView> {
  if (!isValidTimezone(input.timezone)) throw new AppError("validation_failed", "Zona horaria inválida");
  const before = await getHotelSettings(tx, hotelId);
  const [h] = await tx.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, hotelId)).limit(1);
  await tx
    .update(organizations)
    .set({
      name: input.name,
      city: input.city || null,
      timezone: input.timezone,
      settings: {
        ...(h?.settings ?? {}),
        notifyEmails: input.notifyEmails,
        notifyWhatsapp: input.notifyWhatsapp,
        retentionMonths: input.retentionMonths,
        allowNonOwnersToDraft: input.allowNonOwnersToDraft,
      },
    })
    .where(eq(organizations.id, hotelId));
  await audit(tx, {
    organizationId: hotelId,
    actorUserId: actor.userId,
    action: "hotel.settings",
    targetType: "organization",
    targetId: hotelId,
    before,
    after: input,
    ip: actor.ip,
    viaStaff: actor.viaStaff,
  });
  return getHotelSettings(tx, hotelId);
}

// ---------------------------------------------------------------------------
// Panel interno de CERGO
// ---------------------------------------------------------------------------

export async function adminListHotels(db: Db): Promise<AdminHotelRow[]> {
  const res = await db.execute<{
    id: string;
    name: string;
    city: string | null;
    status: string;
    plan: string;
    monthly_minutes: number;
    minutes_this_month: number;
    calls_last_7d: number;
    last_call_at: Date | string | null;
    failed_webhooks_24h: number;
    open_handoffs: number;
    agent_status: string | null;
    elevenlabs_agent_id: string | null;
    phone_numbers: string[] | null;
  }>(sql`
    select o.id, o.name, o.city, o.status, o.plan, o.monthly_minutes,
      coalesce((select sum(d.duration_secs) from daily_stats d
        where d.hotel_id = o.id and d.day >= date_trunc('month', now() at time zone o.timezone)::date), 0)::int / 60 as minutes_this_month,
      coalesce((select sum(d.calls) from daily_stats d
        where d.hotel_id = o.id and d.day >= (now() at time zone o.timezone)::date - 6), 0)::int as calls_last_7d,
      (select max(c.started_at) from calls c where c.hotel_id = o.id and c.is_test = false) as last_call_at,
      (select count(*) from webhook_events w
        where w.error is not null and w.processed_at is null and w.received_at > now() - interval '24 hours'
          and w.payload -> 'data' ->> 'agent_id' in (a.elevenlabs_agent_id, a.elevenlabs_test_agent_id))::int as failed_webhooks_24h,
      (select count(*) from handoffs h where h.hotel_id = o.id and h.status in ('new', 'in_progress'))::int as open_handoffs,
      coalesce(
        (select v.status::text from agent_config_versions v
          where v.agent_id = a.id and v.status in ('publishing', 'failed')
            and v.version > coalesce((select p.version from agent_config_versions p where p.id = a.published_version_id), 0)
          order by v.version desc limit 1),
        case when a.published_version_id is not null then 'published' end,
        (select v.status::text from agent_config_versions v where v.agent_id = a.id order by v.version desc limit 1)
      ) as agent_status,
      a.elevenlabs_agent_id,
      (select array_agg(pl.number order by pl.created_at) from phone_lines pl where pl.hotel_id = o.id and pl.active) as phone_numbers
    from organizations o
    left join lateral (select * from agents ag where ag.hotel_id = o.id order by ag.created_at limit 1) a on true
    where o.kind = 'hotel'
    order by o.name
  `);
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    status: r.status,
    plan: r.plan,
    monthlyMinutes: Number(r.monthly_minutes),
    minutesThisMonth: Number(r.minutes_this_month),
    callsLast7d: Number(r.calls_last_7d),
    lastCallAt: r.last_call_at ? new Date(r.last_call_at).toISOString() : null,
    failedWebhooks24h: Number(r.failed_webhooks_24h),
    openHandoffs: Number(r.open_handoffs),
    agentStatus: (r.agent_status ?? "none") as VersionStatus | "none",
    elevenlabsAgentId: r.elevenlabs_agent_id,
    phoneNumbers: r.phone_numbers ?? [],
  }));
}

export type AdminHotelDetail = {
  hotel: { id: string; name: string; city: string | null; timezone: string; status: string; plan: string; monthlyMinutes: number; parentId: string | null };
  agent: { id: string; elevenlabsAgentId: string | null; elevenlabsTestAgentId: string | null; toolTokenHint: string | null } | null;
  phoneLines: { id: string; number: string; provider: string; forwarding: string; active: boolean }[];
};

export async function adminGetHotel(db: Db, hotelId: string): Promise<AdminHotelDetail> {
  const [h] = await db.select().from(organizations).where(and(eq(organizations.id, hotelId), eq(organizations.kind, "hotel"))).limit(1);
  if (!h) throw new AppError("not_found", "Hotel no encontrado");
  const [a] = await db.select().from(agents).where(eq(agents.hotelId, hotelId)).orderBy(agents.createdAt).limit(1);
  const lines = await db.select().from(phoneLines).where(eq(phoneLines.hotelId, hotelId)).orderBy(phoneLines.createdAt);
  return {
    hotel: { id: h.id, name: h.name, city: h.city, timezone: h.timezone, status: h.status, plan: h.plan, monthlyMinutes: h.monthlyMinutes, parentId: h.parentId },
    agent: a ? { id: a.id, elevenlabsAgentId: a.elevenlabsAgentId, elevenlabsTestAgentId: a.elevenlabsTestAgentId, toolTokenHint: a.toolTokenHint } : null,
    phoneLines: lines.map((l) => ({ id: l.id, number: l.number, provider: l.provider, forwarding: l.forwarding, active: l.active })),
  };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "hotel"
  );
}

async function uniqueSlug(tx: DbOrTx, name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const [taken] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!taken) return slug;
  }
  throw new AppError("conflict", "No se pudo generar un identificador para el hotel");
}

/** Token que el agente usa para llamar a las server tools. Se muestra una sola vez. */
export const newToolToken = () => `cergo_tool_${randomToken(24)}`;

export async function createHotel(
  deps: Deps,
  input: {
    name: string;
    city: string;
    timezone: string;
    plan: string;
    monthlyMinutes: number;
    parentId?: string | null;
    elevenlabsAgentId?: string;
    phoneNumber?: string;
    ownerEmail?: string;
  },
  actor: Actor,
): Promise<{ hotelId: string; toolToken: string; inviteUrl: string | null }> {
  if (!isValidTimezone(input.timezone)) throw new AppError("validation_failed", "Zona horaria inválida");
  const toolToken = newToolToken();
  let hotelId: string;
  try {
    hotelId = await deps.db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          kind: "hotel",
          name: input.name,
          slug: await uniqueSlug(tx, input.name),
          city: input.city || null,
          timezone: input.timezone,
          plan: input.plan,
          monthlyMinutes: input.monthlyMinutes,
          parentId: input.parentId ?? null,
          status: "trial",
          settings: { notifyEmails: [], retentionMonths: 12, allowNonOwnersToDraft: false },
        })
        .returning({ id: organizations.id });
      if (!org) throw new AppError("internal", "No se pudo crear el hotel");
      const [agent] = await tx
        .insert(agents)
        .values({
          hotelId: org.id,
          elevenlabsAgentId: input.elevenlabsAgentId || null,
          toolTokenHash: sha256(toolToken),
          toolTokenHint: toolToken.slice(-4),
        })
        .returning({ id: agents.id });
      if (!agent) throw new AppError("internal", "No se pudo crear el agente");
      const config = emptyAgentConfig(input.name, input.city);
      const compiled = compileAgent(config);
      await tx.insert(agentConfigVersions).values({
        agentId: agent.id,
        hotelId: org.id,
        version: 1,
        status: "draft",
        config: config as unknown as Record<string, unknown>,
        compiledPrompt: compiled.prompt,
        firstMessage: compiled.firstMessage,
        baseLayerVersion: compiled.baseLayerVersion,
        review: reviewConfig(config, compiled),
        notes: "Configuración inicial",
        createdBy: actor.userId,
      });
      if (input.phoneNumber) await tx.insert(phoneLines).values({ hotelId: org.id, number: input.phoneNumber });
      await audit(tx, {
        organizationId: org.id,
        actorUserId: actor.userId,
        action: "hotel.create",
        targetType: "organization",
        targetId: org.id,
        after: { name: input.name, plan: input.plan, elevenlabsAgentId: input.elevenlabsAgentId ?? null },
        ip: actor.ip,
        viaStaff: true,
      });
      return org.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("conflict", "Ese agente de ElevenLabs o ese número ya están asignados a otro hotel");
    throw err;
  }
  let inviteUrl: string | null = null;
  if (input.ownerEmail) {
    ({ inviteUrl } = await inviteMember(deps, {
      hotelId,
      email: input.ownerEmail,
      role: "owner",
      invitedBy: { id: actor.userId, name: actor.name ?? "El equipo de CERGO" },
    }));
  }
  return { hotelId, toolToken, inviteUrl };
}

export async function rotateToolToken(db: Db, hotelId: string, actor: Actor): Promise<{ toolToken: string }> {
  const toolToken = newToolToken();
  const updated = await db
    .update(agents)
    .set({ toolTokenHash: sha256(toolToken), toolTokenHint: toolToken.slice(-4) })
    .where(eq(agents.hotelId, hotelId))
    .returning({ id: agents.id });
  if (!updated.length) throw new AppError("not_found", "Este hotel no tiene agente");
  await audit(db, { organizationId: hotelId, actorUserId: actor.userId, action: "agent.rotate_tool_token", viaStaff: true, ip: actor.ip });
  return { toolToken };
}

export async function updateAgentIds(
  db: Db,
  hotelId: string,
  input: { elevenlabsAgentId?: string | null; elevenlabsTestAgentId?: string | null },
  actor: Actor,
): Promise<void> {
  const patch: Partial<typeof agents.$inferInsert> = {};
  if (input.elevenlabsAgentId !== undefined) patch.elevenlabsAgentId = input.elevenlabsAgentId || null;
  if (input.elevenlabsTestAgentId !== undefined) patch.elevenlabsTestAgentId = input.elevenlabsTestAgentId || null;
  if (!Object.keys(patch).length) return;
  try {
    const updated = await db.update(agents).set(patch).where(eq(agents.hotelId, hotelId)).returning({ id: agents.id });
    if (!updated.length) throw new AppError("not_found", "Este hotel no tiene agente");
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("conflict", "Ese agente de ElevenLabs ya está asignado a otro hotel");
    throw err;
  }
  await audit(db, { organizationId: hotelId, actorUserId: actor.userId, action: "agent.update_ids", after: input, viaStaff: true, ip: actor.ip });
}

export async function addPhoneLine(
  db: Db,
  hotelId: string,
  input: { number: string; provider: "twilio" | "sip" | "other"; forwarding: "no_answer" | "after_hours" | "always" },
  actor: Actor,
): Promise<void> {
  try {
    await db.insert(phoneLines).values({ hotelId, ...input });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("conflict", "Ese número ya está cargado");
    throw err;
  }
  await audit(db, { organizationId: hotelId, actorUserId: actor.userId, action: "phone_line.add", after: input, viaStaff: true, ip: actor.ip });
}

export async function removePhoneLine(db: Db, hotelId: string, lineId: string, actor: Actor): Promise<void> {
  const deleted = await db
    .delete(phoneLines)
    .where(and(eq(phoneLines.id, lineId), eq(phoneLines.hotelId, hotelId)))
    .returning({ number: phoneLines.number });
  if (!deleted.length) throw new AppError("not_found", "Línea no encontrada");
  await audit(db, { organizationId: hotelId, actorUserId: actor.userId, action: "phone_line.remove", before: deleted[0], viaStaff: true, ip: actor.ip });
}

export async function setHotelStatus(db: Db, hotelId: string, status: "trial" | "active" | "paused" | "cancelled", actor: Actor): Promise<void> {
  await db.update(organizations).set({ status }).where(and(eq(organizations.id, hotelId), eq(organizations.kind, "hotel")));
  await audit(db, { organizationId: hotelId, actorUserId: actor.userId, action: "hotel.status", after: { status }, viaStaff: true, ip: actor.ip });
}
