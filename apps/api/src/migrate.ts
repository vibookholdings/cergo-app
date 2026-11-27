import { createDb, runMigrations } from "@cergo/db";

/** Paso de pre-deploy: aplica las migraciones pendientes (incluida la de RLS) y sale. */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL");
const { db, close } = createDb(url, { max: 1, applicationName: "cergo-migrate" });
try {
  await runMigrations(db);
  console.warn("Migraciones aplicadas");
} finally {
  await close();
}
