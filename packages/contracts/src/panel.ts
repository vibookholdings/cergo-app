import { z } from "zod";
import { agentConfigSchema, type AgentConfig, type ReviewItem } from "./agent-config";
import {
  bookingStatuses,
  callOutcomes,
  callReasons,
  handoffStatuses,
  hotelRoles,
  type BookingKind,
  type BookingStatus,
  type CallOutcome,
  type CallReason,
  type HandoffStatus,
  type HandoffUrgency,
  type Role,
  type VersionStatus,
} from "./labels";
import type { Permission } from "./permissions";

// ---------------------------------------------------------------------------
// Entradas (validadas en la API)
// ---------------------------------------------------------------------------

const email = z.string().trim().toLowerCase().email("Mail inválido").max(160);
const password = z
  .string()
  .min(10, "La contraseña tiene que tener al menos 10 caracteres")
  .max(200, "La contraseña es demasiado larga");

export const loginInput = z.object({ email, password: z.string().min(1).max(200) });
export const magicLinkInput = z.object({ email });
export const totpCodeInput = z.object({ code: z.string().trim().min(6).max(20) });
export const passwordResetRequestInput = z.object({ email });
export const passwordResetInput = z.object({ token: z.string().min(20).max(200), password });
export const acceptInviteInput = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1, "Poné tu nombre").max(120),
  password: password.optional(),
});
export const changePasswordInput = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: password,
});
export const updateProfileInput = z.object({ name: z.string().trim().min(1).max(120) });

export const inviteInput = z.object({ email, role: z.enum(hotelRoles) });
export const updateMemberInput = z.object({
  role: z.enum(hotelRoles).optional(),
  notifyByEmail: z.boolean().optional(),
});

export const callsQuery = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  reason: z.enum(callReasons).optional(),
  outcome: z.enum(callOutcomes).optional(),
  language: z.string().max(5).optional(),
  handedOff: z.enum(["true", "false"]).optional(),
  test: z.enum(["include", "only"]).optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type CallsQuery = z.infer<typeof callsQuery>;

export const handoffsQuery = z.object({
  status: z.enum([...handoffStatuses, "open", "all"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});
export const updateHandoffInput = z.object({
  status: z.enum(handoffStatuses).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});
export const commentInput = z.object({ body: z.string().trim().min(1).max(4000) });

export const bookingsQuery = z.object({
  status: z.enum(bookingStatuses).optional(),
  kind: z.enum(["quote", "booking"]).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});
export const updateBookingInput = z.object({
  status: z.enum(bookingStatuses).optional(),
  notes: z.string().max(4000).nullable().optional(),
  pmsId: z.string().max(120).nullable().optional(),
});

export const dashboardQuery = z.object({
  range: z.enum(["today", "7d", "30d", "month"]).default("7d"),
});
export type DashboardRange = z.infer<typeof dashboardQuery>["range"];

export const saveDraftInput = z.object({
  config: agentConfigSchema,
  notes: z.string().trim().max(500).optional(),
});
export const publishInput = z.object({
  versionId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
});
export const restoreInput = z.object({ versionId: z.string().uuid() });

export const hotelSettingsInput = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().max(120).default(""),
  timezone: z.string().trim().min(3).max(64),
  notifyEmails: z.array(email).max(10).default([]),
  notifyWhatsapp: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,24}$/, "Número inválido")
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
  retentionMonths: z.number().int().min(1).max(120).default(12),
  allowNonOwnersToDraft: z.boolean().default(false),
});
export type HotelSettingsInput = z.infer<typeof hotelSettingsInput>;

export const adminCreateHotelInput = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().max(120).default(""),
  timezone: z.string().trim().min(3).max(64).default("America/Argentina/Buenos_Aires"),
  plan: z.string().trim().min(1).max(40).default("esencial"),
  monthlyMinutes: z.number().int().min(0).max(1_000_000).default(400),
  parentId: z.string().uuid().nullable().optional(),
  elevenlabsAgentId: z.string().trim().max(120).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  ownerEmail: email.optional(),
});
export const adminUpdateAgentInput = z.object({
  elevenlabsAgentId: z.string().trim().max(120).nullable().optional(),
  elevenlabsTestAgentId: z.string().trim().max(120).nullable().optional(),
});
export const adminPhoneLineInput = z.object({
  number: z.string().trim().min(6).max(40),
  provider: z.enum(["twilio", "sip", "other"]).default("twilio"),
  forwarding: z.enum(["no_answer", "after_hours", "always"]).default("no_answer"),
});

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

export type Paginated<T> = { items: T[]; nextCursor: string | null };

export type MembershipSummary = {
  organizationId: string;
  name: string;
  kind: "hotel" | "group";
  city: string | null;
  role: Role;
};

export type Me = {
  user: { id: string; email: string; name: string; isStaff: boolean; totpEnabled: boolean };
  memberships: MembershipSummary[];
  hotels: { id: string; name: string; city: string | null; role: Role }[];
  mfa: { verified: boolean; required: boolean };
};

export type HotelContext = {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  plan: string;
  monthlyMinutes: number;
  role: Role;
  permissions: Permission[];
  viaStaff: boolean;
};

export type HandoffListItem = {
  id: string;
  createdAt: string;
  guestName: string | null;
  guestPhone: string | null;
  reason: string;
  summary: string | null;
  urgency: HandoffUrgency;
  status: HandoffStatus;
  assignedTo: { id: string; name: string } | null;
  callId: string | null;
  notifiedAt: string | null;
};

export type HandoffDetail = HandoffListItem & {
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  comments: { id: string; body: string; createdAt: string; user: { id: string; name: string } | null }[];
};

export type BookingListItem = {
  id: string;
  createdAt: string;
  kind: BookingKind;
  status: BookingStatus;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  roomType: string | null;
  totalUsd: number | null;
  callId: string | null;
  notes: string | null;
  pmsId: string | null;
};

export type CallListItem = {
  id: string;
  startedAt: string;
  callerNumber: string | null;
  durationSecs: number;
  language: string | null;
  reason: CallReason;
  outcome: CallOutcome;
  summary: string | null;
  handedOff: boolean;
  afterHours: boolean;
  isTest: boolean;
  status: "completed" | "failed";
};

export type CallDetail = CallListItem & {
  conversationId: string;
  hasAudio: boolean;
  costUsd: number | null;
  messages: { seq: number; role: string; text: string; timeSecs: number | null; toolName: string | null }[];
  handoffs: HandoffListItem[];
  bookings: BookingListItem[];
};

export type DashboardTotals = {
  calls: number;
  resolved: number;
  handedOff: number;
  afterHours: number;
  quotes: number;
  bookings: number;
  revenueUsd: number;
  minutes: number;
  avgDurationSecs: number;
  resolutionRate: number;
  hoursSaved: number;
  quoteToBookingRate: number;
};

export type DashboardData = {
  range: DashboardRange;
  from: string;
  to: string;
  timezone: string;
  totals: DashboardTotals;
  previous: Pick<DashboardTotals, "calls" | "resolutionRate" | "bookings" | "revenueUsd">;
  series: { day: string; calls: number; resolved: number; handedOff: number }[];
  byHour: number[];
  byReason: Record<CallReason, number>;
  byLanguage: Record<string, number>;
  usage: { monthMinutes: number; planMinutes: number };
  todo: { openHandoffs: HandoffListItem[]; pendingBookings: BookingListItem[] };
};

export type TeamMember = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  notifyByEmail: boolean;
  lastLoginAt: string | null;
  isYou: boolean;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: Role | null;
  expiresAt: string;
  createdAt: string;
};

export type AgentVersionSummary = {
  id: string;
  version: number;
  status: VersionStatus;
  notes: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string | null;
  publishedBy: string | null;
};

export type AgentVersionDetail = AgentVersionSummary & {
  config: AgentConfig;
  compiledPrompt: string | null;
  firstMessage: string | null;
};

export type AgentState = {
  agent: {
    id: string;
    name: string;
    elevenlabsAgentId: string | null;
    hasTestAgent: boolean;
    toolTokenHint: string | null;
    voiceConfigured: boolean;
  };
  draft: AgentVersionDetail | null;
  published: AgentVersionDetail | null;
  inFlight: AgentVersionSummary | null;
  baseLayer: { version: string; text: string };
  canPublish: boolean;
  canDraft: boolean;
  elevenlabsConfigured: boolean;
};

export type ReviewResult = { items: ReviewItem[]; blocking: boolean; usedAi: boolean };

/** Sesión de prueba por voz desde el navegador (ver createTestSession en @cergo/core). */
export type TestSession =
  | { mode: "test_agent"; signedUrl: string }
  | {
      mode: "overrides";
      signedUrl: string;
      overrides: { prompt: string; firstMessage: string; language: string };
      dynamicVariables: Record<string, string>;
    };

export type HotelSettingsView = HotelSettingsInput & { id: string; plan: string; monthlyMinutes: number };

export type AdminHotelRow = {
  id: string;
  name: string;
  city: string | null;
  status: string;
  plan: string;
  monthlyMinutes: number;
  minutesThisMonth: number;
  callsLast7d: number;
  lastCallAt: string | null;
  failedWebhooks24h: number;
  openHandoffs: number;
  agentStatus: VersionStatus | "none";
  elevenlabsAgentId: string | null;
  phoneNumbers: string[];
};

export type ApiError = { error: { code: string; message: string; details?: unknown } };
