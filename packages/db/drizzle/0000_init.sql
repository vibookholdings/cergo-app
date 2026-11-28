CREATE TYPE "public"."booking_kind" AS ENUM('quote', 'booking');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('quoted', 'pending', 'confirmed', 'paid', 'lost', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."call_outcome" AS ENUM('resolved', 'quote', 'booking', 'handed_off', 'unresolved', 'failed');--> statement-breakpoint
CREATE TYPE "public"."call_reason" AS ENUM('reservation', 'inquiry', 'change', 'complaint', 'other');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."forwarding_mode" AS ENUM('no_answer', 'after_hours', 'always');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('new', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."handoff_urgency" AS ENUM('normal', 'high', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."line_provider" AS ENUM('twilio', 'sip', 'other');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'reception', 'sales', 'readonly', 'group_admin');--> statement-breakpoint
CREATE TYPE "public"."org_kind" AS ENUM('hotel', 'group');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('trial', 'active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('magic_link', 'invite', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'publishing', 'published', 'archived', 'failed');--> statement-breakpoint
CREATE TABLE "agent_config_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "version_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
	"compiled_prompt" text,
	"first_message" text,
	"base_layer_version" text,
	"notes" text,
	"review" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"name" text DEFAULT 'Agente de recepción' NOT NULL,
	"elevenlabs_agent_id" text,
	"elevenlabs_test_agent_id" text,
	"tool_token_hash" text,
	"tool_token_hint" text,
	"published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"via_staff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"role" "member_role",
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"call_id" uuid,
	"conversation_id" text,
	"kind" "booking_kind" NOT NULL,
	"status" "booking_status" NOT NULL,
	"guest_name" text,
	"guest_phone" text,
	"guest_email" text,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"nights" integer NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"room_type" text,
	"total_usd" numeric(12, 2),
	"pms_id" text,
	"notes" text,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"call_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"time_secs" integer,
	"tool_name" text
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"agent_id" uuid,
	"conversation_id" text NOT NULL,
	"status" "call_status" DEFAULT 'completed' NOT NULL,
	"caller_number" text,
	"direction" text DEFAULT 'inbound' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_secs" integer DEFAULT 0 NOT NULL,
	"language" text,
	"reason" "call_reason" DEFAULT 'other' NOT NULL,
	"outcome" "call_outcome" DEFAULT 'resolved' NOT NULL,
	"summary" text,
	"handed_off" boolean DEFAULT false NOT NULL,
	"after_hours" boolean DEFAULT false NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"audio_key" text,
	"cost_usd" numeric(10, 4),
	"analysis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"hotel_id" uuid NOT NULL,
	"day" date NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"resolved" integer DEFAULT 0 NOT NULL,
	"handed_off" integer DEFAULT 0 NOT NULL,
	"after_hours" integer DEFAULT 0 NOT NULL,
	"quotes" integer DEFAULT 0 NOT NULL,
	"bookings" integer DEFAULT 0 NOT NULL,
	"revenue_usd" numeric(14, 2) DEFAULT '0' NOT NULL,
	"duration_secs" integer DEFAULT 0 NOT NULL,
	"resolved_duration_secs" integer DEFAULT 0 NOT NULL,
	"by_reason" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_language" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_hour" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_stats_hotel_id_day_pk" PRIMARY KEY("hotel_id","day")
);
--> statement-breakpoint
CREATE TABLE "handoff_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handoff_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"call_id" uuid,
	"conversation_id" text,
	"guest_name" text,
	"guest_phone" text,
	"reason" text NOT NULL,
	"summary" text,
	"urgency" "handoff_urgency" DEFAULT 'normal' NOT NULL,
	"status" "handoff_status" DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"hotel_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"notify_by_email" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "org_kind" DEFAULT 'hotel' NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"city" text,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'esencial' NOT NULL,
	"monthly_minutes" integer DEFAULT 400 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"number" text NOT NULL,
	"provider" "line_provider" DEFAULT 'twilio' NOT NULL,
	"forwarding" "forwarding_mode" DEFAULT 'no_answer' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"password_hash" text,
	"is_staff" boolean DEFAULT false NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"backup_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "agent_config_versions" ADD CONSTRAINT "agent_config_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_versions" ADD CONSTRAINT "agent_config_versions_hotel_id_organizations_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_versions" ADD CONSTRAINT "agent_config_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_versions" ADD CONSTRAINT "agent_config_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_hotel_id_organizations_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hotel_id_organizations_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_messages" ADD CONSTRAINT "call_messages_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_messages" ADD CONSTRAINT "call_messages_hotel_id_organizations_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_hotel_id_organizations_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_hotel_id_organizations_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_comments" ADD CONSTRAINT "handoff_comments_handoff_id_handoffs_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."handoffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_comments" ADD CONSTRAINT "handoff_comments_hotel_id_organizations_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_comments" ADD CONSTRAINT "handoff_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_hotel_id_organizations_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_id_organizations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_lines" ADD CONSTRAINT "phone_lines_hotel_id_organizations_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_key" ON "agent_config_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_one_draft_key" ON "agent_config_versions" USING btree ("agent_id") WHERE "agent_config_versions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "agent_versions_hotel_idx" ON "agent_config_versions" USING btree ("hotel_id","created_at");--> statement-breakpoint
CREATE INDEX "agents_hotel_idx" ON "agents" USING btree ("hotel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_elevenlabs_key" ON "agents" USING btree ("elevenlabs_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_tool_token_key" ON "agents" USING btree ("tool_token_hash");--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_key" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_org_idx" ON "auth_tokens" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bookings_hotel_created_idx" ON "bookings" USING btree ("hotel_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bookings_conversation_idx" ON "bookings" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "call_messages_call_seq_key" ON "call_messages" USING btree ("call_id","seq");--> statement-breakpoint
CREATE INDEX "call_messages_text_search_idx" ON "call_messages" USING gin (to_tsvector('simple', "text"));--> statement-breakpoint
CREATE UNIQUE INDEX "calls_conversation_key" ON "calls" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "calls_hotel_started_idx" ON "calls" USING btree ("hotel_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "handoff_comments_handoff_idx" ON "handoff_comments" USING btree ("handoff_id","created_at");--> statement-breakpoint
CREATE INDEX "handoffs_hotel_status_idx" ON "handoffs" USING btree ("hotel_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "handoffs_conversation_idx" ON "handoffs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "jobs_queued_idx" ON "jobs" USING btree ("run_at") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "jobs_running_idx" ON "jobs" USING btree ("locked_at") WHERE "jobs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_key" ON "jobs" USING btree ("dedupe_key") WHERE "jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_org_key" ON "memberships" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "memberships_org_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_parent_idx" ON "organizations" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_lines_number_key" ON "phone_lines" USING btree ("number");--> statement-breakpoint
CREATE INDEX "phone_lines_hotel_idx" ON "phone_lines" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_source_external_key" ON "webhook_events" USING btree ("source","external_id");