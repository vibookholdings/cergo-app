import { AppError } from "@cergo/core";
import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";
import type { AppEnv } from "./context";

/** Valida el cuerpo JSON con zod y devuelve los errores en el formato de la API. */
export async function readJson<S extends z.ZodTypeAny>(c: Context<AppEnv>, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError("bad_request", "El cuerpo del pedido no es JSON válido");
  }
  return parseWith(schema, raw);
}

export function readQuery<S extends z.ZodTypeAny>(c: Context<AppEnv>, schema: S): z.output<S> {
  return parseWith(schema, c.req.query());
}

export function parseWith<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new AppError("validation_failed", issues[0]?.message ?? "Revisá los datos", issues);
  }
  return parsed.data;
}

/** Límite por IP (o por la clave que se elija) para un grupo de rutas. */
export function rateLimit(name: string, limit: number, windowMs: number, keyOf?: (c: Context<AppEnv>) => string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = `${name}:${keyOf ? keyOf(c) : c.get("ip")}`;
    const res = await c.get("opts").rateLimiter.hit(key, limit, windowMs);
    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(res.remaining));
    if (!res.allowed) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((res.resetAt - Date.now()) / 1000))));
      throw new AppError("rate_limited", "Demasiados intentos. Esperá un momento y probá de nuevo.");
    }
    await next();
  };
}

export const noContent = (c: Context<AppEnv>) => c.body(null, 204);
