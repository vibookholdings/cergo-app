import type { HotelRole, Role, TeamMember } from "@cergo/contracts";
import { and, eq, memberships, ne, sql, users, type Db } from "@cergo/db";
import { audit } from "../audit";
import { AppError } from "../errors";

type Actor = { userId: string; ip?: string | null; viaStaff?: boolean };

export async function listTeam(db: Db, hotelId: string, currentUserId: string): Promise<TeamMember[]> {
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      notifyByEmail: memberships.notifyByEmail,
      lastLoginAt: users.lastLoginAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, hotelId))
    .orderBy(sql`case ${memberships.role} when 'owner' then 0 when 'reception' then 1 when 'sales' then 2 else 3 end`, users.email);
  return rows.map((r) => ({
    ...r,
    role: r.role as Role,
    lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
    isYou: r.userId === currentUserId,
  }));
}

async function otherOwners(db: Db, hotelId: string, exceptMembershipId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.organizationId, hotelId), eq(memberships.role, "owner"), ne(memberships.id, exceptMembershipId)));
  return row?.n ?? 0;
}

async function findMembership(db: Db, hotelId: string, membershipId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, hotelId)))
    .limit(1);
  if (!m) throw new AppError("not_found", "Esa persona no está en el equipo");
  return m;
}

/** Cambia rol o avisos. Un hotel nunca se queda sin dueño. */
export async function updateMember(
  db: Db,
  hotelId: string,
  membershipId: string,
  input: { role?: HotelRole; notifyByEmail?: boolean },
  actor: Actor,
): Promise<void> {
  const m = await findMembership(db, hotelId, membershipId);
  if (input.role && m.role === "owner" && input.role !== "owner" && (await otherOwners(db, hotelId, m.id)) === 0) {
    throw new AppError("conflict", "El hotel tiene que tener al menos un dueño. Nombrá otro dueño antes de cambiar este rol.");
  }
  await db
    .update(memberships)
    .set({
      ...(input.role ? { role: input.role } : {}),
      ...(input.notifyByEmail !== undefined ? { notifyByEmail: input.notifyByEmail } : {}),
    })
    .where(eq(memberships.id, m.id));
  await audit(db, {
    organizationId: hotelId,
    actorUserId: actor.userId,
    action: "team.update",
    targetType: "membership",
    targetId: m.id,
    before: { role: m.role, notifyByEmail: m.notifyByEmail },
    after: input,
    ip: actor.ip,
    viaStaff: actor.viaStaff,
  });
}

export async function removeMember(db: Db, hotelId: string, membershipId: string, actor: Actor): Promise<void> {
  const m = await findMembership(db, hotelId, membershipId);
  if (m.role === "owner" && (await otherOwners(db, hotelId, m.id)) === 0) {
    throw new AppError("conflict", "No podés quitar al único dueño del hotel.");
  }
  await db.delete(memberships).where(eq(memberships.id, m.id));
  await audit(db, {
    organizationId: hotelId,
    actorUserId: actor.userId,
    action: "team.remove",
    targetType: "membership",
    targetId: m.id,
    before: { userId: m.userId, role: m.role },
    ip: actor.ip,
    viaStaff: actor.viaStaff,
  });
}
