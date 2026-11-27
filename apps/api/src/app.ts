import { randomUUID } from "node:crypto";
import { AppError, type Deps } from "@cergo/core";
import { sql } from "@cergo/db";
import { Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { secureHeaders } from "hono/secure-headers";
import type { ApiOptions, AppEnv } from "./context";
import { MemoryRateLimiter } from "./rate-limit";
import { adminRoutes } from "./routes/admin";
import { authRoutes, meRoutes } from "./routes/auth";
import { hotelRoutes } from "./routes/hotel";
import { toolRoutes, webhookRoutes } from "./routes/voice";
import { loadSession } from "./session";

export function defaultOptions(partial: Partial<ApiOptions> = {}): ApiOptions {
  return {
    role: "all",
    webhookSecret: null,
    cookieSecure: false,
    trustProxy: true,
    rateLimiter: new MemoryRateLimiter(),
    ...partial,
  };
}

function clientIp(c: Parameters<typeof getConnInfo>[0], trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
    const real = c.req.header("x-real-ip");
    if (real) return real;
  }
  try {
    return getConnInfo(c).remote.address ?? "desconocida";
  } catch {
    return "desconocida";
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApp(deps: Deps, opts: ApiOptions = defaultOptions()) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id")?.slice(0, 80) || randomUUID();
    c.set("deps", deps);
    c.set("opts", opts);
    c.set("requestId", requestId);
    c.set("ip", clientIp(c, opts.trustProxy));
    c.header("x-request-id", requestId);
    const started = performance.now();
    await next();
    const ms = Math.round(performance.now() - started);
    const level = c.res.status >= 500 ? "error" : c.res.status >= 400 ? "warn" : "info";
    if (c.req.path !== "/health") {
      deps.log[level]({ requestId, method: c.req.method, path: c.req.path, status: c.res.status, ms }, "http");
    }
  });
  app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-site" }));

  app.get("/health", (c) => c.json({ ok: true, role: opts.role }));
  app.get("/ready", async (c) => {
    await deps.db.execute(sql`select 1`);
    return c.json({ ok: true });
  });

  if (opts.role !== "panel") {
    app.route("/webhooks", webhookRoutes);
    app.route("/tools", toolRoutes);
  }

  if (opts.role !== "voice") {
    // Defensa CSRF: además de SameSite=Lax, toda escritura del panel trae un header propio,
    // que un sitio ajeno no puede mandar sin pasar por CORS (y CORS no está habilitado).
    app.use("/api/*", async (c, next) => {
      if (MUTATING.has(c.req.method) && c.req.header("x-cergo-csrf") !== "1") {
        throw new AppError("forbidden", "Pedido rechazado (falta el encabezado de seguridad)");
      }
      await next();
    });
    app.use("/api/*", loadSession);
    app.route("/api/auth", authRoutes);
    app.route("/api/me", meRoutes);
    app.route("/api/h/:hotelId", hotelRoutes);
    app.route("/api/admin", adminRoutes);
  }

  app.notFound((c) => c.json({ error: { code: "not_found", message: "No encontrado" } }, 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      // Las server tools siempre responden 200 con un mensaje que el agente pueda usar en la llamada.
      if (c.req.path.startsWith("/tools/") && err.code === "validation_failed") {
        return c.json({ ok: false, message: `Faltan datos o no son válidos: ${err.message}. Pedíselos al huésped.` }, 200);
      }
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    }
    deps.log.error({ err, requestId: c.get("requestId"), path: c.req.path }, "Error no controlado");
    return c.json({ error: { code: "internal", message: "Algo salió mal. Ya quedó registrado; probá de nuevo en un rato." } }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
