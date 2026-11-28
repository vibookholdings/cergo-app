import { and, eq, lt, ne, sessions, users, type Db } from "@cergo/db";
import { randomToken, sha256 } from "../crypto";

export const SESSION_COOKIE = "cergo_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_WHEN_LEFT_MS = 15 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isStaff: boolean;
  totpEnabled: boolean;
};

export type ValidSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  mfaVerified: boolean;
  user: SessionUser;
  /** true si se extendió el vencimiento: hay que reenviar la cookie. */
  refreshed: boolean;
};

export async function createSession(
  db: Db,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null; mfaVerified: boolean },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    mfaVerified: meta.mfaVerified,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

export async function validateSession(db: Db, token: string): Promise<ValidSession | null> {
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      mfaVerified: sessions.mfaVerified,
      lastSeenAt: sessions.lastSeenAt,
      email: users.email,
      name: users.name,
      isStaff: users.isStaff,
      totpEnabled: users.totpEnabled,
      disabledAt: users.disabledAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now || row.disabledAt) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  let expiresAt = row.expiresAt;
  let refreshed = false;
  if (expiresAt.getTime() - now < REFRESH_WHEN_LEFT_MS) {
    expiresAt = new Date(now + SESSION_TTL_MS);
    refreshed = true;
    await db.update(sessions).set({ expiresAt, lastSeenAt: new Date() }).where(eq(sessions.id, id));
  } else if (now - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  }
  return {
    id,
    userId: row.userId,
    expiresAt,
    mfaVerified: row.mfaVerified,
    refreshed,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      isStaff: row.isStaff,
      totpEnabled: row.totpEnabled,
    },
  };
}

export async function markSessionMfaVerified(db: Db, sessionId: string): Promise<void> {
  await db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, sessionId));
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function revokeOtherSessions(db: Db, userId: string, keepSessionId?: string): Promise<void> {
  await db
    .delete(sessions)
    .where(keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId));
}

export async function deleteExpiredSessions(db: Db): Promise<number> {
  const res = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return res.length;
}
