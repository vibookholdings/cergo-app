import { createRequire } from "node:module";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client";

/** Carpeta de migraciones, resuelta desde el paquete (funciona desde el código fuente y desde un bundle). */
export function migrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("@cergo/db/package.json");
  return path.join(path.dirname(pkg), "drizzle");
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
