import {
  agentConfigSchema,
  type AgentConfig,
  type AvailabilityToolInput,
  type BookingToolInput,
  type HandoffToolInput,
  type QuoteToolInput,
  type Room,
} from "@cergo/contracts";
import { agentConfigVersions, agents, eq, organizations, withTenant } from "@cergo/db";
import { formatMonthDay } from "../agent/compose";
import { createBookingFromAgent, createQuoteRecord, findRoom, quoteStay } from "../bookings/service";
import { sha256 } from "../crypto";
import type { Deps } from "../deps";
import { AppError } from "../errors";
import { createHandoffFromAgent } from "../handoffs/service";
import { isWithinSchedule, localDay } from "../hours";

/**
 * Server tools que el agente de ElevenLabs llama en medio de la llamada. Cada respuesta trae un
 * `message` pensado para que el agente lo diga en voz alta (o lo use para responder), en el
 * idioma del hotel, sin siglas raras ("dólares", no "USD"), más los datos estructurados.
 */

export type ToolContext = {
  hotelId: string;
  hotelName: string;
  timezone: string;
  agentId: string;
  config: AgentConfig | null;
};

export type ToolResponse = { ok: boolean; message: string; [key: string]: unknown };

/** Valida el token Bearer con el que el agente llama a CERGO. Cada hotel tiene el suyo. */
export async function authenticateTool(deps: Deps, bearer: string | null | undefined): Promise<ToolContext> {
  const token = bearer?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 20 || token.length > 200) throw new AppError("unauthorized", "Token de herramienta inválido");
  const [row] = await deps.db
    .select({
      agentId: agents.id,
      hotelId: agents.hotelId,
      publishedVersionId: agents.publishedVersionId,
      hotelName: organizations.name,
      timezone: organizations.timezone,
      status: organizations.status,
    })
    .from(agents)
    .innerJoin(organizations, eq(organizations.id, agents.hotelId))
    .where(eq(agents.toolTokenHash, sha256(token)))
    .limit(1);
  if (!row) throw new AppError("unauthorized", "Token de herramienta inválido");
  if (row.status === "cancelled") throw new AppError("forbidden", "El servicio de este hotel está dado de baja");
  let config: AgentConfig | null = null;
  if (row.publishedVersionId) {
    const [v] = await deps.db
      .select({ config: agentConfigVersions.config })
      .from(agentConfigVersions)
      .where(eq(agentConfigVersions.id, row.publishedVersionId))
      .limit(1);
    const parsed = agentConfigSchema.safeParse(v?.config);
    if (parsed.success) config = parsed.data;
  }
  return { hotelId: row.hotelId, hotelName: row.hotelName, timezone: row.timezone, agentId: row.agentId, config };
}

const money = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} dólares`;
const spokenDay = (iso: string) => formatMonthDay(iso.slice(5));
const isTest = (v: string | undefined) => v === "1" || v === "true";

/** "2 adultos", "hasta 4 personas"... toma el primer número como capacidad máxima, si lo hay. */
export function roomCapacity(room: Room): number | null {
  const m = room.capacity.match(/\d+/);
  return m ? Number(m[0]) : null;
}

function noConfig(): ToolResponse {
  return {
    ok: false,
    message:
      "Todavía no tengo cargadas las tarifas del hotel. Ofrecé tomar los datos del huésped y derivar la consulta a recepción.",
  };
}

function validateDates(ctx: ToolContext, checkIn: string, checkOut: string): ToolResponse | null {
  const today = localDay(new Date(), ctx.timezone);
  if (checkIn < today) {
    return { ok: false, message: `La fecha de entrada (${spokenDay(checkIn)}) ya pasó. Confirmá las fechas con el huésped.` };
  }
  if (checkOut <= checkIn) {
    return { ok: false, message: "La fecha de salida tiene que ser posterior a la de entrada. Confirmá las fechas con el huésped." };
  }
  return null;
}

export async function quoteTool(deps: Deps, ctx: ToolContext, input: QuoteToolInput): Promise<ToolResponse> {
  if (!ctx.config) return noConfig();
  const invalid = validateDates(ctx, input.check_in, input.check_out);
  if (invalid) return invalid;
  let result: ReturnType<typeof quoteStay>;
  try {
    result = quoteStay(ctx.config, { checkIn: input.check_in, checkOut: input.check_out, roomType: input.room_type });
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: `${err.message}. Ofrecé derivar a recepción.` };
    throw err;
  }
  const guests = input.adults + input.children;
  const fits = (name: string) => {
    const room = ctx.config!.rooms.find((r) => r.name === name);
    const cap = room ? roomCapacity(room) : null;
    return cap === null || cap >= guests;
  };
  const options = result.options.filter((o) => fits(o.room));
  const tooSmall = result.options.filter((o) => !fits(o.room)).map((o) => o.room);
  const range = `del ${spokenDay(input.check_in)} al ${spokenDay(input.check_out)} (${result.nights} ${result.nights === 1 ? "noche" : "noches"})`;

  if (result.unknownRoom) {
    const names = ctx.config.rooms.map((r) => r.name).join(", ");
    return { ok: false, message: `No encontré la habitación "${input.room_type}". Las opciones son: ${names}.`, rooms: names };
  }
  if (!options.length) {
    const why = tooSmall.length
      ? `Para ${guests} personas no alcanza una sola habitación de las disponibles; puede hacer falta más de una.`
      : "No hay tarifas cargadas para esas habitaciones.";
    return { ok: false, message: `${why} Ofrecé derivar la consulta a recepción para armar la propuesta.`, unpriced: result.unpriced };
  }

  if (!isTest(input.cergo_test)) {
    const best = options[0]!;
    await withTenant(deps.db, ctx.hotelId, (tx) =>
      createQuoteRecord(tx, ctx.hotelId, {
        conversationId: input.conversation_id,
        checkIn: input.check_in,
        checkOut: input.check_out,
        nights: result.nights,
        adults: input.adults,
        children: input.children,
        roomType: input.room_type ? best.room : null,
        totalUsd: input.room_type ? best.totalUsd : null,
      }),
    );
  }

  const lines = options
    .slice(0, 4)
    .map((o) => `${o.room}: ${money(o.totalUsd)} en total (${money(o.avgNightUsd)} por noche${o.highSeasonNights ? `, ${o.highSeasonNights} en temporada alta` : ""})`);
  return {
    ok: true,
    message: `Tarifas ${range} para ${guests} ${guests === 1 ? "persona" : "personas"}: ${lines.join("; ")}. Son precios por habitación y están sujetos a disponibilidad: la confirma recepción.`,
    nights: result.nights,
    options,
    ...(tooSmall.length ? { notSuitableForGroupSize: tooSmall } : {}),
  };
}

export async function bookingTool(deps: Deps, ctx: ToolContext, input: BookingToolInput): Promise<ToolResponse> {
  if (!ctx.config) return noConfig();
  const invalid = validateDates(ctx, input.check_in, input.check_out);
  if (invalid) return invalid;
  const room = findRoom(ctx.config.rooms, input.room_type);
  if (!room) {
    const names = ctx.config.rooms.map((r) => r.name).join(", ");
    return { ok: false, message: `No encontré la habitación "${input.room_type}". Las opciones son: ${names}. Confirmá con el huésped.` };
  }
  const cap = roomCapacity(room);
  const guests = input.adults + input.children;
  if (cap !== null && guests > cap) {
    return {
      ok: false,
      message: `La ${room.name} es para hasta ${cap} personas y son ${guests}. Ofrecé otra habitación o más de una, o derivá a recepción.`,
    };
  }
  let total: number | null = null;
  let nights: number;
  try {
    const q = quoteStay(ctx.config, { checkIn: input.check_in, checkOut: input.check_out, roomType: room.name });
    nights = q.nights;
    total = q.options[0]?.totalUsd ?? null;
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: `${err.message}. Ofrecé derivar a recepción.` };
    throw err;
  }
  const range = `del ${spokenDay(input.check_in)} al ${spokenDay(input.check_out)}`;
  const totalText = total !== null ? ` El total estimado es de ${money(total)}.` : "";
  if (isTest(input.cergo_test)) {
    return { ok: true, test: true, message: `(Prueba: no se guardó) Reserva de ${room.name} ${range} a nombre de ${input.guest_name}.${totalText}` };
  }
  const booking = await withTenant(deps.db, ctx.hotelId, (tx) =>
    createBookingFromAgent(tx, ctx.hotelId, {
      conversationId: input.conversation_id,
      guestName: input.guest_name,
      guestPhone: input.guest_phone,
      guestEmail: input.guest_email,
      checkIn: input.check_in,
      checkOut: input.check_out,
      nights,
      adults: input.adults,
      children: input.children,
      roomType: room.name,
      totalUsd: total,
      notes: input.notes,
    }),
  );
  return {
    ok: true,
    bookingId: booking.id,
    message: `Listo: quedó cargada la reserva de ${room.name} ${range} a nombre de ${input.guest_name}.${totalText} Recepción la confirma y le envía el link de pago al ${input.guest_phone}.`,
  };
}

export async function handoffTool(deps: Deps, ctx: ToolContext, input: HandoffToolInput): Promise<ToolResponse> {
  const open = ctx.config ? isWithinSchedule(new Date(), ctx.config.receptionHours, ctx.timezone) : true;
  if (isTest(input.cergo_test)) {
    return { ok: true, test: true, message: "(Prueba: no se avisó a nadie) Recepción recibiría este pendiente." };
  }
  const handoff = await withTenant(deps.db, ctx.hotelId, (tx) =>
    createHandoffFromAgent(tx, ctx.hotelId, {
      conversationId: input.conversation_id,
      guestName: input.guest_name,
      guestPhone: input.guest_phone,
      reason: input.reason,
      summary: input.summary,
      urgency: input.urgency,
    }),
  );
  const when =
    input.urgency === "emergency"
      ? "Ya le avisé a recepción como emergencia."
      : open
        ? "Ya le pasé la consulta a recepción y te van a contactar a la brevedad."
        : "Ya le dejé la consulta a recepción; ahora está fuera de horario, así que te contactan apenas abran.";
  return { ok: true, handoffId: handoff.id, receptionOpen: open, message: when };
}

export async function availabilityTool(deps: Deps, ctx: ToolContext, input: AvailabilityToolInput): Promise<ToolResponse> {
  const invalid = validateDates(ctx, input.check_in, input.check_out);
  if (invalid) return invalid;
  const rows = await deps.pms.availability(ctx.hotelId, {
    checkIn: input.check_in,
    checkOut: input.check_out,
    adults: input.adults,
    children: input.children,
  });
  if (rows === null) {
    return {
      ok: true,
      connected: false,
      message:
        "No tengo la disponibilidad en línea. Podés cotizar y dejar la reserva cargada: recepción confirma la disponibilidad y envía el link de pago.",
    };
  }
  const available = rows.filter((r) => r.available > 0);
  if (!available.length) {
    return { ok: true, connected: true, available: [], message: "Para esas fechas no hay habitaciones disponibles. Ofrecé otras fechas o derivar a recepción." };
  }
  return {
    ok: true,
    connected: true,
    available,
    message: `Hay disponibilidad en: ${available.map((r) => r.roomType).join(", ")}.`,
  };
}
