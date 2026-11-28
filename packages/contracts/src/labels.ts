export const roles = ["owner", "reception", "sales", "readonly", "group_admin"] as const;
export type Role = (typeof roles)[number];
export const hotelRoles = ["owner", "reception", "sales", "readonly"] as const;
export type HotelRole = (typeof hotelRoles)[number];

export const roleLabels: Record<Role, string> = {
  owner: "Dueño / gerente",
  reception: "Recepción",
  sales: "Reservas / comercial",
  readonly: "Solo lectura",
  group_admin: "Administrador del grupo",
};

export const callReasons = ["reservation", "inquiry", "change", "complaint", "other"] as const;
export type CallReason = (typeof callReasons)[number];
export const reasonLabels: Record<CallReason, string> = {
  reservation: "Reserva",
  inquiry: "Consulta",
  change: "Cambio de reserva",
  complaint: "Reclamo",
  other: "Otro",
};

export const callOutcomes = [
  "resolved",
  "quote",
  "booking",
  "handed_off",
  "unresolved",
  "failed",
] as const;
export type CallOutcome = (typeof callOutcomes)[number];
export const outcomeLabels: Record<CallOutcome, string> = {
  resolved: "Resuelta",
  quote: "Cotizó",
  booking: "Reservó",
  handed_off: "Derivada",
  unresolved: "Sin resolver",
  failed: "Falló",
};

export const handoffStatuses = ["new", "in_progress", "resolved"] as const;
export type HandoffStatus = (typeof handoffStatuses)[number];
export const handoffStatusLabels: Record<HandoffStatus, string> = {
  new: "Nuevo",
  in_progress: "En curso",
  resolved: "Resuelto",
};

export const handoffUrgencies = ["normal", "high", "emergency"] as const;
export type HandoffUrgency = (typeof handoffUrgencies)[number];
export const urgencyLabels: Record<HandoffUrgency, string> = {
  normal: "Normal",
  high: "Urgente",
  emergency: "Emergencia",
};

export const bookingKinds = ["quote", "booking"] as const;
export type BookingKind = (typeof bookingKinds)[number];
export const bookingStatuses = ["quoted", "pending", "confirmed", "paid", "lost", "cancelled"] as const;
export type BookingStatus = (typeof bookingStatuses)[number];
export const bookingStatusLabels: Record<BookingStatus, string> = {
  quoted: "Cotizada",
  pending: "Pendiente",
  confirmed: "Confirmada",
  paid: "Pagada",
  lost: "Caída",
  cancelled: "Cancelada",
};

export const versionStatuses = ["draft", "publishing", "published", "archived", "failed"] as const;
export type VersionStatus = (typeof versionStatuses)[number];
export const versionStatusLabels: Record<VersionStatus, string> = {
  draft: "Borrador",
  publishing: "Publicando",
  published: "Publicada",
  archived: "Anterior",
  failed: "Falló la publicación",
};
