import { availabilityToolInput, bookingToolInput, handoffToolInput, quoteToolInput } from "@cergo/contracts";
import {
  AppError,
  authenticateTool,
  availabilityTool,
  bookingTool,
  handoffTool,
  quoteTool,
  receiveElevenlabsEvent,
  type ToolContext,
} from "@cergo/core";
import { verifyElevenlabsSignature } from "@cergo/integrations";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../context";
import { rateLimit, readJson } from "../http";

/**
 * Webhook post-llamada de ElevenLabs. Responde rápido: valida la firma, guarda el evento
 * (idempotente por conversación) y encola el procesamiento. Si algo falla, ElevenLabs reintenta.
 */
export const webhookRoutes = new Hono<AppEnv>().post(
  "/elevenlabs",
  bodyLimit({ maxSize: 40 * 1024 * 1024, onError: () => { throw new AppError("bad_request", "Evento demasiado grande"); } }),
  rateLimit("webhook", 1200, 60_000),
  async (c) => {
    const secret = c.get("opts").webhookSecret;
    if (!secret) throw new AppError("unavailable", "Falta configurar ELEVENLABS_WEBHOOK_SECRET");
    const raw = await c.req.text();
    if (!verifyElevenlabsSignature(raw, c.req.header("elevenlabs-signature"), secret)) {
      throw new AppError("unauthorized", "Firma inválida");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new AppError("bad_request", "JSON inválido");
    }
    const res = await receiveElevenlabsEvent(c.get("deps"), payload);
    if (!res.accepted) {
      c.get("deps").log.warn({ requestId: c.get("requestId") }, "Evento de ElevenLabs con formato desconocido");
      return c.json({ received: true, ignored: true });
    }
    return c.json({ received: true, duplicate: res.duplicate });
  },
);

const toolLimit = rateLimit("tools", 300, 60_000, (c) => (c.req.header("authorization") ?? c.get("ip")).slice(-16));

async function toolContext(c: Context<AppEnv>): Promise<ToolContext> {
  return authenticateTool(c.get("deps"), c.req.header("authorization"));
}

/** Server tools que el agente de ElevenLabs llama durante la llamada (token Bearer por hotel). */
export const toolRoutes = new Hono<AppEnv>()
  .use("*", toolLimit, bodyLimit({ maxSize: 64 * 1024, onError: () => { throw new AppError("bad_request", "Pedido demasiado grande"); } }))
  .post("/cotizar", async (c) => {
    const ctx = await toolContext(c);
    return c.json(await quoteTool(c.get("deps"), ctx, await readJson(c, quoteToolInput)));
  })
  .post("/reservar", async (c) => {
    const ctx = await toolContext(c);
    return c.json(await bookingTool(c.get("deps"), ctx, await readJson(c, bookingToolInput)));
  })
  .post("/derivar_a_recepcion", async (c) => {
    const ctx = await toolContext(c);
    return c.json(await handoffTool(c.get("deps"), ctx, await readJson(c, handoffToolInput)));
  })
  .post("/consultar_disponibilidad", async (c) => {
    const ctx = await toolContext(c);
    return c.json(await availabilityTool(c.get("deps"), ctx, await readJson(c, availabilityToolInput)));
  });
