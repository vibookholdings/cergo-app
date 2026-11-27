import type { AgentConfig, BookingListItem, BookingStatus, Paginated, Room } from "@cergo/contracts";
import { and, bookings, desc, eq, gte, inArray, lt, lte, or, organizations, type DbOrTx, type Tx } from "@cergo/db";
import { audit } from "../audit";
import { AppError } from "../errors";
import { addDays, daysBetween, localDay } from "../hours";
import { decodeCursor, encodeCursor } from "../pagination";
import { enqueue } from "../queue/queue";
import { recomputeDailyStats } from "../stats/service";

type BookingRow = typeof bookings.$inferSelect;

export const toBookingItem = (r: BookingRow): BookingListItem => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
  kind: r.kind,
  status: r.status,
  guestName: r.guestName,
  guestPhone: r.guestPhone,
  guestEmail: r.guestEmail,
  checkIn: r.checkIn,
  checkOut: r.checkOut,
  nights: r.nights,
  adults: r.adults,
  children: r.children,
  roomType: r.roomType,
  totalUsd: r.totalUsd === null ? null : Number(r.totalUsd),
  callId: r.callId,
  notes: r.notes,
  pmsId: r.pmsId,
});

// ---------------------------------------------------------------------------
// Cotización
// ---------------------------------------------------------------------------

/** ¿La fecha (AAAA-MM-DD) cae en alguno de los rangos MM-DD de temporada alta? Soporta rangos que cruzan el año. */
export function isHighSeason(day: string, ranges: AgentConfig["highSeason"]): boolean {
  const md = day.slice(5);
  return ranges.some((r) => (r.from <= r.to ? md >= r.from && md <= r.to : md >= r.from || md <= r.to));
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export function findRoom(rooms: Room[], wanted: string | undefined): Room | undefined {
  if (!wanted) return undefined;
  const w = normalize(wanted);
  return (
    rooms.find((r) => normalize(r.name) === w) ??
    rooms.find((r) => normalize(r.name).includes(w) || w.includes(normalize(r.name))) ??
    rooms.find((r) => w.split(/\s+/).filter((t) => t.length > 3).every((t) => normalize(r.name).includes(t)))
  );
}

export type QuoteOption = { room: string; nights: number; avgNightUsd: number; totalUsd: number; highSeasonNights: number };

export function quoteStay(
  config: AgentConfig,
  input: { checkIn: string; checkOut: string; roomType?: string },
): { nights: number; options: QuoteOption[]; unknownRoom: boolean; unpriced: string[] } {
  const nights = daysBetween(input.checkIn, input.checkOut);
  if (!Number.isFinite(nights) || nights < 1) throw new AppError("validation_failed", "La fecha de salida tiene que ser posterior a la de entrada");
  if (nights > 60) throw new AppError("validation_failed", "Para estadías de más de 60 noches tiene que intervenir recepción");
  const wanted = findRoom(config.rooms, input.roomType);
  const candidates = input.roomType ? (wanted ? [wanted] : []) : config.rooms;
  const unpriced: string[] = [];
  const options: QuoteOption[] = [];
  for (const room of candidates) {
    if (room.rateUsd === null) {
      unpriced.push(room.name);
      continue;
    }
    let total = 0;
    let high = 0;
    for (let i = 0; i < nights; i++) {
      const day = addDays(input.checkIn, i);
      const isHigh = isHighSeason(day, config.highSeason);
      if (isHigh) high++;
      total += isHigh && room.highSeasonRateUsd !== null ? room.highSeasonRateUsd : room.rateUsd;
    }
    options.push({ room: room.name, nights, totalUsd: Math.round(total * 100) / 100, avgNightUsd: Math.round((total / nights) * 100) / 100, highSeasonNights: high });
  }
  options.sort((a, b) => a.totalUsd - b.totalUsd);
  return { nights, options, unknownRoom: Boolean(input.roomType && !wanted), unpriced };
}

// ---------------------------------------------------------------------------
// Alta desde el agente
// ---------------------------------------------------------------------------

async function hotelTimezone(tx: DbOrTx, hotelId: string): Promise<string> {
  const [h] = await tx.select({ tz: organizations.timezone }).from(organizations).where(eq(organizations.id, hotelId)).limit(1);
  return h?.tz ?? "America/Argentina/Buenos_Aires";
}

export async function createQuoteRecord(
  tx: Tx,
  hotelId: string,
  input: { conversationId?: string; checkIn: string; checkOut: string; nights: number; adults: number; children: number; roomType: string | null; totalUsd: number | null },
): Promise<void> {
  await tx.insert(bookings).values({
    hotelId,
    kind: "quote",
    status: "quoted",
    conversationId: input.conversationId ?? null,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: input.nights,
    adults: input.adults,
    children: input.children,
    roomType: input.roomType,
    totalUsd: input.totalUsd === null ? null : input.totalUsd.toFixed(2),
  });
  const tz = await hotelTimezone(tx, hotelId);
  await recomputeDailyStats(tx, hotelId, localDay(new Date(), tz), tz);
}

export async function createBookingFromAgent(
  tx: Tx,
  hotelId: string,
  input: {
    conversationId?: string;
    guestName: string;
    guestPhone: string;
    guestEmail?: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    adults: number;
    children: number;
    roomType: string;
    totalUsd: number | null;
    notes?: string;
  },
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(bookings)
    .values({
      hotelId,
      kind: "booking",
      status: "pending",
      conversationId: input.conversationId ?? null,
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      guestEmail: input.guestEmail ?? null,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights: input.nights,
      adults: input.adults,
      children: input.children,
      roomType: input.roomType,
      totalUsd: input.totalUsd === null ? null : input.totalUsd.toFixed(2),
      notes: input.notes ?? null,
    })
    .returning({ id: bookings.id });
  if (!row) throw new AppError("internal", "No se pudo cargar la reserva");
  await enqueue(tx, { queue: "notify.booking", hotelId, payload: { bookingId: row.id }, dedupeKey: `notify.booking:${row.id}` });
  const tz = await hotelTimezone(tx, hotelId);
  await recomputeDailyStats(tx, hotelId, localDay(new Date(), tz), tz);
  return row;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export async function listBookings(
  tx: DbOrTx,
  hotelId: string,
  q: { status?: BookingStatus; kind?: "quote" | "booking"; from?: string; to?: string; limit: number; cursor?: string },
): Promise<Paginated<BookingListItem>> {
  const conds = [eq(bookings.hotelId, hotelId)];
  if (q.status) conds.push(eq(bookings.status, q.status));
  if (q.kind) conds.push(eq(bookings.kind, q.kind));
  if (q.from) conds.push(gte(bookings.checkIn, q.from));
  if (q.to) conds.push(lte(bookings.checkIn, q.to));
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(bookings.createdAt, cur.at), and(eq(bookings.createdAt, cur.at), lt(bookings.id, cur.id)))!);
  const rows = await tx.select().from(bookings).where(and(...conds)).orderBy(desc(bookings.createdAt), desc(bookings.id)).limit(q.limit + 1);
  const last = rows.length > q.limit ? rows[q.limit - 1] : undefined;
  return { items: rows.slice(0, q.limit).map(toBookingItem), nextCursor: last ? encodeCursor(last.createdAt, last.id) : null };
}

export async function pendingBookings(tx: DbOrTx, hotelId: string, limit = 5): Promise<BookingListItem[]> {
  const rows = await tx
    .select()
    .from(bookings)
    .where(and(eq(bookings.hotelId, hotelId), eq(bookings.kind, "booking"), inArray(bookings.status, ["pending"])))
    .orderBy(desc(bookings.createdAt))
    .limit(limit);
  return rows.map(toBookingItem);
}

export async function getBooking(tx: DbOrTx, hotelId: string, id: string): Promise<BookingListItem> {
  const [row] = await tx.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.hotelId, hotelId))).limit(1);
  if (!row) throw new AppError("not_found", "Reserva no encontrada");
  return toBookingItem(row);
}

export async function updateBooking(
  tx: Tx,
  hotelId: string,
  id: string,
  input: { status?: BookingStatus; notes?: string | null; pmsId?: string | null },
  actor: { userId: string; ip?: string | null; viaStaff?: boolean },
): Promise<BookingListItem> {
  const [before] = await tx.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.hotelId, hotelId))).limit(1);
  if (!before) throw new AppError("not_found", "Reserva no encontrada");
  const [row] = await tx
    .update(bookings)
    .set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.pmsId !== undefined ? { pmsId: input.pmsId } : {}),
    })
    .where(eq(bookings.id, id))
    .returning();
  if (!row) throw new AppError("internal", "No se pudo actualizar");
  if (input.status && input.status !== before.status) {
    const tz = await hotelTimezone(tx, hotelId);
    await recomputeDailyStats(tx, hotelId, localDay(before.createdAt, tz), tz);
  }
  await audit(tx, {
    organizationId: hotelId,
    actorUserId: actor.userId,
    action: "booking.update",
    targetType: "booking",
    targetId: id,
    before: { status: before.status, notes: before.notes, pmsId: before.pmsId },
    after: { status: row.status, notes: row.notes, pmsId: row.pmsId },
    ip: actor.ip,
    viaStaff: actor.viaStaff,
  });
  return toBookingItem(row);
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Evita inyección de fórmulas al abrir el CSV en Excel o Sheets.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function bookingsToCsv(items: BookingListItem[]): string {
  const header = ["Creada", "Tipo", "Estado", "Huésped", "Teléfono", "Mail", "Entrada", "Salida", "Noches", "Adultos", "Menores", "Habitación", "Total USD", "ID PMS", "Notas"];
  const lines = items.map((b) =>
    [b.createdAt, b.kind === "quote" ? "Cotización" : "Reserva", b.status, b.guestName, b.guestPhone, b.guestEmail, b.checkIn, b.checkOut, b.nights, b.adults, b.children, b.roomType, b.totalUsd, b.pmsId, b.notes]
      .map(csvCell)
      .join(","),
  );
  // BOM al principio para que Excel lea bien los acentos.
  return `\uFEFF${[header.join(","), ...lines].join("\n")}\n`;
}
