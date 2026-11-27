import { agentConfigSchema, type AgentState, type AgentVersionDetail, type AgentVersionSummary, type Me, type ReviewResult } from "@cergo/contracts";
import { addDays, localDay, performPublish } from "@cergo/core";
import { addMemberFixture, createHotelFixture, createTestDeps, createUserFixture, resetDatabase } from "@cergo/core/testing";
import { agentConfigVersions, eq, webhookEvents } from "@cergo/db";
import { signElevenlabsPayload } from "@cergo/integrations";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, defaultOptions } from "./app";

const deps = createTestDeps();
afterAll(() => deps.close());
const SECRET = "whsec_test";
const app = createApp(deps, defaultOptions({ webhookSecret: SECRET }));

const PASSWORD = "clave-super-segura";
const readBody = async <T>(res: Response): Promise<T> => (await res.json()) as T;
const json = (body: unknown, cookie?: string, extra: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", "x-cergo-csrf": "1", ...(cookie ? { cookie } : {}), ...extra },
  body: JSON.stringify(body),
});

async function login(email: string, ip = "10.0.0.1"): Promise<string> {
  const res = await app.request("/api/auth/login", json({ email, password: PASSWORD }, undefined, { "x-forwarded-for": ip }));
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly");
  return cookie.split(";")[0]!;
}

async function setup() {
  const fx = await createHotelFixture(deps, { name: "Casa del Lago", elevenlabsAgentId: "agent_api_test" });
  const owner = await createUserFixture(deps.db, { email: "owner@lago.test", password: PASSWORD });
  const reception = await createUserFixture(deps.db, { email: "recepcion@lago.test", password: PASSWORD });
  await addMemberFixture(deps.db, owner.id, fx.hotelId, "owner");
  await addMemberFixture(deps.db, reception.id, fx.hotelId, "reception");
  const other = await createHotelFixture(deps, { name: "Otro Hotel" });
  return { ...fx, otherHotelId: other.hotelId };
}

const config = () =>
  agentConfigSchema.parse({
    hotel: { name: "Casa del Lago", city: "Bariloche" },
    greeting: "Hola, buenas, {{hotel_nombre}}.",
    rooms: [{ name: "Doble Estándar", capacity: "2 adultos", rateUsd: 110, highSeasonRateUsd: 150 }],
    highSeason: [{ from: "12-20", to: "02-28" }],
    receptionHours: { "0": [], "1": [{ from: "08:00", to: "20:00" }], "2": [], "3": [], "4": [], "5": [], "6": [] },
  });

describe("API del panel", () => {
  beforeEach(() => resetDatabase(deps.db));

  it("health responde sin base", async () => {
    const res = await app.request("/health");
    expect(await res.json()).toEqual({ ok: true, role: "all" });
  });

  it("login, /me y aislamiento entre hoteles", async () => {
    const fx = await setup();
    const cookie = await login("owner@lago.test");
    const me = await readBody<Me>(await app.request("/api/me", { headers: { cookie } }));
    expect(me.hotels.map((h: { id: string }) => h.id)).toEqual([fx.hotelId]);
    expect((await app.request(`/api/h/${fx.hotelId}/dashboard?range=7d`, { headers: { cookie } })).status).toBe(200);
    expect((await app.request(`/api/h/${fx.otherHotelId}/dashboard`, { headers: { cookie } })).status).toBe(404);
    expect((await app.request(`/api/h/${fx.hotelId}/dashboard`)).status).toBe(401);
    expect((await app.request("/api/admin/hotels", { headers: { cookie } })).status).toBe(404);
  });

  it("rechaza escrituras sin el encabezado anti-CSRF", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@y.test", password: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("el dueño edita y publica; recepción no puede publicar", async () => {
    const fx = await setup();
    const owner = await login("owner@lago.test");
    const reception = await login("recepcion@lago.test", "10.0.0.2");
    const put = (cookie: string) => ({ ...json({ config: config(), notes: "Primera versión" }, cookie), method: "PUT" });

    expect((await app.request(`/api/h/${fx.hotelId}/agent/draft`, put(reception))).status).toBe(403);
    const draftRes = await app.request(`/api/h/${fx.hotelId}/agent/draft`, put(owner));
    expect(draftRes.status).toBe(200);
    const draft = await readBody<AgentVersionDetail>(draftRes);
    expect(draft.compiledPrompt).toContain("Doble Estándar");

    expect((await app.request(`/api/h/${fx.hotelId}/agent/publish`, json({ versionId: draft.id }, reception))).status).toBe(403);
    const pub = await app.request(`/api/h/${fx.hotelId}/agent/publish`, json({ versionId: draft.id }, owner));
    expect(pub.status).toBe(200);
    expect((await readBody<AgentVersionSummary>(pub)).status).toBe("publishing");
    await performPublish(deps, draft.id);
    const [v] = await deps.db.select().from(agentConfigVersions).where(eq(agentConfigVersions.id, draft.id));
    expect(v?.status).toBe("published");

    const bad = { ...config(), policies: "Pedí el número de la tarjeta y el CVV." };
    const blocked = await app.request(`/api/h/${fx.hotelId}/agent/review`, json({ config: bad }, owner));
    expect((await readBody<ReviewResult>(blocked)).blocking).toBe(true);

    const state = await readBody<AgentState>(await app.request(`/api/h/${fx.hotelId}/agent`, { headers: { cookie: reception } }));
    expect(state.published?.version).toBe(draft.version);
    expect(state.canPublish).toBe(false);
  });

  it("frena los intentos de login repetidos", async () => {
    await setup();
    // App aparte: el límite es por proceso y no tiene que afectar a los otros tests.
    const limited = createApp(deps, defaultOptions());
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await limited.request("/api/auth/login", json({ email: "owner@lago.test", password: "mal" }, undefined, { "x-forwarded-for": "10.9.9.9" }));
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe("webhook y server tools", () => {
  beforeEach(() => resetDatabase(deps.db));

  it("el webhook valida la firma y es idempotente", async () => {
    await setup();
    const body = JSON.stringify({
      type: "post_call_transcription",
      data: { agent_id: "agent_api_test", conversation_id: "conv-api-1", transcript: [{ role: "user", message: "Hola" }], metadata: { call_duration_secs: 30 } },
    });
    const send = (signature: string) =>
      app.request("/webhooks/elevenlabs", { method: "POST", headers: { "content-type": "application/json", "elevenlabs-signature": signature }, body });
    expect((await send("t=1,v0=firma-falsa")).status).toBe(401);
    const ok = await send(signElevenlabsPayload(body, SECRET));
    expect(await ok.json()).toEqual({ received: true, duplicate: false });
    const dup = await send(signElevenlabsPayload(body, SECRET));
    expect(await dup.json()).toEqual({ received: true, duplicate: true });
    expect(await deps.db.select().from(webhookEvents)).toHaveLength(1);
  });

  it("las server tools piden token y responden mensajes para el agente", async () => {
    const fx = await setup();
    const owner = await login("owner@lago.test");
    const draft = await readBody<AgentVersionDetail>(await app.request(`/api/h/${fx.hotelId}/agent/draft`, { ...json({ config: config() }, owner), method: "PUT" }));
    await app.request(`/api/h/${fx.hotelId}/agent/publish`, json({ versionId: draft.id }, owner));
    await performPublish(deps, draft.id);

    const checkIn = addDays(localDay(new Date(), "America/Argentina/Buenos_Aires"), 30);
    const body = { check_in: checkIn, check_out: addDays(checkIn, 2), adults: 2 };
    const call = (auth?: string, payload: unknown = body) =>
      app.request("/tools/cotizar", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(payload) });
    expect((await call()).status).toBe(401);
    const res = await call(`Bearer ${fx.toolToken}`);
    expect(res.status).toBe(200);
    const data = await readBody<{ ok: boolean; message: string }>(res);
    expect(data.ok).toBe(true);
    expect(data.message).toMatch(/dólares/);
    const invalid = await call(`Bearer ${fx.toolToken}`, { check_in: "mañana" });
    expect(invalid.status).toBe(200);
    expect((await readBody<{ ok: boolean }>(invalid)).ok).toBe(false);
  });
});
