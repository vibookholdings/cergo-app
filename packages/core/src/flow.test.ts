import { agentConfigSchema, type AgentConfig } from "@cergo/contracts";
import { bookings, callMessages, calls, dailyStats, eq, handoffs, jobs, sql, withTenant } from "@cergo/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { performPublish, requestPublish, saveDraft } from "./agent/service";
import { processWebhookEvent, receiveElevenlabsEvent } from "./calls/ingest";
import { getCallDetail, listCalls } from "./calls/queries";
import { addDays, localDay } from "./hours";
import { notifyBooking, notifyHandoff } from "./notifications/service";
import { getDashboard } from "./stats/service";
import { createHotelFixture, createTestDeps, resetDatabase } from "./testing";
import { authenticateTool, bookingTool, handoffTool, quoteTool } from "./tools/service";

const deps = createTestDeps();
afterAll(() => deps.close());

const TZ = "America/Argentina/Buenos_Aires";
const today = () => localDay(new Date(), TZ);

function demoConfig(): AgentConfig {
  return agentConfigSchema.parse({
    hotel: { name: "Casa del Lago", city: "Bariloche", checkIn: "15:00", checkOut: "11:00" },
    greeting: "Hola, buenas, {{hotel_nombre}}, te habla el asistente de recepción. ¿En qué te puedo ayudar?",
    rooms: [
      { name: "Doble Estándar", capacity: "2 adultos", rateUsd: 110, highSeasonRateUsd: 150 },
      { name: "Suite Lago", capacity: "2 adultos", rateUsd: 220, highSeasonRateUsd: 300 },
      { name: "Cabaña Familiar", capacity: "hasta 5 personas", rateUsd: 260, highSeasonRateUsd: 350 },
    ],
    highSeason: [
      { from: "07-01", to: "08-31" },
      { from: "12-20", to: "02-28" },
    ],
    faq: [{ question: "¿Aceptan mascotas?", answer: "Sí, mascotas pequeñas con aviso previo." }],
    receptionHours: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] },
  });
}

async function setupPublishedHotel() {
  const fx = await createHotelFixture(deps, { name: "Casa del Lago", elevenlabsAgentId: "agent_casa_lago" });
  const actor = { userId: fx.staffId };
  const draft = await withTenant(deps.db, fx.hotelId, (tx) => saveDraft(tx, fx.hotelId, { config: demoConfig() }, actor));
  await withTenant(deps.db, fx.hotelId, (tx) => requestPublish(deps, tx, fx.hotelId, { versionId: draft.id }, actor));
  await performPublish(deps, draft.id);
  return fx;
}

function postCallPayload(conversationId: string, startedAt: Date) {
  return {
    type: "post_call_transcription",
    event_timestamp: Math.floor(Date.now() / 1000),
    data: {
      agent_id: "agent_casa_lago",
      conversation_id: conversationId,
      status: "done",
      transcript: [
        { role: "agent", message: "Hola, buenas, Casa del Lago. ¿En qué te puedo ayudar?", time_in_call_secs: 0 },
        { role: "user", message: "Hola, quiero hacer un reclamo por un cobro de la factura", time_in_call_secs: 4 },
        { role: "agent", message: "", time_in_call_secs: 9, tool_calls: [{ tool_name: "derivar_a_recepcion" }] },
        { role: "agent", message: "Ya le pasé la consulta a recepción.", time_in_call_secs: 12 },
      ],
      metadata: { start_time_unix_secs: Math.floor(startedAt.getTime() / 1000), call_duration_secs: 95, phone_call: { external_number: "+5492944000000" } },
      analysis: { call_successful: "success", transcript_summary: "Reclamo por un cobro; se derivó a recepción." },
    },
  };
}

describe("flujo completo de una llamada", () => {
  beforeEach(() => resetDatabase(deps.db));

  it("cotiza, reserva y deriva con las server tools", async () => {
    const fx = await setupPublishedHotel();
    const ctx = await authenticateTool(deps, `Bearer ${fx.toolToken}`);
    expect(ctx.config?.rooms).toHaveLength(3);

    const checkIn = addDays(today(), 40);
    const checkOut = addDays(checkIn, 3);
    const quote = await quoteTool(deps, ctx, { check_in: checkIn, check_out: checkOut, adults: 2, children: 0, conversation_id: "conv-1" });
    expect(quote.ok).toBe(true);
    expect(quote.message).toContain("dólares");

    const booking = await bookingTool(deps, ctx, {
      conversation_id: "conv-1",
      guest_name: "Laura Pérez",
      guest_phone: "+54 9 294 400-0000",
      check_in: checkIn,
      check_out: checkOut,
      adults: 2,
      children: 0,
      room_type: "suite lago",
    });
    expect(booking.ok).toBe(true);
    const [b] = await deps.db.select().from(bookings).where(eq(bookings.kind, "booking"));
    expect(b?.roomType).toBe("Suite Lago");
    expect(b?.status).toBe("pending");

    const tooMany = await bookingTool(deps, ctx, {
      guest_name: "Grupo",
      guest_phone: "1234567",
      check_in: checkIn,
      check_out: checkOut,
      adults: 4,
      children: 0,
      room_type: "Doble Estándar",
    });
    expect(tooMany.ok).toBe(false);

    const past = await quoteTool(deps, ctx, { check_in: addDays(today(), -3), check_out: today(), adults: 2, children: 0 });
    expect(past.ok).toBe(false);

    const test = await bookingTool(deps, ctx, {
      cergo_test: "1",
      guest_name: "Prueba",
      guest_phone: "1234567",
      check_in: checkIn,
      check_out: checkOut,
      adults: 2,
      children: 0,
      room_type: "Suite Lago",
    });
    expect(test.ok).toBe(true);
    expect(await deps.db.select().from(bookings).where(eq(bookings.kind, "booking"))).toHaveLength(1);

    await expect(authenticateTool(deps, "Bearer cergo_tool_token-que-no-existe-xxxxxx")).rejects.toThrow(/inválido/);
  });

  it("el webhook post-llamada es idempotente y arma la llamada con su derivación", async () => {
    const fx = await setupPublishedHotel();
    const ctx = await authenticateTool(deps, fx.toolToken);
    await handoffTool(deps, ctx, { conversation_id: "conv-42", reason: "Reclamo por un cobro", urgency: "high", guest_phone: "+5492944000000" });

    const payload = postCallPayload("conv-42", new Date());
    const first = await receiveElevenlabsEvent(deps, payload);
    const second = await receiveElevenlabsEvent(deps, payload);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);

    await processWebhookEvent(deps, first.eventId!);
    await processWebhookEvent(deps, first.eventId!); // reprocesar no duplica nada

    const allCalls = await deps.db.select().from(calls);
    expect(allCalls).toHaveLength(1);
    const call = allCalls[0]!;
    expect(call.outcome).toBe("handed_off");
    expect(call.reason).toBe("complaint");
    expect(call.handedOff).toBe(true);
    expect(call.afterHours).toBe(true); // el horario de recepción está vacío: todo es fuera de horario
    expect(Number(call.costUsd)).toBeCloseTo(0.1583, 3);
    const msgs = await deps.db.select().from(callMessages).where(eq(callMessages.callId, call.id));
    expect(msgs).toHaveLength(4);
    expect(msgs.find((m) => m.toolName)?.text).toContain("derivar_a_recepcion");

    const [h] = await deps.db.select().from(handoffs);
    expect(h?.callId).toBe(call.id);

    const [stats] = await deps.db.select().from(dailyStats);
    expect(stats?.calls).toBe(1);
    expect(stats?.handedOff).toBe(1);

    const detail = await withTenant(deps.db, fx.hotelId, (tx) => getCallDetail(tx, fx.hotelId, call.id));
    expect(detail.handoffs).toHaveLength(1);
    const search = await withTenant(deps.db, fx.hotelId, (tx) =>
      listCalls(tx, { id: fx.hotelId, timezone: TZ }, { q: "factura", limit: 10 }),
    );
    expect(search.items).toHaveLength(1);
    const none = await withTenant(deps.db, fx.hotelId, (tx) => listCalls(tx, { id: fx.hotelId, timezone: TZ }, { q: "piscina", limit: 10 }));
    expect(none.items).toHaveLength(0);

    const dash = await withTenant(deps.db, fx.hotelId, (tx) =>
      getDashboard(tx, { id: fx.hotelId, timezone: TZ, monthlyMinutes: 400 }, "7d", { openHandoffs: [], pendingBookings: [] }),
    );
    expect(dash.totals.calls).toBe(1);
    expect(dash.series).toHaveLength(7);
  });

  it("los avisos salen una sola vez y por la cola", async () => {
    const fx = await setupPublishedHotel();
    const ctx = await authenticateTool(deps, fx.toolToken);
    await deps.db.execute(
      sql`update organizations set settings = settings || '{"notifyEmails":["recepcion@casadellago.test"]}'::jsonb where id = ${fx.hotelId}`,
    );
    const res = await handoffTool(deps, ctx, { reason: "Pide hablar con una persona", urgency: "normal" });
    const queued = await deps.db.select().from(jobs).where(eq(jobs.queue, "notify.handoff"));
    expect(queued).toHaveLength(1);
    await notifyHandoff(deps, res.handoffId as string);
    await notifyHandoff(deps, res.handoffId as string);
    expect(deps.mailer.sent.filter((m) => m.subject.includes("Pendiente"))).toHaveLength(1);
    expect(deps.mailer.sent.at(-1)?.text).toContain(`/h/${fx.hotelId}/pendientes/`);

    const checkIn = addDays(today(), 10);
    const booked = await bookingTool(deps, ctx, {
      guest_name: "Laura",
      guest_phone: "+5492944111111",
      check_in: checkIn,
      check_out: addDays(checkIn, 2),
      adults: 2,
      children: 0,
      room_type: "Doble Estándar",
    });
    await notifyBooking(deps, booked.bookingId as string);
    await notifyBooking(deps, booked.bookingId as string);
    expect(deps.mailer.sent.filter((m) => m.subject.includes("reserva"))).toHaveLength(1);
  });
});
