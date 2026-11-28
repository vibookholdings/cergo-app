/**
 * Ayudas para los tests de integración: dependencias en memoria y datos de prueba sobre un
 * PostgreSQL real (lo levanta `scripts/test-global-setup.ts` o lo da CI en TEST_DATABASE_URL).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, memberships, sql, users, type Db } from "@cergo/db";
import {
  DisabledVoiceAgentProvider,
  LocalStorage,
  MemoryMailer,
  MemoryWhatsappSender,
  NoPmsAdapter,
  type PmsAdapter,
  type VoiceAgentProvider,
} from "@cergo/integrations";
import { hashPassword } from "./auth/password";
import type { AppConfig, Deps } from "./deps";
import { createHotel } from "./hotels/service";
import { createLogger } from "./logger";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Falta TEST_DATABASE_URL (la define scripts/test-global-setup.ts o CI)");
  return url;
}

export type TestDeps = Deps & {
  mailer: MemoryMailer;
  whatsapp: MemoryWhatsappSender;
  close: () => Promise<void>;
};

export const testConfig: AppConfig = {
  env: "test",
  appUrl: "http://localhost:3000",
  authSecret: "test-secret-que-no-se-usa-en-produccion",
  requireStaffMfa: false,
  costPerMinuteUsd: 0.1,
};

export function createTestDeps(overrides: { voice?: VoiceAgentProvider; pms?: PmsAdapter; config?: Partial<AppConfig> } = {}): TestDeps {
  const { db, close } = createDb(testDatabaseUrl(), { max: 5, applicationName: "cergo-test" });
  return {
    db,
    log: createLogger("test", process.env.LOG_LEVEL ?? "silent"),
    config: { ...testConfig, ...overrides.config },
    mailer: new MemoryMailer(),
    whatsapp: new MemoryWhatsappSender(),
    voice: overrides.voice ?? new DisabledVoiceAgentProvider(true),
    storage: new LocalStorage(mkdtempSync(path.join(tmpdir(), "cergo-test-storage-"))),
    pms: overrides.pms ?? new NoPmsAdapter(),
    aiReviewer: null,
    close,
  };
}

/** Vacía todas las tablas (sin tocar las migraciones). Rápido: un solo TRUNCATE. */
export async function resetDatabase(db: Db): Promise<void> {
  const res = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%'`,
  );
  const names = res.rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
}

export async function createUserFixture(
  db: Db,
  input: { email: string; name?: string; password?: string; isStaff?: boolean },
): Promise<{ id: string; email: string; name: string }> {
  const [u] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name ?? input.email.split("@")[0] ?? "",
      passwordHash: input.password ? await hashPassword(input.password) : null,
      isStaff: input.isStaff ?? false,
    })
    .returning({ id: users.id, email: users.email, name: users.name });
  if (!u) throw new Error("No se pudo crear el usuario de prueba");
  return u;
}

export async function addMemberFixture(db: Db, userId: string, organizationId: string, role: "owner" | "reception" | "sales" | "readonly" | "group_admin") {
  await db.insert(memberships).values({ userId, organizationId, role });
}

/** Hotel de prueba con agente, borrador inicial y token de server tools. */
export async function createHotelFixture(
  deps: Deps,
  input: { name: string; elevenlabsAgentId?: string; timezone?: string },
): Promise<{ hotelId: string; toolToken: string; staffId: string }> {
  const staff = await createUserFixture(deps.db, {
    email: `staff-${Math.random().toString(36).slice(2, 10)}@cergo.test`,
    isStaff: true,
  });
  const created = await createHotel(
    deps,
    {
      name: input.name,
      city: "Bariloche",
      timezone: input.timezone ?? "America/Argentina/Buenos_Aires",
      plan: "esencial",
      monthlyMinutes: 400,
      elevenlabsAgentId: input.elevenlabsAgentId,
    },
    { userId: staff.id, name: "Staff" },
  );
  return { hotelId: created.hotelId, toolToken: created.toolToken, staffId: staff.id };
}
