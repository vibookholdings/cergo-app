import { createDb } from "./client";
import { runMigrations } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
const handle = createDb(url, { max: 1, applicationName: "cergo-migrate" });
try {
  await runMigrations(handle.db);
  console.warn("Migraciones aplicadas");
} finally {
  await handle.close();
}
