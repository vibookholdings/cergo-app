import { elevenlabsWebhookSchema, type CallOutcome, type ElevenlabsWebhook, type WeeklySchedule } from "@cergo/contracts";
import {
  agents,
  and,
  bookings,
  callMessages,
  calls,
  eq,
  handoffs,
  isNull,
  or,
  organizations,
  sql,
  webhookEvents,
  withTenant,
  type Tx,
} from "@cergo/db";
import type { Deps } from "../deps";
import { isWithinSchedule, localDay } from "../hours";
import { enqueue } from "../queue/queue";
import { recomputeDailyStats } from "../stats/service";
import { classifyReason, detectLanguage, reasonFromAnalysis } from "./classify";

type WebhookData = ElevenlabsWebhook["data"];

export class NonRetryableError extends Error {
  readonly retryable = false;
}

/** Guarda el evento crudo (idempotente) y encola su procesamiento. Lo llama el endpoint del webhook. */
export async function receiveElevenlabsEvent(
  deps: Deps,
  payload: unknown,
): Promise<{ accepted: boolean; duplicate: boolean; eventId?: string }> {
  const parsed = elevenlabsWebhookSchema.safeParse(payload);
  if (!parsed.success) return { accepted: false, duplicate: false };
  const { type, data } = parsed.data;
  const externalId = `${type}:${data.conversation_id}`;
  let stored: Record<string, unknown> = parsed.data;
  if (type === "post_call_audio" && data.full_audio) {
    // El audio puede pesar varios MB: va directo al bucket y en la base queda solo la referencia.
    const [agent] = await deps.db
      .select({ hotelId: agents.hotelId })
      .from(agents)
      .where(or(eq(agents.elevenlabsAgentId, data.agent_id), eq(agents.elevenlabsTestAgentId, data.agent_id)))
      .limit(1);
    const { full_audio: audio, ...rest } = data;
    if (agent) {
      const key = audioKeyFor(agent.hotelId, data.conversation_id);
      await deps.storage.put(key, Buffer.from(audio, "base64"), "audio/mpeg");
      stored = { ...parsed.data, data: { ...rest, audio_key: key } };
    } else {
      stored = { ...parsed.data, data: { ...rest, audio_key: null } };
    }
  }
  return deps.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(webhookEvents)
      .values({ source: "elevenlabs", externalId, eventType: type, payload: stored })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    const row = inserted[0];
    if (!row) return { accepted: true, duplicate: true };
    await enqueue(tx, { queue: "webhook.process", payload: { eventId: row.id }, dedupeKey: `webhook:${row.id}` });
    return { accepted: true, duplicate: false, eventId: row.id };
  });
}

export async function processWebhookEvent(deps: Deps, eventId: string): Promise<void> {
  const [event] = await deps.db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).limit(1);
  if (!event || event.processedAt) return;
  const parsed = elevenlabsWebhookSchema.safeParse(event.payload);
  if (!parsed.success) {
    await deps.db.update(webhookEvents).set({ error: "Payload inválido", processedAt: new Date() }).where(eq(webhookEvents.id, eventId));
    return;
  }
  const { type, data } = parsed.data;
  const [agent] = await deps.db
    .select()
    .from(agents)
    .where(or(eq(agents.elevenlabsAgentId, data.agent_id), eq(agents.elevenlabsTestAgentId, data.agent_id)))
    .limit(1);
  if (!agent) {
    // Puede ser un agente que todavía no se dio de alta en CERGO: se guarda el error y se puede reprocesar.
    await deps.db
      .update(webhookEvents)
      .set({ error: `Agente desconocido: ${data.agent_id}` })
      .where(eq(webhookEvents.id, eventId));
    throw new NonRetryableError(`Agente de ElevenLabs desconocido: ${data.agent_id}`);
  }

  switch (type) {
    case "post_call_transcription":
      await ingestTranscript(deps, agent, data, event.receivedAt);
      break;
    case "post_call_audio":
      await ingestAudio(deps, agent, data);
      break;
    case "call_initiation_failure":
      await ingestFailure(deps, agent, data, event.receivedAt);
      break;
    default:
      deps.log.info({ type }, "Evento de ElevenLabs ignorado");
  }
  await deps.db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.id, eventId));
}

type AgentRow = typeof agents.$inferSelect;

function dynamicVars(data: WebhookData): Record<string, unknown> {
  return (data.conversation_initiation_client_data?.dynamic_variables ?? {}) as Record<string, unknown>;
}

function isTestCall(data: WebhookData, agent?: AgentRow): boolean {
  if (agent?.elevenlabsTestAgentId && agent.elevenlabsTestAgentId === data.agent_id) return true;
  const v = dynamicVars(data).cergo_test;
  return v === "1" || v === 1 || v === true || v === "true";
}

function callerNumber(data: WebhookData): string | null {
  const fromPhone = data.metadata?.phone_call?.external_number;
  if (fromPhone) return fromPhone;
  const v = dynamicVars(data).system__caller_id;
  return typeof v === "string" && v ? v : null;
}

async function loadHotel(tx: Tx, hotelId: string) {
  const [hotel] = await tx.select().from(organizations).where(eq(organizations.id, hotelId)).limit(1);
  if (!hotel) throw new NonRetryableError("Hotel inexistente");
  return hotel;
}

async function ingestTranscript(deps: Deps, agent: AgentRow, data: WebhookData, receivedAt: Date): Promise<void> {
  const startedAt = data.metadata?.start_time_unix_secs ? new Date(data.metadata.start_time_unix_secs * 1000) : receivedAt;
  const durationSecs = Math.round(data.metadata?.call_duration_secs ?? 0);
  const turns = (data.transcript ?? []).map((t, i) => {
    const tool = t.tool_calls?.find((c) => c.tool_name)?.tool_name ?? null;
    const text = (t.message ?? "").trim();
    return {
      seq: i,
      role: t.role === "user" ? "user" : "agent",
      text: text || (tool ? `[usó la herramienta ${tool}]` : ""),
      timeSecs: t.time_in_call_secs === null || t.time_in_call_secs === undefined ? null : Math.round(t.time_in_call_secs),
      toolName: tool,
    };
  });
  const messages = turns.filter((m) => m.text);
  const guestText = messages.filter((m) => m.role === "user").map((m) => m.text).join(" ");
  const isTest = isTestCall(data, agent);
  const status = data.status === "failed" ? "failed" : "completed";

  const stats = await withTenant(deps.db, agent.hotelId, async (tx) => {
    const hotel = await loadHotel(tx, agent.hotelId);
    const linkedHandoffs = await tx
      .select({ id: handoffs.id })
      .from(handoffs)
      .where(and(eq(handoffs.hotelId, hotel.id), eq(handoffs.conversationId, data.conversation_id)));
    const linkedBookings = await tx
      .select({ id: bookings.id, kind: bookings.kind })
      .from(bookings)
      .where(and(eq(bookings.hotelId, hotel.id), eq(bookings.conversationId, data.conversation_id)));
    const hasHandoff = linkedHandoffs.length > 0;
    const hasBooking = linkedBookings.some((b) => b.kind === "booking");
    const hasQuote = linkedBookings.some((b) => b.kind === "quote");

    const collected = data.analysis?.data_collection_results ?? {};
    const reason =
      reasonFromAnalysis(collected.motivo?.value ?? collected.reason?.value) ??
      classifyReason(guestText, { hasBooking, hasQuote, hasHandoff });

    let outcome: CallOutcome;
    if (status === "failed") outcome = "failed";
    else if (hasHandoff) outcome = "handed_off";
    else if (hasBooking) outcome = "booking";
    else if (hasQuote) outcome = "quote";
    else if (data.analysis?.call_successful === "failure") outcome = "unresolved";
    else outcome = "resolved";

    const language =
      (typeof collected.idioma?.value === "string" ? collected.idioma.value.slice(0, 5) : null) ??
      data.metadata?.main_language?.slice(0, 5) ??
      detectLanguage(guestText) ??
      null;

    const schedule = (hotel.settings?.receptionHours ?? null) as WeeklySchedule | null;
    const afterHours = schedule ? !isWithinSchedule(startedAt, schedule, hotel.timezone) : false;
    const costUsd = ((durationSecs / 60) * deps.config.costPerMinuteUsd).toFixed(4);
    const values = {
      hotelId: hotel.id,
      agentId: agent.id,
      conversationId: data.conversation_id,
      status: status as "completed" | "failed",
      callerNumber: callerNumber(data),
      direction: data.metadata?.phone_call?.direction ?? "inbound",
      startedAt,
      durationSecs,
      language,
      reason,
      outcome,
      summary: data.analysis?.transcript_summary ?? null,
      handedOff: hasHandoff,
      afterHours,
      isTest,
      costUsd,
      analysis: (data.analysis ?? null) as Record<string, unknown> | null,
    };
    const [call] = await tx
      .insert(calls)
      .values(values)
      .onConflictDoUpdate({ target: calls.conversationId, set: { ...values, updatedAt: new Date() } })
      .returning({ id: calls.id, audioKey: calls.audioKey });
    if (!call) throw new Error("No se pudo guardar la llamada");

    await tx.delete(callMessages).where(eq(callMessages.callId, call.id));
    if (messages.length) {
      await tx.insert(callMessages).values(messages.map((m) => ({ ...m, callId: call.id, hotelId: hotel.id })));
    }
    await tx
      .update(handoffs)
      .set({ callId: call.id })
      .where(and(eq(handoffs.conversationId, data.conversation_id), isNull(handoffs.callId)));
    await tx
      .update(bookings)
      .set({ callId: call.id })
      .where(and(eq(bookings.conversationId, data.conversation_id), isNull(bookings.callId)));

    const day = localDay(startedAt, hotel.timezone);
    await recomputeDailyStats(tx, hotel.id, day, hotel.timezone);

    if (!call.audioKey && deps.voice.configured && !isTest) {
      await enqueue(tx, {
        queue: "call.fetch_audio",
        hotelId: hotel.id,
        payload: { callId: call.id, conversationId: data.conversation_id },
        dedupeKey: `audio:${data.conversation_id}`,
        runAt: new Date(Date.now() + 60_000),
        maxAttempts: 5,
      });
    }
    return { callId: call.id };
  });
  deps.log.info({ hotelId: agent.hotelId, callId: stats.callId, conversationId: data.conversation_id }, "Llamada registrada");
}

export function audioKeyFor(hotelId: string, conversationId: string) {
  return `hotels/${hotelId}/calls/${conversationId.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp3`;
}

async function ingestAudio(deps: Deps, agent: AgentRow, data: WebhookData): Promise<void> {
  let key = typeof data.audio_key === "string" ? data.audio_key : null;
  if (!key && data.full_audio) {
    key = audioKeyFor(agent.hotelId, data.conversation_id);
    await deps.storage.put(key, Buffer.from(data.full_audio, "base64"), "audio/mpeg");
  }
  if (!key) return;
  const audioKey = key;
  const updated = await withTenant(deps.db, agent.hotelId, (tx) =>
    tx.update(calls).set({ audioKey }).where(eq(calls.conversationId, data.conversation_id)).returning({ id: calls.id }),
  );
  // El audio puede llegar antes que la transcripción: se reintenta hasta que exista la llamada.
  if (!updated.length) throw new Error("La llamada todavía no está registrada; se reintenta el audio");
}

/** Trabajo `call.fetch_audio`: baja el audio de ElevenLabs y lo guarda en el bucket. */
export async function fetchCallAudio(deps: Deps, hotelId: string, callId: string, conversationId: string): Promise<void> {
  const audio = await deps.voice.fetchConversationAudio(conversationId);
  if (!audio) return;
  const key = audioKeyFor(hotelId, conversationId);
  await deps.storage.put(key, audio, "audio/mpeg");
  await withTenant(deps.db, hotelId, async (tx) => {
    await tx.update(calls).set({ audioKey: key }).where(eq(calls.id, callId));
  });
}

async function ingestFailure(deps: Deps, agent: AgentRow, data: WebhookData, receivedAt: Date): Promise<void> {
  await withTenant(deps.db, agent.hotelId, async (tx) => {
    const hotel = await loadHotel(tx, agent.hotelId);
    const startedAt = data.metadata?.start_time_unix_secs ? new Date(data.metadata.start_time_unix_secs * 1000) : receivedAt;
    await tx
      .insert(calls)
      .values({
        hotelId: hotel.id,
        agentId: agent.id,
        conversationId: data.conversation_id,
        status: "failed",
        outcome: "failed",
        callerNumber: callerNumber(data),
        startedAt,
        summary: "La llamada no se pudo iniciar.",
        isTest: isTestCall(data, agent),
      })
      .onConflictDoNothing();
    await recomputeDailyStats(tx, hotel.id, localDay(startedAt, hotel.timezone), hotel.timezone);
  });
}

/** Reprocesa eventos que fallaron (por ejemplo, de un agente que se dio de alta después). */
export async function replayFailedEvents(deps: Deps, limit = 100): Promise<number> {
  const rows = await deps.db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(isNull(webhookEvents.processedAt), sql`${webhookEvents.error} is not null`))
    .limit(limit);
  for (const r of rows) {
    await deps.db.update(webhookEvents).set({ error: null }).where(eq(webhookEvents.id, r.id));
    await enqueue(deps.db, { queue: "webhook.process", payload: { eventId: r.id }, dedupeKey: `webhook:${r.id}:replay:${Date.now()}` });
  }
  return rows.length;
}
