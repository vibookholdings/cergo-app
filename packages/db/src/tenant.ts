import { sql } from "drizzle-orm";
import type { Db, Tx } from "./client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidTenantError extends Error {
  constructor(hotelId: string) {
    super(`Hotel inválido: ${hotelId}`);
  }
}

/**
 * Corre `fn` dentro de una transacción "de un hotel":
 * - cambia al rol `cergo_app`, que no puede saltarse Row Level Security;
 * - fija `app.hotel_id`, que usan todas las políticas.
 * Si una consulta se olvida de filtrar por hotel, PostgreSQL igual solo devuelve filas de este hotel.
 */
export async function withTenant<T>(db: Db, hotelId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(hotelId)) throw new InvalidTenantError(hotelId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role cergo_app`);
    await tx.execute(sql`select set_config('app.hotel_id', ${hotelId}, true)`);
    return fn(tx);
  });
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
