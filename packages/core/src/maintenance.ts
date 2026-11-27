import { and, authTokens, callMessages, calls, eq, inArray, isNotNull, lt, organizations, or, sql, webhookEvents } from "@cergo/db";
import { deleteExpiredSessions } from "./auth/sessions";
import type { Deps } from "./deps";
import { purgeFinishedJobs } from "./queue/queue";

export type MaintenanceReport = {
  sessions: number;
  tokens: number;
  jobs: number;
  webhookEvents: number;
  recordings: number;
  transcripts: number;
};

/**
 * Limpieza diaria (la encola el worker una vez por día). Respeta la retención de cada hotel:
 * pasado ese plazo se borran grabaciones y transcripciones, y quedan solo los datos agregados.
 */
export async function runDailyMaintenance(deps: Deps, batch = 500): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { sessions: 0, tokens: 0, jobs: 0, webhookEvents: 0, recordings: 0, transcripts: 0 };
  report.sessions = await deleteExpiredSessions(deps.db);
  const tokens = await deps.db
    .delete(authTokens)
    .where(or(lt(authTokens.expiresAt, sql`now() - interval '7 days'`), lt(authTokens.usedAt, sql`now() - interval '7 days'`)))
    .returning({ id: authTokens.id });
  report.tokens = tokens.length;
  report.jobs = await purgeFinishedJobs(deps.db, 7);
  const events = await deps.db
    .delete(webhookEvents)
    .where(and(isNotNull(webhookEvents.processedAt), lt(webhookEvents.receivedAt, sql`now() - interval '30 days'`)))
    .returning({ id: webhookEvents.id });
  report.webhookEvents = events.length;

  const hotels = await deps.db.select({ id: organizations.id, settings: organizations.settings }).from(organizations).where(eq(organizations.kind, "hotel"));
  for (const hotel of hotels) {
    const months = Math.max(1, hotel.settings?.retentionMonths ?? 12);
    const cutoff = sql`now() - (${months} * interval '1 month')`;
    const withAudio = await deps.db
      .select({ id: calls.id, audioKey: calls.audioKey })
      .from(calls)
      .where(and(eq(calls.hotelId, hotel.id), isNotNull(calls.audioKey), lt(calls.startedAt, cutoff)))
      .limit(batch);
    for (const c of withAudio) {
      try {
        if (c.audioKey) await deps.storage.delete(c.audioKey);
        await deps.db.update(calls).set({ audioKey: null }).where(eq(calls.id, c.id));
        report.recordings++;
      } catch (err) {
        deps.log.warn({ err, callId: c.id }, "No se pudo borrar la grabación vencida");
      }
    }
    const old = await deps.db
      .select({ id: calls.id })
      .from(calls)
      .where(
        and(
          eq(calls.hotelId, hotel.id),
          lt(calls.startedAt, cutoff),
          sql`exists (select 1 from call_messages m where m.call_id = ${calls.id})`,
        ),
      )
      .limit(batch);
    if (old.length) {
      const deleted = await deps.db
        .delete(callMessages)
        .where(inArray(callMessages.callId, old.map((c) => c.id)))
        .returning({ id: callMessages.id });
      report.transcripts += deleted.length;
    }
  }
  deps.log.info({ report }, "Mantenimiento diario");
  return report;
}
