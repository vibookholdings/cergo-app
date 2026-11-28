import {
  acceptInviteInput,
  changePasswordInput,
  loginInput,
  magicLinkInput,
  passwordResetInput,
  passwordResetRequestInput,
  totpCodeInput,
  updateProfileInput,
  type Me,
} from "@cergo/contracts";
import {
  acceptInvite,
  changePassword,
  confirmTotpSetup,
  describeInvite,
  disableTotp,
  listAccessibleHotels,
  loginWithMagicLink,
  loginWithPassword,
  requestMagicLink,
  requestPasswordReset,
  resetPassword,
  revokeSession,
  SESSION_COOKIE,
  startTotpSetup,
  updateProfile,
  validateSession,
  verifySecondFactor,
  type LoginResult,
} from "@cergo/core";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../context";
import { noContent, rateLimit, readJson, readQuery } from "../http";
import { clearSessionCookie, currentSession, requireUser, setSessionCookie } from "../session";

const meta = (c: Context<AppEnv>) => ({ ip: c.get("ip"), userAgent: c.req.header("user-agent") ?? null });

function startSession(c: Context<AppEnv>, res: LoginResult) {
  setSessionCookie(c, res.token, res.expiresAt);
  return c.json({ mfaRequired: res.mfaRequired });
}

/** Intentos de ingreso: por IP y por mail, para frenar adivinanzas de contraseña. */
const loginLimit = rateLimit("login", 10, 60_000);
const sensitiveLimit = rateLimit("auth-mail", 5, 15 * 60_000);
const mfaLimit = rateLimit("mfa", 8, 5 * 60_000, (c) => c.get("session")?.userId ?? c.get("ip"));

export const authRoutes = new Hono<AppEnv>()
  .post("/login", loginLimit, async (c) => {
    const input = await readJson(c, loginInput);
    const perEmail = await c.get("opts").rateLimiter.hit(`login-email:${input.email}`, 8, 15 * 60_000);
    if (!perEmail.allowed) {
      return c.json({ error: { code: "rate_limited", message: "Demasiados intentos con este mail. Esperá 15 minutos o entrá con un enlace." } }, 429);
    }
    return startSession(c, await loginWithPassword(c.get("deps"), input.email, input.password, meta(c)));
  })
  .post("/magic-link", sensitiveLimit, async (c) => {
    const { email } = await readJson(c, magicLinkInput);
    await requestMagicLink(c.get("deps"), email);
    return noContent(c);
  })
  .post("/magic-link/verify", loginLimit, async (c) => {
    const { token } = await readJson(c, z.object({ token: z.string().min(20).max(200) }));
    return startSession(c, await loginWithMagicLink(c.get("deps"), token, meta(c)));
  })
  .post("/password-reset/request", sensitiveLimit, async (c) => {
    const { email } = await readJson(c, passwordResetRequestInput);
    await requestPasswordReset(c.get("deps"), email);
    return noContent(c);
  })
  .post("/password-reset", loginLimit, async (c) => {
    const input = await readJson(c, passwordResetInput);
    return startSession(c, await resetPassword(c.get("deps"), input.token, input.password, meta(c)));
  })
  .get("/invite", rateLimit("invite", 30, 60_000), async (c) => {
    const { token } = readQuery(c, z.object({ token: z.string().min(20).max(200) }));
    return c.json(await describeInvite(c.get("deps"), token));
  })
  .post("/invite/accept", loginLimit, async (c) => {
    const input = await readJson(c, acceptInviteInput);
    const res = await acceptInvite(c.get("deps"), input, meta(c));
    setSessionCookie(c, res.token, res.expiresAt);
    return c.json({ mfaRequired: res.mfaRequired, hotelId: res.hotelId });
  })
  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await revokeSession(c.get("deps").db, token);
    clearSessionCookie(c);
    return noContent(c);
  })
  .post("/2fa/verify", requireUser({ allowPendingMfa: true, allowMissingStaffMfa: true }), mfaLimit, async (c) => {
    const { code } = await readJson(c, totpCodeInput);
    await verifySecondFactor(c.get("deps"), currentSession(c), code);
    return noContent(c);
  })
  .post("/2fa/setup", requireUser({ allowMissingStaffMfa: true }), async (c) => {
    return c.json(await startTotpSetup(c.get("deps"), currentSession(c)));
  })
  .post("/2fa/confirm", requireUser({ allowMissingStaffMfa: true }), mfaLimit, async (c) => {
    const { code } = await readJson(c, totpCodeInput);
    return c.json(await confirmTotpSetup(c.get("deps"), currentSession(c), code));
  })
  .post("/2fa/disable", requireUser(), mfaLimit, async (c) => {
    const { code } = await readJson(c, totpCodeInput);
    await disableTotp(c.get("deps"), currentSession(c), code);
    return noContent(c);
  });

export const meRoutes = new Hono<AppEnv>()
  .get("/", requireUser({ allowPendingMfa: true, allowMissingStaffMfa: true }), async (c) => {
    const s = currentSession(c);
    const deps = c.get("deps");
    // Se vuelve a leer la sesión para devolver el estado de 2FA más reciente.
    const token = getCookie(c, SESSION_COOKIE);
    const fresh = (token && (await validateSession(deps.db, token))) || s;
    const { memberships, hotels } = await listAccessibleHotels(deps.db, s.userId);
    const me: Me = {
      user: { id: fresh.user.id, email: fresh.user.email, name: fresh.user.name, isStaff: fresh.user.isStaff, totpEnabled: fresh.user.totpEnabled },
      memberships,
      hotels,
      mfa: {
        verified: fresh.mfaVerified || !fresh.user.totpEnabled,
        required: fresh.user.isStaff && deps.config.requireStaffMfa && !fresh.user.totpEnabled,
      },
    };
    return c.json(me);
  })
  .patch("/", requireUser(), async (c) => {
    const { name } = await readJson(c, updateProfileInput);
    await updateProfile(c.get("deps"), currentSession(c).userId, name);
    return noContent(c);
  })
  .post("/password", requireUser(), rateLimit("password", 10, 15 * 60_000), async (c) => {
    const input = await readJson(c, changePasswordInput);
    await changePassword(c.get("deps"), currentSession(c), input.currentPassword, input.newPassword);
    return noContent(c);
  });
