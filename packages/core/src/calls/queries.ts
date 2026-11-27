import type { CallDetail, CallListItem, CallsQuery, Paginated } from "@cergo/contracts";
import { and, asc, bookings, callMessages, calls, desc, eq, gte, lt, or, sql, type DbOrTx } from "@cergo/db";
import type { Deps } from "../deps";
import { AppError } from "../errors";
import { toBookingItem } from "../bookings/service";
import { listHandoffsForCall } from "../handoffs/service";
import { decodeCursor, encodeCursor } from "../pagination";

type CallRow = typeof calls.$inferSelect;

const toItem = (r: CallRow): CallListItem => ({
  id: r.id,
  startedAt: r.startedAt.toISOString(),
  callerNumber: r.callerNumber,
  durationSecs: r.durationSecs,
  language: r.language,
  reason: r.reason,
  outcome: r.outcome,
  summary: r.summary,
  handedOff: r.handedOff,
  afterHours: r.afterHours,
  isTest: r.isTest,
  status: r.status,
});

/**
 * Historial de llamadas con filtros y búsqueda en lo que se dijo. Pagina por (fecha, id), así que
 * rinde igual con 100 llamadas que con 10 millones. `from`/`to` son días en la zona del hotel.
 */
export async function listCalls(
  tx: DbOrTx,
  hotel: { id: string; timezone: string },
  q: CallsQuery,
): Promise<Paginated<CallListItem>> {
  const conds = [eq(calls.hotelId, hotel.id)];
  if (q.from) conds.push(gte(calls.startedAt, sql`(${q.from}::date)::timestamp at time zone ${hotel.timezone}`));
  if (q.to) conds.push(lt(calls.startedAt, sql`((${q.to}::date + 1)::timestamp) at time zone ${hotel.timezone}`));
  if (q.reason) conds.push(eq(calls.reason, q.reason));
  if (q.outcome) conds.push(eq(calls.outcome, q.outcome));
  if (q.language) conds.push(eq(calls.language, q.language));
  if (q.handedOff) conds.push(eq(calls.handedOff, q.handedOff === "true"));
  if (q.test === "only") conds.push(eq(calls.isTest, true));
  else if (q.test !== "include") conds.push(eq(calls.isTest, false));
  if (q.q) {
    const term = q.q.trim();
    const digits = term.replace(/\D/g, "");
    conds.push(
      or(
        sql`exists (select 1 from call_messages m where m.call_id = ${calls.id}
              and to_tsvector('simple', m.text) @@ plainto_tsquery('simple', ${term}))`,
        sql`${calls.summary} ilike ${`%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`,
        ...(digits.length >= 4 ? [sql`regexp_replace(coalesce(${calls.callerNumber}, ''), '\\D', '', 'g') like ${`%${digits}%`}`] : []),
      )!,
    );
  }
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(calls.startedAt, cur.at), and(eq(calls.startedAt, cur.at), lt(calls.id, cur.id)))!);

  const rows = await tx
    .select()
    .from(calls)
    .where(and(...conds))
    .orderBy(desc(calls.startedAt), desc(calls.id))
    .limit(q.limit + 1);
  const last = rows.length > q.limit ? rows[q.limit - 1] : undefined;
  return { items: rows.slice(0, q.limit).map(toItem), nextCursor: last ? encodeCursor(last.startedAt, last.id) : null };
}

export async function getCallDetail(tx: DbOrTx, hotelId: string, id: string): Promise<CallDetail> {
  const [row] = await tx.select().from(calls).where(and(eq(calls.id, id), eq(calls.hotelId, hotelId))).limit(1);
  if (!row) throw new AppError("not_found", "Llamada no encontrada");
  const messages = await tx
    .select({ seq: callMessages.seq, role: callMessages.role, text: callMessages.text, timeSecs: callMessages.timeSecs, toolName: callMessages.toolName })
    .from(callMessages)
    .where(eq(callMessages.callId, row.id))
    .orderBy(asc(callMessages.seq));
  const linkedBookings = await tx.select().from(bookings).where(and(eq(bookings.hotelId, hotelId), eq(bookings.callId, row.id)));
  return {
    ...toItem(row),
    conversationId: row.conversationId,
    hasAudio: Boolean(row.audioKey),
    costUsd: row.costUsd === null ? null : Number(row.costUsd),
    messages,
    handoffs: await listHandoffsForCall(tx, hotelId, row.id),
    bookings: linkedBookings.map(toBookingItem),
  };
}

/** Dónde escuchar la grabación: una URL firmada de corta duración, o `null` si se sirve desde la API. */
export async function getCallAudio(
  deps: Deps,
  tx: DbOrTx,
  hotelId: string,
  id: string,
): Promise<{ url: string | null; key: string }> {
  const [row] = await tx
    .select({ audioKey: calls.audioKey })
    .from(calls)
    .where(and(eq(calls.id, id), eq(calls.hotelId, hotelId)))
    .limit(1);
  if (!row) throw new AppError("not_found", "Llamada no encontrada");
  if (!row.audioKey) throw new AppError("not_found", "Esta llamada no tiene grabación");
  return { url: await deps.storage.signedUrl(row.audioKey, 300), key: row.audioKey };
}
