import { permissionsFor, type HotelContext, type MembershipSummary, type Role } from "@cergo/contracts";
import { and, eq, inArray, isUuid, memberships, organizations, type Db } from "@cergo/db";
import type { SessionUser } from "./auth/sessions";
import { AppError } from "./errors";

export type HotelAccess = HotelContext & { allowNonOwnersToDraft: boolean };

export async function listMemberships(db: Db, userId: string): Promise<MembershipSummary[]> {
  const rows = await db
    .select({
      organizationId: memberships.organizationId,
      role: memberships.role,
      name: organizations.name,
      kind: organizations.kind,
      city: organizations.city,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId));
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

/** Hoteles a los que entra el usuario: los suyos directos y los de los grupos que administra. */
export async function listAccessibleHotels(db: Db, userId: string) {
  const mine = await listMemberships(db, userId);
  const hotels = new Map<string, { id: string; name: string; city: string | null; role: Role }>();
  for (const m of mine) {
    if (m.kind === "hotel") hotels.set(m.organizationId, { id: m.organizationId, name: m.name, city: m.city, role: m.role });
  }
  const groups = mine.filter((m) => m.kind === "group" && m.role === "group_admin").map((m) => m.organizationId);
  if (groups.length) {
    const children = await db
      .select({ id: organizations.id, name: organizations.name, city: organizations.city })
      .from(organizations)
      .where(and(inArray(organizations.parentId, groups), eq(organizations.kind, "hotel")));
    for (const c of children) if (!hotels.has(c.id)) hotels.set(c.id, { ...c, role: "group_admin" });
  }
  return { memberships: mine, hotels: [...hotels.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

/**
 * Decide con qué rol entra un usuario a un hotel. Orden: membresía directa, administrador del
 * grupo dueño del hotel, equipo CERGO ("ver como", queda auditado). Si no, 404 (no revela si existe).
 */
export async function resolveHotelAccess(db: Db, user: SessionUser, hotelId: string): Promise<HotelAccess> {
  if (!isUuid(hotelId)) throw new AppError("not_found", "Hotel no encontrado");
  const [hotel] = await db.select().from(organizations).where(eq(organizations.id, hotelId)).limit(1);
  if (!hotel || hotel.kind !== "hotel") throw new AppError("not_found", "Hotel no encontrado");

  let role: Role | null = null;
  let viaStaff = false;
  const orgIds = hotel.parentId ? [hotel.id, hotel.parentId] : [hotel.id];
  const rows = await db
    .select({ organizationId: memberships.organizationId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), inArray(memberships.organizationId, orgIds)));
  const direct = rows.find((r) => r.organizationId === hotel.id);
  const viaGroup = rows.find((r) => r.organizationId === hotel.parentId && r.role === "group_admin");
  if (direct) role = direct.role as Role;
  else if (viaGroup) role = "group_admin";
  else if (user.isStaff) {
    role = "owner";
    viaStaff = true;
  }
  if (!role) throw new AppError("not_found", "Hotel no encontrado");

  const allowNonOwnersToDraft = Boolean(hotel.settings?.allowNonOwnersToDraft);
  return {
    id: hotel.id,
    name: hotel.name,
    city: hotel.city,
    timezone: hotel.timezone,
    plan: hotel.plan,
    monthlyMinutes: hotel.monthlyMinutes,
    role,
    viaStaff,
    permissions: permissionsFor(role, { allowNonOwnersToDraft }),
    allowNonOwnersToDraft,
  };
}
