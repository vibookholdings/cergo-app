import { serve } from "@hono/node-server";
import { createDepsFromEnv } from "@cergo/core";
import { createApp, defaultOptions } from "./app";

const deps = createDepsFromEnv("api");
const role = (process.env.API_ROLE ?? "all") as "all" | "panel" | "voice";
if (!["all", "panel", "voice"].includes(role)) throw new Error(`API_ROLE inválido: ${role}`);
const webhookSecret = deps.env.ELEVENLABS_WEBHOOK_SECRET ?? null;
if (!webhookSecret && role !== "panel") deps.log.warn("Falta ELEVENLABS_WEBHOOK_SECRET: el webhook post-llamada va a responder 503");

const app = createApp(
  deps,
  defaultOptions({
    role,
    webhookSecret,
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : deps.env.NODE_ENV === "production",
    trustProxy: process.env.TRUST_PROXY !== "false",
  }),
);

const port = Number(process.env.PORT ?? 8080);

/**
 * "::" (doble pila) para que la red privada de Railway, que usa IPv6, llegue a la API. Si la
 * máquina no tiene IPv6 (algunos entornos locales o de CI), caemos a IPv4.
 */
function listen(hostname: string): ReturnType<typeof serve> {
  const s = serve({ fetch: app.fetch, port, hostname }, (info) => {
    deps.log.info({ port: info.port, hostname, role }, "API de CERGO escuchando");
  });
  s.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EAFNOSUPPORT" && hostname === "::") {
      deps.log.warn("Sin IPv6 en esta máquina: escucho en 0.0.0.0");
      server = listen("0.0.0.0");
      return;
    }
    throw err;
  });
  return s;
}
let server = listen(process.env.HOST ?? "::");

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  deps.log.info({ signal }, "Cerrando la API");
  server.close();
  await deps.handle.close().catch(() => undefined);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
