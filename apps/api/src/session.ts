import { AppError, resolveHotelAccess, SESSION_COOKIE, validateSession, type HotelAccess } from "@cergo/core";
import { withTenant, type Tx } from "@cergo/db";
import type { Permission } from "@cergo/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "./context";

export function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.get("opts").cookieSecure,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: c.get("opts").cookieSecure });
}

/** Lee la sesión de la cookie (si hay) y la renueva cuando le queda poco. No exige nada. */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await validateSession(c.get("deps").db, token) : null;
  c.set("session", session);
  if (token && session?.refreshed) setSessionCookie(c, token, session.expiresAt);
  if (token && !session) clearSessionCookie(c);
  await next();
};

type Gate = { allowPendingMfa?: boolean; allowMissingStaffMfa?: boolean };

/** Exige sesión. Con 2FA activa, exige haber pasado el segundo paso; al staff le exige tenerla. */
export function requireUser(gate: Gate = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const s = c.get("session");
    if (!s) throw new AppError("unauthorized", "Tu sesión venció. Volvé a entrar.");
    if (s.user.totpEnabled && !s.mfaVerified && !gate.allowPendingMfa) {
      throw new AppError("mfa_required", "Falta el código de verificación en dos pasos");
    }
    if (s.user.isStaff && c.get("deps").config.requireStaffMfa && !s.user.totpEnabled && !gate.allowMissingStaffMfa) {
      throw new AppError("mfa_setup_required", "El equipo CERGO tiene que activar la verificación en dos pasos");
    }
    await next();
  };
}

export function currentSession(c: Context<AppEnv>) {
  const s = c.get("session");
  if (!s) throw new AppError("unauthorized", "Tu sesión venció. Volvé a entrar.");
  return s;
}

/** Resuelve el hotel de la URL y el rol del usuario en él. Sin acceso responde 404 (no revela si existe). */
export const loadHotel: MiddlewareHandler<AppEnv> = async (c, next) => {
  const s = currentSession(c);
  const access = await resolveHotelAccess(c.get("deps").db, s.user, c.req.param("hotelId") ?? "");
  c.set("hotel", access);
  await next();
};

export function need(permission: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!c.get("hotel").permissions.includes(permission)) {
      throw new AppError("forbidden", "Tu rol no tiene permiso para esto. Pedíselo al dueño del hotel.");
    }
    await next();
  };
}

export const requireStaff: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!currentSession(c).user.isStaff) throw new AppError("not_found", "No encontrado");
  await next();
};

/** Corre `fn` dentro de una transacción con el hotel fijado (RLS). */
export function inHotel<T>(c: Context<AppEnv>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(c.get("deps").db, c.get("hotel").id, fn);
}

export function actorOf(c: Context<AppEnv>) {
  const s = currentSession(c);
  const hotel = c.get("hotel") as HotelAccess | undefined;
  return { userId: s.userId, name: s.user.name || s.user.email, ip: c.get("ip"), viaStaff: hotel?.viaStaff ?? false };
}
