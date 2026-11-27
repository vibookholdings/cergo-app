import {
  agentConfigSchema,
  bookingsQuery,
  callsQuery,
  commentInput,
  dashboardQuery,
  handoffsQuery,
  hotelSettingsInput,
  inviteInput,
  publishInput,
  restoreInput,
  saveDraftInput,
  updateBookingInput,
  updateHandoffInput,
  updateMemberInput,
  type BookingListItem,
  type HotelContext,
} from "@cergo/contracts";
import {
  addHandoffComment,
  AppError,
  bookingsToCsv,
  createTestSession,
  discardDraft,
  getAgentState,
  getBooking,
  getCallAudio,
  getCallDetail,
  getDashboard,
  getHandoff,
  getHotelSettings,
  getVersion,
  inviteMember,
  listBookings,
  listCalls,
  listHandoffs,
  listPendingInvites,
  listTeam,
  listVersions,
  pendingBookings,
  removeMember,
  requestPublish,
  restoreVersion,
  reviewVersion,
  revokeInvite,
  saveDraft,
  updateBooking,
  updateHandoff,
  updateHotelSettings,
  updateMember,
} from "@cergo/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../context";
import { noContent, rateLimit, readJson, readQuery } from "../http";
import { actorOf, currentSession, inHotel, loadHotel, need, requireUser } from "../session";

const uuid = z.string().uuid();
const idParam = (raw: string | undefined) => {
  const parsed = uuid.safeParse(raw);
  if (!parsed.success) throw new AppError("not_found", "No encontrado");
  return parsed.data;
};

export const hotelRoutes = new Hono<AppEnv>()
  .use("*", requireUser(), loadHotel)

  .get("/", (c) => {
    const { allowNonOwnersToDraft: _ignored, ...ctx } = c.get("hotel");
    return c.json(ctx satisfies HotelContext);
  })

  // Inicio
  .get("/dashboard", need("dashboard:view"), async (c) => {
    const { range } = readQuery(c, dashboardQuery);
    const hotel = c.get("hotel");
    const perms = hotel.permissions;
    const data = await inHotel(c, async (tx) => {
      const open = perms.includes("handoffs:view") ? (await listHandoffs(tx, hotel.id, { status: "open", limit: 5 })).items : [];
      const pending = perms.includes("bookings:view") ? await pendingBookings(tx, hotel.id, 5) : [];
      return getDashboard(tx, hotel, range, { openHandoffs: open, pendingBookings: pending });
    });
    return c.json(data);
  })

  // Llamadas
  .get("/calls", need("calls:view"), async (c) => {
    const q = readQuery(c, callsQuery);
    const hotel = c.get("hotel");
    return c.json(await inHotel(c, (tx) => listCalls(tx, hotel, q)));
  })
  .get("/calls/:id", need("calls:view"), async (c) => {
    const id = idParam(c.req.param("id"));
    return c.json(await inHotel(c, (tx) => getCallDetail(tx, c.get("hotel").id, id)));
  })
  .get("/calls/:id/audio", need("calls:view"), async (c) => {
    const id = idParam(c.req.param("id"));
    const deps = c.get("deps");
    const audio = await inHotel(c, (tx) => getCallAudio(deps, tx, c.get("hotel").id, id));
    if (audio.url) return c.redirect(audio.url, 302);
    const bytes = await deps.storage.get(audio.key);
    if (!bytes) throw new AppError("not_found", "La grabación ya no está disponible");
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, { "content-type": "audio/mpeg", "cache-control": "private, max-age=300" });
  })

  // Pendientes para recepción
  .get("/handoffs", need("handoffs:view"), async (c) => {
    const q = readQuery(c, handoffsQuery);
    return c.json(await inHotel(c, (tx) => listHandoffs(tx, c.get("hotel").id, q)));
  })
  .get("/handoffs/:id", need("handoffs:view"), async (c) => {
    const id = idParam(c.req.param("id"));
    return c.json(await inHotel(c, (tx) => getHandoff(tx, c.get("hotel").id, id)));
  })
  .patch("/handoffs/:id", need("handoffs:manage"), async (c) => {
    const id = idParam(c.req.param("id"));
    const input = await readJson(c, updateHandoffInput);
    return c.json(await inHotel(c, (tx) => updateHandoff(tx, c.get("hotel").id, id, input, actorOf(c))));
  })
  .post("/handoffs/:id/comments", need("handoffs:manage"), async (c) => {
    const id = idParam(c.req.param("id"));
    const { body } = await readJson(c, commentInput);
    return c.json(await inHotel(c, (tx) => addHandoffComment(tx, c.get("hotel").id, id, body, actorOf(c))));
  })

  // Reservas y cotizaciones
  .get("/bookings", need("bookings:view"), async (c) => {
    const q = readQuery(c, bookingsQuery);
    return c.json(await inHotel(c, (tx) => listBookings(tx, c.get("hotel").id, q)));
  })
  .get("/bookings/export.csv", need("bookings:export"), rateLimit("export", 10, 60_000), async (c) => {
    const q = readQuery(c, bookingsQuery.omit({ cursor: true, limit: true }));
    const items = await inHotel(c, async (tx) => {
      const all: BookingListItem[] = [];
      let cursor: string | undefined;
      do {
        const page = await listBookings(tx, c.get("hotel").id, { ...q, limit: 100, cursor });
        all.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor && all.length < 10_000);
      return all;
    });
    return c.body(bookingsToCsv(items), 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="reservas-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
  })
  .get("/bookings/:id", need("bookings:view"), async (c) => {
    const id = idParam(c.req.param("id"));
    return c.json(await inHotel(c, (tx) => getBooking(tx, c.get("hotel").id, id)));
  })
  .patch("/bookings/:id", need("bookings:manage"), async (c) => {
    const id = idParam(c.req.param("id"));
    const input = await readJson(c, updateBookingInput);
    return c.json(await inHotel(c, (tx) => updateBooking(tx, c.get("hotel").id, id, input, actorOf(c))));
  })

  // Configuración del agente (dos capas, borrador y publicación)
  .get("/agent", need("agent:view"), async (c) => {
    const perms = c.get("hotel").permissions;
    return c.json(
      await inHotel(c, (tx) =>
        getAgentState(c.get("deps"), tx, c.get("hotel").id, { canDraft: perms.includes("agent:draft"), canPublish: perms.includes("agent:publish") }),
      ),
    );
  })
  .put("/agent/draft", need("agent:draft"), async (c) => {
    const input = await readJson(c, saveDraftInput);
    return c.json(await inHotel(c, (tx) => saveDraft(tx, c.get("hotel").id, input, actorOf(c))));
  })
  .delete("/agent/draft", need("agent:draft"), async (c) => {
    await inHotel(c, (tx) => discardDraft(tx, c.get("hotel").id));
    return noContent(c);
  })
  .post("/agent/review", need("agent:draft"), rateLimit("review", 20, 60_000), async (c) => {
    const { config } = await readJson(c, z.object({ config: agentConfigSchema }));
    return c.json(await reviewVersion(c.get("deps"), config));
  })
  .post("/agent/publish", need("agent:publish"), async (c) => {
    const input = await readJson(c, publishInput);
    return c.json(await inHotel(c, (tx) => requestPublish(c.get("deps"), tx, c.get("hotel").id, input, actorOf(c))));
  })
  .post("/agent/restore", need("agent:publish"), async (c) => {
    const { versionId } = await readJson(c, restoreInput);
    return c.json(await inHotel(c, (tx) => restoreVersion(c.get("deps"), tx, c.get("hotel").id, versionId, actorOf(c))));
  })
  .get("/agent/versions", need("agent:view"), async (c) => {
    return c.json(await inHotel(c, (tx) => listVersions(tx, c.get("hotel").id)));
  })
  .get("/agent/versions/:id", need("agent:view"), async (c) => {
    const id = idParam(c.req.param("id"));
    return c.json(await inHotel(c, (tx) => getVersion(tx, c.get("hotel").id, id)));
  })
  .post("/agent/test-session", need("agent:draft"), rateLimit("voice-test", 10, 10 * 60_000), async (c) => {
    const { config } = await readJson(c, z.object({ config: agentConfigSchema }));
    return c.json(await inHotel(c, (tx) => createTestSession(c.get("deps"), tx, c.get("hotel").id, config)));
  })

  // Equipo
  .get("/team", need("team:manage"), async (c) => {
    const deps = c.get("deps");
    const hotelId = c.get("hotel").id;
    const [members, invites] = await Promise.all([
      listTeam(deps.db, hotelId, currentSession(c).userId),
      listPendingInvites(deps.db, hotelId),
    ]);
    return c.json({
      members,
      invites: invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
    });
  })
  .post("/team/invites", need("team:manage"), rateLimit("invites", 30, 60 * 60_000), async (c) => {
    const input = await readJson(c, inviteInput);
    const actor = actorOf(c);
    await inviteMember(c.get("deps"), { hotelId: c.get("hotel").id, email: input.email, role: input.role, invitedBy: { id: actor.userId, name: actor.name } });
    return c.body(null, 201);
  })
  .delete("/team/invites/:id", need("team:manage"), async (c) => {
    await revokeInvite(c.get("deps").db, c.get("hotel").id, idParam(c.req.param("id")));
    return noContent(c);
  })
  .patch("/team/members/:id", need("team:manage"), async (c) => {
    const input = await readJson(c, updateMemberInput);
    await updateMember(c.get("deps").db, c.get("hotel").id, idParam(c.req.param("id")), input, actorOf(c));
    return noContent(c);
  })
  .delete("/team/members/:id", need("team:manage"), async (c) => {
    await removeMember(c.get("deps").db, c.get("hotel").id, idParam(c.req.param("id")), actorOf(c));
    return noContent(c);
  })

  // Ajustes del hotel
  .get("/settings", need("hotel:settings"), async (c) => {
    return c.json(await inHotel(c, (tx) => getHotelSettings(tx, c.get("hotel").id)));
  })
  .put("/settings", need("hotel:settings"), async (c) => {
    const input = await readJson(c, hotelSettingsInput);
    return c.json(await inHotel(c, (tx) => updateHotelSettings(tx, c.get("hotel").id, input, actorOf(c))));
  });
