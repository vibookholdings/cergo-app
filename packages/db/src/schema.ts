import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Esquema de CERGO.
 *
 * Regla de multi-hotel: toda tabla con datos de un hotel lleva `hotel_id` (u `organization_id`)
 * y tiene Row Level Security (ver la migración `0001_rls.sql`). El código de negocio accede a
 * esas tablas con `withTenant()`, que fija el hotel en la transacción y cambia al rol
 * `cergo_app`, así PostgreSQL filtra aunque una consulta se olvide del `where hotel_id = ...`.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orgKind = pgEnum("org_kind", ["hotel", "group"]);
export const orgStatus = pgEnum("org_status", ["trial", "active", "paused", "cancelled"]);
export const memberRole = pgEnum("member_role", [
  "owner",
  "reception",
  "sales",
  "readonly",
  "group_admin",
]);
export const tokenPurpose = pgEnum("token_purpose", ["magic_link", "invite", "password_reset"]);
export const lineProvider = pgEnum("line_provider", ["twilio", "sip", "other"]);
export const forwardingMode = pgEnum("forwarding_mode", ["no_answer", "after_hours", "always"]);
export const versionStatus = pgEnum("version_status", [
  "draft",
  "publishing",
  "published",
  "archived",
  "failed",
]);
export const callStatus = pgEnum("call_status", ["completed", "failed"]);
export const callReason = pgEnum("call_reason", [
  "reservation",
  "inquiry",
  "change",
  "complaint",
  "other",
]);
export const callOutcome = pgEnum("call_outcome", [
  "resolved",
  "quote",
  "booking",
  "handed_off",
  "unresolved",
  "failed",
]);
export const handoffStatus = pgEnum("handoff_status", ["new", "in_progress", "resolved"]);
export const handoffUrgency = pgEnum("handoff_urgency", ["normal", "high", "emergency"]);
export const bookingKind = pgEnum("booking_kind", ["quote", "booking"]);
export const bookingStatus = pgEnum("booking_status", [
  "quoted",
  "pending",
  "confirmed",
  "paid",
  "lost",
  "cancelled",
]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);

// ---------------------------------------------------------------------------
// Tipos de columnas JSON
// ---------------------------------------------------------------------------

export type TimeRange = { from: string; to: string };
/** Horario semanal: 0 = domingo ... 6 = sábado. Vacío = cerrado ese día. */
export type WeeklySchedule = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", TimeRange[]>;

export type HotelSettings = {
  notifyEmails?: string[];
  notifyWhatsapp?: string | null;
  retentionMonths?: number;
  receptionHours?: WeeklySchedule | null;
  allowNonOwnersToDraft?: boolean;
};

// ---------------------------------------------------------------------------
// Organizaciones, usuarios y acceso
// ---------------------------------------------------------------------------

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: orgKind("kind").notNull().default("hotel"),
    parentId: uuid("parent_id").references((): AnyPgColumn => organizations.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    city: text("city"),
    timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
    status: orgStatus("status").notNull().default("active"),
    plan: text("plan").notNull().default("esencial"),
    monthlyMinutes: integer("monthly_minutes").notNull().default(400),
    settings: jsonb("settings").$type<HotelSettings>().notNull().default({}),
    features: jsonb("features").$type<Record<string, boolean>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("organizations_slug_key").on(t.slug), index("organizations_parent_idx").on(t.parentId)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    passwordHash: text("password_hash"),
    isStaff: boolean("is_staff").notNull().default(false),
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    backupCodes: jsonb("backup_codes").$type<string[]>().notNull().default([]),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 del token de la cookie: el token en sí nunca se guarda. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    purpose: tokenPurpose("purpose").notNull(),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    role: memberRole("role"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("auth_tokens_hash_key").on(t.tokenHash),
    index("auth_tokens_org_idx").on(t.organizationId),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    notifyByEmail: boolean("notify_by_email").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("memberships_user_org_key").on(t.userId, t.organizationId),
    index("memberships_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// Telefonía y agente
// ---------------------------------------------------------------------------

export const phoneLines = pgTable(
  "phone_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    provider: lineProvider("provider").notNull().default("twilio"),
    forwarding: forwardingMode("forwarding").notNull().default("no_answer"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("phone_lines_number_key").on(t.number), index("phone_lines_hotel_idx").on(t.hotelId)],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Agente de recepción"),
    elevenlabsAgentId: text("elevenlabs_agent_id"),
    elevenlabsTestAgentId: text("elevenlabs_test_agent_id"),
    /** sha256 del token con el que el agente llama a las server tools. */
    toolTokenHash: text("tool_token_hash"),
    toolTokenHint: text("tool_token_hint"),
    publishedVersionId: uuid("published_version_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("agents_hotel_idx").on(t.hotelId),
    uniqueIndex("agents_elevenlabs_key").on(t.elevenlabsAgentId),
    uniqueIndex("agents_tool_token_key").on(t.toolTokenHash),
  ],
);

export const agentConfigVersions = pgTable(
  "agent_config_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: versionStatus("status").notNull().default("draft"),
    /** Capa del hotel (ver `AgentConfig` en @cergo/contracts). */
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    compiledPrompt: text("compiled_prompt"),
    firstMessage: text("first_message"),
    baseLayerVersion: text("base_layer_version"),
    notes: text("notes"),
    review: jsonb("review").$type<unknown[]>().notNull().default([]),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("agent_versions_agent_version_key").on(t.agentId, t.version),
    uniqueIndex("agent_versions_one_draft_key")
      .on(t.agentId)
      .where(sql`${t.status} = 'draft'`),
    index("agent_versions_hotel_idx").on(t.hotelId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Llamadas
// ---------------------------------------------------------------------------

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").notNull(),
    status: callStatus("status").notNull().default("completed"),
    callerNumber: text("caller_number"),
    direction: text("direction").notNull().default("inbound"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationSecs: integer("duration_secs").notNull().default(0),
    language: text("language"),
    reason: callReason("reason").notNull().default("other"),
    outcome: callOutcome("outcome").notNull().default("resolved"),
    summary: text("summary"),
    handedOff: boolean("handed_off").notNull().default(false),
    afterHours: boolean("after_hours").notNull().default(false),
    isTest: boolean("is_test").notNull().default(false),
    audioKey: text("audio_key"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
    analysis: jsonb("analysis").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("calls_conversation_key").on(t.conversationId),
    index("calls_hotel_started_idx").on(t.hotelId, t.startedAt.desc()),
  ],
);

export const callMessages = pgTable(
  "call_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role").notNull(),
    text: text("text").notNull(),
    timeSecs: integer("time_secs"),
    toolName: text("tool_name"),
  },
  (t) => [
    uniqueIndex("call_messages_call_seq_key").on(t.callId, t.seq),
    index("call_messages_text_search_idx").using("gin", sql`to_tsvector('simple', ${t.text})`),
  ],
);

// ---------------------------------------------------------------------------
// Pendientes de recepción
// ---------------------------------------------------------------------------

export const handoffs = pgTable(
  "handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),
    conversationId: text("conversation_id"),
    guestName: text("guest_name"),
    guestPhone: text("guest_phone"),
    reason: text("reason").notNull(),
    summary: text("summary"),
    urgency: handoffUrgency("urgency").notNull().default("normal"),
    status: handoffStatus("status").notNull().default("new"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("handoffs_hotel_status_idx").on(t.hotelId, t.status, t.createdAt.desc()),
    index("handoffs_conversation_idx").on(t.conversationId),
  ],
);

export const handoffComments = pgTable(
  "handoff_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handoffId: uuid("handoff_id")
      .notNull()
      .references(() => handoffs.id, { onDelete: "cascade" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("handoff_comments_handoff_idx").on(t.handoffId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Reservas y cotizaciones
// ---------------------------------------------------------------------------

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),
    conversationId: text("conversation_id"),
    kind: bookingKind("kind").notNull(),
    status: bookingStatus("status").notNull(),
    guestName: text("guest_name"),
    guestPhone: text("guest_phone"),
    guestEmail: text("guest_email"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    nights: integer("nights").notNull(),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    roomType: text("room_type"),
    totalUsd: numeric("total_usd", { precision: 12, scale: 2 }),
    pmsId: text("pms_id"),
    notes: text("notes"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bookings_hotel_created_idx").on(t.hotelId, t.createdAt.desc()),
    index("bookings_conversation_idx").on(t.conversationId),
  ],
);

// ---------------------------------------------------------------------------
// Métricas precalculadas
// ---------------------------------------------------------------------------

export type CountMap = Record<string, number>;

export const dailyStats = pgTable(
  "daily_stats",
  {
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    calls: integer("calls").notNull().default(0),
    resolved: integer("resolved").notNull().default(0),
    handedOff: integer("handed_off").notNull().default(0),
    afterHours: integer("after_hours").notNull().default(0),
    quotes: integer("quotes").notNull().default(0),
    bookings: integer("bookings").notNull().default(0),
    revenueUsd: numeric("revenue_usd", { precision: 14, scale: 2 }).notNull().default("0"),
    durationSecs: integer("duration_secs").notNull().default(0),
    resolvedDurationSecs: integer("resolved_duration_secs").notNull().default(0),
    byReason: jsonb("by_reason").$type<CountMap>().notNull().default({}),
    byLanguage: jsonb("by_language").$type<CountMap>().notNull().default({}),
    byHour: jsonb("by_hour").$type<number[]>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.hotelId, t.day] })],
);

// ---------------------------------------------------------------------------
// Auditoría, webhooks y cola
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    viaStaff: boolean("via_staff").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_org_created_idx").on(t.organizationId, t.createdAt.desc())],
);

/** Bandeja de entrada de webhooks: se guarda crudo y se procesa en el worker (idempotente). */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("webhook_events_source_external_key").on(t.source, t.externalId)],
);

/** Cola de trabajos sobre PostgreSQL. También es el "outbox" de avisos. */
export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    queue: text("queue").notNull(),
    hotelId: uuid("hotel_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("jobs_queued_idx")
      .on(t.runAt)
      .where(sql`${t.status} = 'queued'`),
    index("jobs_running_idx")
      .on(t.lockedAt)
      .where(sql`${t.status} = 'running'`),
    uniqueIndex("jobs_dedupe_key")
      .on(t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
);
