import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Cualquier cosa sobre la que se puede consultar: la base o una transacción. */
export type DbOrTx = Db | Tx;

export type DbHandle = { db: Db; pool: pg.Pool; close: () => Promise<void> };

export function createDb(
  connectionString: string,
  options: { max?: number; applicationName?: string } = {},
): DbHandle {
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: options.applicationName ?? "cergo",
    ssl,
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
