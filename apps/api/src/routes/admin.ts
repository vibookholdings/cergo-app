import { adminCreateHotelInput, adminPhoneLineInput, adminUpdateAgentInput } from "@cergo/contracts";
import {
  addPhoneLine,
  adminGetHotel,
  adminListHotels,
  AppError,
  createHotel,
  removePhoneLine,
  replayFailedEvents,
  rotateToolToken,
  setHotelStatus,
  updateAgentIds,
} from "@cergo/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../context";
import { noContent, readJson } from "../http";
import { actorOf, requireStaff, requireUser } from "../session";

const uuid = z.string().uuid();
const hotelIdOf = (raw: string | undefined) => {
  const p = uuid.safeParse(raw);
  if (!p.success) throw new AppError("not_found", "Hotel no encontrado");
  return p.data;
};

/** Panel interno de CERGO: alta de hoteles, agentes, líneas y salud del servicio. Solo staff con 2FA. */
export const adminRoutes = new Hono<AppEnv>()
  .use("*", requireUser(), requireStaff)
  .get("/hotels", async (c) => c.json(await adminListHotels(c.get("deps").db)))
  .post("/hotels", async (c) => {
    const input = await readJson(c, adminCreateHotelInput);
    const res = await createHotel(c.get("deps"), input, actorOf(c));
    return c.json(res, 201);
  })
  .get("/hotels/:id", async (c) => c.json(await adminGetHotel(c.get("deps").db, hotelIdOf(c.req.param("id")))))
  .patch("/hotels/:id/agent", async (c) => {
    const input = await readJson(c, adminUpdateAgentInput);
    await updateAgentIds(c.get("deps").db, hotelIdOf(c.req.param("id")), input, actorOf(c));
    return noContent(c);
  })
  .post("/hotels/:id/tool-token", async (c) => {
    return c.json(await rotateToolToken(c.get("deps").db, hotelIdOf(c.req.param("id")), actorOf(c)));
  })
  .post("/hotels/:id/phone-lines", async (c) => {
    const input = await readJson(c, adminPhoneLineInput);
    await addPhoneLine(c.get("deps").db, hotelIdOf(c.req.param("id")), input, actorOf(c));
    return c.body(null, 201);
  })
  .delete("/hotels/:id/phone-lines/:lineId", async (c) => {
    const lineId = uuid.safeParse(c.req.param("lineId"));
    if (!lineId.success) throw new AppError("not_found", "Línea no encontrada");
    await removePhoneLine(c.get("deps").db, hotelIdOf(c.req.param("id")), lineId.data, actorOf(c));
    return noContent(c);
  })
  .patch("/hotels/:id/status", async (c) => {
    const { status } = await readJson(c, z.object({ status: z.enum(["trial", "active", "paused", "cancelled"]) }));
    await setHotelStatus(c.get("deps").db, hotelIdOf(c.req.param("id")), status, actorOf(c));
    return noContent(c);
  })
  .post("/webhooks/replay", async (c) => c.json({ replayed: await replayFailedEvents(c.get("deps")) }));
