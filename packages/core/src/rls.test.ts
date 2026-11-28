import { bookings, calls, handoffs, organizations, sql, users, withTenant } from "@cergo/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addMemberFixture, createHotelFixture, createTestDeps, createUserFixture, resetDatabase } from "./testing";

const deps = createTestDeps();

/** Drizzle envuelve el error de PostgreSQL ("Failed query: ..."); el motivo real está en `cause`. */
async function pgError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const e = err as { message?: string; cause?: { message?: string } };
    return `${e.message ?? ""} ${e.cause?.message ?? ""}`;
  }
  return "no falló";
}
afterAll(() => deps.close());

async function seedTwoHotels() {
  const a = await createHotelFixture(deps, { name: "Hotel A" });
  const b = await createHotelFixture(deps, { name: "Hotel B" });
  for (const [hotelId, n] of [
    [a.hotelId, 1],
    [b.hotelId, 2],
  ] as const) {
    await deps.db.insert(calls).values({ hotelId, conversationId: `conv-${n}`, startedAt: new Date(), durationSecs: 60 });
    await deps.db.insert(handoffs).values({ hotelId, reason: `Motivo ${n}` });
    await deps.db.insert(bookings).values({ hotelId, kind: "booking", status: "pending", checkIn: "2027-01-10", checkOut: "2027-01-12", nights: 2 });
  }
  return { a: a.hotelId, b: b.hotelId };
}

describe("aislamiento entre hoteles (RLS)", () => {
  beforeEach(() => resetDatabase(deps.db));

  it("dentro de withTenant solo se ven las filas del hotel fijado, aunque la consulta no filtre", async () => {
    const { a, b } = await seedTwoHotels();
    const seen = await withTenant(deps.db, a, async (tx) => ({
      calls: await tx.select().from(calls),
      handoffs: await tx.select().from(handoffs),
      bookings: await tx.select().from(bookings),
      orgs: await tx.select().from(organizations),
    }));
    expect(seen.calls.map((r) => r.hotelId)).toEqual([a]);
    expect(seen.handoffs.map((r) => r.hotelId)).toEqual([a]);
    expect(seen.bookings.map((r) => r.hotelId)).toEqual([a]);
    expect(seen.orgs.map((r) => r.id)).toEqual([a]);
    expect(seen.calls.some((r) => r.hotelId === b)).toBe(false);
  });

  it("no deja escribir filas de otro hotel", async () => {
    const { a, b } = await seedTwoHotels();
    expect(await pgError(withTenant(deps.db, a, (tx) => tx.insert(handoffs).values({ hotelId: b, reason: "intruso" })))).toMatch(
      /row-level security/i,
    );
    const updated = await withTenant(deps.db, a, (tx) =>
      tx.update(handoffs).set({ reason: "pisado" }).where(sql`true`).returning({ hotelId: handoffs.hotelId }),
    );
    expect(updated.every((r) => r.hotelId === a)).toBe(true);
    const [other] = await deps.db.select().from(handoffs).where(sql`${handoffs.hotelId} = ${b}`);
    expect(other?.reason).toBe("Motivo 2");
  });

  it("sin hotel fijado, el rol de la app no ve nada", async () => {
    await seedTwoHotels();
    const rows = await deps.db.transaction(async (tx) => {
      await tx.execute(sql`set local role cergo_app`);
      return tx.select().from(calls);
    });
    expect(rows).toHaveLength(0);
  });

  it("de los usuarios solo ve nombre y mail de los miembros del hotel, nunca la contraseña", async () => {
    const { a, b } = await seedTwoHotels();
    const ana = await createUserFixture(deps.db, { email: "ana@hotel-a.test", password: "una-clave-larga-1" });
    const beto = await createUserFixture(deps.db, { email: "beto@hotel-b.test", password: "una-clave-larga-2" });
    await addMemberFixture(deps.db, ana.id, a, "owner");
    await addMemberFixture(deps.db, beto.id, b, "owner");
    const visible = await withTenant(deps.db, a, (tx) => tx.select({ id: users.id, email: users.email }).from(users));
    expect(visible.map((u) => u.email)).toEqual(["ana@hotel-a.test"]);
    expect(await pgError(withTenant(deps.db, a, (tx) => tx.select({ hash: users.passwordHash }).from(users)))).toMatch(
      /permission denied/i,
    );
  });

  it("toda tabla con hotel_id u organization_id tiene RLS y política", async () => {
    const res = await deps.db.execute<{ table_name: string; rls: boolean; policies: number }>(sql`
      select c.table_name, cls.relrowsecurity as rls,
        (select count(*)::int from pg_policies p where p.tablename = c.table_name) as policies
      from information_schema.columns c
      join pg_class cls on cls.relname = c.table_name and cls.relkind = 'r'
      where c.table_schema = 'public' and c.column_name in ('hotel_id', 'organization_id')
      group by c.table_name, cls.relrowsecurity
    `);
    const missing = res.rows.filter((r) => !r.rls || r.policies === 0 || r.table_name === "auth_tokens");
    // auth_tokens tiene organization_id pero cergo_app no tiene ningún permiso sobre ella.
    expect(missing.filter((r) => r.table_name !== "auth_tokens")).toEqual([]);
    expect(res.rows.length).toBeGreaterThanOrEqual(12);
  });
});
