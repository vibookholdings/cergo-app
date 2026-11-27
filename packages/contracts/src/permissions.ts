import type { Role } from "./labels";

export const permissions = [
  "dashboard:view",
  "calls:view",
  "handoffs:view",
  "handoffs:manage",
  "bookings:view",
  "bookings:manage",
  "bookings:export",
  "agent:view",
  "agent:draft",
  "agent:publish",
  "team:manage",
  "hotel:settings",
] as const;
export type Permission = (typeof permissions)[number];

const matrix: Record<Role, readonly Permission[]> = {
  owner: permissions,
  group_admin: permissions,
  reception: [
    "dashboard:view",
    "calls:view",
    "handoffs:view",
    "handoffs:manage",
    "bookings:view",
    "bookings:manage",
    "agent:view",
  ],
  sales: [
    "dashboard:view",
    "calls:view",
    "bookings:view",
    "bookings:manage",
    "bookings:export",
  ],
  readonly: ["dashboard:view"],
};

/**
 * Permisos por rol. `allowNonOwnersToDraft` (ajuste del hotel) deja que recepción
 * prepare borradores del agente; publicar sigue siendo solo del dueño o gerente.
 */
export function can(
  role: Role,
  permission: Permission,
  opts: { allowNonOwnersToDraft?: boolean } = {},
): boolean {
  if (permission === "agent:draft" && opts.allowNonOwnersToDraft && role === "reception") return true;
  return matrix[role].includes(permission);
}

export function permissionsFor(role: Role, opts: { allowNonOwnersToDraft?: boolean } = {}): Permission[] {
  return permissions.filter((p) => can(role, p, opts));
}
