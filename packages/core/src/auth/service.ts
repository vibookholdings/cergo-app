import { roleLabels, type HotelRole } from "@cergo/contracts";
import {
  and,
  authTokens,
  eq,
  gt,
  isNull,
  memberships,
  organizations,
  sql,
  users,
  type Db,
} from "@cergo/db";
import { decryptSecret, encryptSecret, randomToken, sha256 } from "../crypto";
import type { Deps } from "../deps";
import { AppError } from "../errors";
import { templates } from "../notifications/templates";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";
import { createSession, markSessionMfaVerified, revokeOtherSessions, type ValidSession } from "./sessions";
import { generateBackupCodes, generateTotpSecret, otpauthUrl, verifyTotp } from "./totp";

type Meta = { ip?: string | null; userAgent?: string | null };
export type LoginResult = { token: string; expiresAt: Date; mfaRequired: boolean };

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function findUserByEmail(db: Db, email: string) {
  const rows = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return rows[0] ?? null;
}

export async function loginWithPassword(deps: Deps, email: string, password: string, meta: Meta): Promise<LoginResult> {
  const user = await findUserByEmail(deps.db, email);
  if (!user || !user.passwordHash || user.disabledAt) {
    await burnPasswordCheck(password);
    throw new AppError("unauthorized", "Mail o contraseña incorrectos");
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("unauthorized", "Mail o contraseña incorrectos");
  }
  await deps.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const session = await createSession(deps.db, user.id, { ...meta, mfaVerified: !user.totpEnabled });
  return { ...session, mfaRequired: user.totpEnabled };
}

async function createToken(
  db: Db,
  values: Omit<typeof authTokens.$inferInsert, "tokenHash" | "expiresAt"> & { ttlMs: number },
): Promise<string> {
  const token = randomToken(32);
  const { ttlMs, ...rest } = values;
  await db.insert(authTokens).values({ ...rest, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** Consume un token de un solo uso de forma atómica: dos clics simultáneos no generan dos sesiones. */
async function consumeToken(db: Db, token: string, purpose: "magic_link" | "invite" | "password_reset") {
  const rows = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

async function peekToken(db: Db, token: string, purpose: "invite" | "password_reset" | "magic_link") {
  const rows = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Siempre responde igual, exista o no el mail (no revela quién tiene cuenta). */
export async function requestMagicLink(deps: Deps, email: string): Promise<void> {
  const user = await findUserByEmail(deps.db, email);
  if (!user || user.disabledAt) return;
  const token = await createToken(deps.db, { purpose: "magic_link", email: user.email, userId: user.id, ttlMs: MAGIC_LINK_TTL_MS });
  await deps.mailer.send(templates.magicLink(user.email, `${deps.config.appUrl}/entrar/enlace?token=${token}`));
}

export async function loginWithMagicLink(deps: Deps, token: string, meta: Meta): Promise<LoginResult> {
  const row = await consumeToken(deps.db, token, "magic_link");
  if (!row?.userId) throw new AppError("unauthorized", "El enlace venció o ya se usó. Pedí uno nuevo.");
  const [user] = await deps.db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user || user.disabledAt) throw new AppError("unauthorized", "Usuario deshabilitado");
  await deps.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const session = await createSession(deps.db, user.id, { ...meta, mfaVerified: !user.totpEnabled });
  return { ...session, mfaRequired: user.totpEnabled };
}

export async function requestPasswordReset(deps: Deps, email: string): Promise<void> {
  const user = await findUserByEmail(deps.db, email);
  if (!user || user.disabledAt) return;
  const token = await createToken(deps.db, { purpose: "password_reset", email: user.email, userId: user.id, ttlMs: RESET_TTL_MS });
  await deps.mailer.send(templates.passwordReset(user.email, `${deps.config.appUrl}/entrar/nueva-clave?token=${token}`));
}

export async function resetPassword(deps: Deps, token: string, newPassword: string, meta: Meta): Promise<LoginResult> {
  const row = await consumeToken(deps.db, token, "password_reset");
  if (!row?.userId) throw new AppError("unauthorized", "El enlace venció o ya se usó. Pedí uno nuevo.");
  const passwordHash = await hashPassword(newPassword);
  const [user] = await deps.db.update(users).set({ passwordHash }).where(eq(users.id, row.userId)).returning();
  if (!user) throw new AppError("not_found", "Usuario no encontrado");
  await revokeOtherSessions(deps.db, user.id);
  const session = await createSession(deps.db, user.id, { ...meta, mfaVerified: !user.totpEnabled });
  return { ...session, mfaRequired: user.totpEnabled };
}

export async function changePassword(
  deps: Deps,
  session: ValidSession,
  currentPassword: string | undefined,
  newPassword: string,
): Promise<void> {
  const [user] = await deps.db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) throw new AppError("not_found", "Usuario no encontrado");
  if (user.passwordHash) {
    if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError("validation_failed", "La contraseña actual no es correcta");
    }
  }
  await deps.db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
  await revokeOtherSessions(deps.db, user.id, session.id);
}

export async function updateProfile(deps: Deps, userId: string, name: string): Promise<void> {
  await deps.db.update(users).set({ name }).where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------

export async function inviteMember(
  deps: Deps,
  input: { hotelId: string; email: string; role: HotelRole; invitedBy: { id: string; name: string } },
): Promise<{ inviteUrl: string }> {
  const email = normalizeEmail(input.email);
  const [hotel] = await deps.db.select().from(organizations).where(eq(organizations.id, input.hotelId)).limit(1);
  if (!hotel) throw new AppError("not_found", "Hotel no encontrado");
  const existing = await deps.db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(users.email, email), eq(memberships.organizationId, input.hotelId)))
    .limit(1);
  if (existing[0]) throw new AppError("conflict", "Esa persona ya tiene acceso a este hotel");
  // Una invitación vigente por mail y hotel: la nueva reemplaza a la anterior.
  await deps.db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.purpose, "invite"),
        eq(authTokens.email, email),
        eq(authTokens.organizationId, input.hotelId),
        isNull(authTokens.usedAt),
      ),
    );
  const token = await createToken(deps.db, {
    purpose: "invite",
    email,
    organizationId: input.hotelId,
    role: input.role,
    invitedBy: input.invitedBy.id,
    ttlMs: INVITE_TTL_MS,
  });
  const inviteUrl = `${deps.config.appUrl}/invitacion?token=${token}`;
  await deps.mailer.send(templates.invitation(email, hotel.name, roleLabels[input.role], input.invitedBy.name || null, inviteUrl));
  return { inviteUrl };
}

export async function describeInvite(deps: Deps, token: string) {
  const row = await peekToken(deps.db, token, "invite");
  if (!row?.organizationId) throw new AppError("not_found", "La invitación venció o ya se usó");
  const [hotel] = await deps.db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, row.organizationId)).limit(1);
  const user = await findUserByEmail(deps.db, row.email);
  return {
    email: row.email,
    hotelName: hotel?.name ?? "",
    role: row.role,
    userExists: Boolean(user?.passwordHash),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function acceptInvite(
  deps: Deps,
  input: { token: string; name: string; password?: string },
  meta: Meta,
): Promise<LoginResult & { hotelId: string }> {
  const peek = await peekToken(deps.db, input.token, "invite");
  if (!peek) throw new AppError("not_found", "La invitación venció o ya se usó");
  let user: Awaited<ReturnType<typeof findUserByEmail>> | undefined = await findUserByEmail(deps.db, peek.email);
  if (!user?.passwordHash && !input.password) {
    throw new AppError("validation_failed", "Elegí una contraseña para tu cuenta");
  }
  const row = await consumeToken(deps.db, input.token, "invite");
  if (!row?.organizationId || !row.role) throw new AppError("not_found", "La invitación venció o ya se usó");
  const passwordHash = input.password && !user?.passwordHash ? await hashPassword(input.password) : undefined;
  if (!user) {
    [user] = await deps.db.insert(users).values({ email: row.email, name: input.name, passwordHash }).returning();
  } else if (passwordHash) {
    [user] = await deps.db.update(users).set({ passwordHash, name: user.name || input.name }).where(eq(users.id, user.id)).returning();
  }
  if (!user) throw new AppError("internal", "No se pudo crear el usuario");
  await deps.db
    .insert(memberships)
    .values({ userId: user.id, organizationId: row.organizationId, role: row.role })
    .onConflictDoUpdate({ target: [memberships.userId, memberships.organizationId], set: { role: row.role } });
  await deps.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const session = await createSession(deps.db, user.id, { ...meta, mfaVerified: !user.totpEnabled });
  return { ...session, mfaRequired: user.totpEnabled, hotelId: row.organizationId };
}

export async function listPendingInvites(db: Db, hotelId: string) {
  return db
    .select({
      id: authTokens.id,
      email: authTokens.email,
      role: authTokens.role,
      expiresAt: authTokens.expiresAt,
      createdAt: authTokens.createdAt,
    })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.organizationId, hotelId),
        eq(authTokens.purpose, "invite"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .orderBy(sql`${authTokens.createdAt} desc`);
}

export async function revokeInvite(db: Db, hotelId: string, inviteId: string): Promise<void> {
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, inviteId), eq(authTokens.organizationId, hotelId), eq(authTokens.purpose, "invite")));
}

// ---------------------------------------------------------------------------
// Verificación en dos pasos (TOTP)
// ---------------------------------------------------------------------------

export async function startTotpSetup(deps: Deps, session: ValidSession): Promise<{ secret: string; otpauthUrl: string }> {
  if (session.user.totpEnabled) throw new AppError("conflict", "La verificación en dos pasos ya está activa");
  const secret = generateTotpSecret();
  await deps.db
    .update(users)
    .set({ totpSecret: encryptSecret(secret, deps.config.authSecret) })
    .where(eq(users.id, session.userId));
  return { secret, otpauthUrl: otpauthUrl(secret, session.user.email) };
}

export async function confirmTotpSetup(deps: Deps, session: ValidSession, code: string): Promise<{ backupCodes: string[] }> {
  const [user] = await deps.db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user?.totpSecret) throw new AppError("bad_request", "Primero generá el código QR");
  const secret = decryptSecret(user.totpSecret, deps.config.authSecret);
  if (!verifyTotp(secret, code)) throw new AppError("validation_failed", "El código no es correcto. Probá con el siguiente.");
  const backupCodes = generateBackupCodes();
  await deps.db
    .update(users)
    .set({ totpEnabled: true, backupCodes: backupCodes.map((c) => sha256(c)) })
    .where(eq(users.id, user.id));
  await markSessionMfaVerified(deps.db, session.id);
  await revokeOtherSessions(deps.db, user.id, session.id);
  return { backupCodes };
}

export async function verifySecondFactor(deps: Deps, session: ValidSession, code: string): Promise<void> {
  const [user] = await deps.db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user?.totpEnabled || !user.totpSecret) {
    await markSessionMfaVerified(deps.db, session.id);
    return;
  }
  const secret = decryptSecret(user.totpSecret, deps.config.authSecret);
  if (verifyTotp(secret, code)) {
    await markSessionMfaVerified(deps.db, session.id);
    return;
  }
  // Código de respaldo: se usa una sola vez.
  const hashed = sha256(code.trim().toLowerCase());
  if (user.backupCodes.includes(hashed)) {
    await deps.db
      .update(users)
      .set({ backupCodes: user.backupCodes.filter((c) => c !== hashed) })
      .where(eq(users.id, user.id));
    await markSessionMfaVerified(deps.db, session.id);
    return;
  }
  throw new AppError("validation_failed", "El código no es correcto");
}

export async function disableTotp(deps: Deps, session: ValidSession, code: string): Promise<void> {
  if (session.user.isStaff && deps.config.requireStaffMfa) {
    throw new AppError("forbidden", "El equipo CERGO tiene que tener la verificación en dos pasos activa");
  }
  await verifySecondFactor(deps, session, code);
  await deps.db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null, backupCodes: [] })
    .where(eq(users.id, session.userId));
}
