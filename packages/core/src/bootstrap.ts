import path from "node:path";
import { createDb, type DbHandle } from "@cergo/db";
import {
  DisabledVoiceAgentProvider,
  ElevenLabsClient,
  LocalStorage,
  MemoryMailer,
  MemoryWhatsappSender,
  NoPmsAdapter,
  ResendMailer,
  S3Storage,
  TwilioWhatsappSender,
} from "@cergo/integrations";
import { z } from "zod";
import type { AiReviewer } from "./agent/review";
import type { AppConfig, Deps } from "./deps";
import { createLogger } from "./logger";

const bool = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : v === "true" || v === "1"));

/** Variables de entorno de los procesos de servidor (API y worker). Todo opcional salvo la base. */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16).optional(),
  REQUIRE_STAFF_MFA: z.string().optional(),
  COST_PER_MINUTE_USD: z.coerce.number().min(0).default(0.12),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("CERGO <avisos@holacergo.com>"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  STORAGE_DIR: z.string().default(".data/storage"),
  LOG_LEVEL: z.string().default("info"),
});
export type ServerEnv = z.infer<typeof envSchema>;

export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production" && (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32)) {
    throw new Error("En producción AUTH_SECRET es obligatorio y tiene que tener al menos 32 caracteres");
  }
  return env;
}

export type ServerDeps = Deps & { handle: DbHandle; env: ServerEnv };

/** Arma las dependencias reales a partir del entorno. Lo que no está configurado queda en modo "en memoria". */
export function createDepsFromEnv(
  name: string,
  options: { env?: ServerEnv; aiReviewer?: AiReviewer | null; poolMax?: number } = {},
): ServerDeps {
  const env = options.env ?? readEnv();
  const log = createLogger(name, env.LOG_LEVEL);
  const handle = createDb(env.DATABASE_URL, { max: options.poolMax ?? env.DATABASE_POOL_MAX, applicationName: `cergo-${name}` });
  const config: AppConfig = {
    env: env.NODE_ENV,
    appUrl: env.APP_URL.replace(/\/$/, ""),
    authSecret: env.AUTH_SECRET ?? "solo-para-desarrollo-no-usar-en-produccion",
    requireStaffMfa: bool(env.NODE_ENV === "production").parse(env.REQUIRE_STAFF_MFA),
    costPerMinuteUsd: env.COST_PER_MINUTE_USD,
  };
  const warnLog = (msg: string, data: unknown) => log.info({ data }, msg);
  const storage =
    env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? new S3Storage({
          endpoint: env.S3_ENDPOINT || undefined,
          region: env.S3_REGION,
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          forcePathStyle: bool(false).parse(env.S3_FORCE_PATH_STYLE),
        })
      : new LocalStorage(path.resolve(env.STORAGE_DIR));
  const deps: ServerDeps = {
    db: handle.db,
    handle,
    env,
    log,
    config,
    mailer: env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM) : new MemoryMailer(warnLog),
    whatsapp:
      env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM
        ? new TwilioWhatsappSender(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_WHATSAPP_FROM)
        : new MemoryWhatsappSender(warnLog),
    voice: env.ELEVENLABS_API_KEY ? new ElevenLabsClient(env.ELEVENLABS_API_KEY) : new DisabledVoiceAgentProvider(),
    storage,
    pms: new NoPmsAdapter(),
    aiReviewer: options.aiReviewer ?? null,
  };
  const missing = [
    !env.ELEVENLABS_API_KEY && "ELEVENLABS_API_KEY",
    !env.RESEND_API_KEY && "RESEND_API_KEY (los mails solo van al log)",
    storage.kind === "local" && "S3_* (las grabaciones van a disco local)",
  ].filter(Boolean);
  if (missing.length) log.warn({ missing }, "Integraciones sin configurar");
  return deps;
}
