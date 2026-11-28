/**
 * Prepara la base de los tests de integración: crea la base si no existe, la deja vacía y corre
 * todas las migraciones (incluida la de RLS). Usa TEST_DATABASE_URL o un PostgreSQL local.
 */
import { createDb, runMigrations, sql } from "@cergo/db";

const DEFAULT_URL = "postgres://postgres:postgres@localhost:5432/cergo_test";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_URL;
  process.env.TEST_DATABASE_URL = url;

  const target = new URL(url);
  const dbName = decodeURIComponent(target.pathname.slice(1));
  if (!/^[a-z0-9_]+$/i.test(dbName)) throw new Error(`Nombre de base de test inválido: ${dbName}`);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = createDb(adminUrl.toString(), { max: 1, applicationName: "cergo-test-setup" });
  try {
    const exists = await admin.db.execute(sql`select 1 from pg_database where datname = ${dbName}`);
    if (!exists.rowCount) await admin.db.execute(sql.raw(`create database "${dbName}"`));
  } finally {
    await admin.close();
  }

  const { db, close } = createDb(url, { max: 1, applicationName: "cergo-test-setup" });
  try {
    await db.execute(sql.raw("drop schema if exists drizzle cascade"));
    await db.execute(sql.raw("drop schema if exists public cascade"));
    await db.execute(sql.raw("create schema public"));
    await runMigrations(db);
  } finally {
    await close();
  }
}
