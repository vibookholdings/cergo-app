import { jobs, sql } from "@cergo/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHotelFixture, createTestDeps, resetDatabase } from "../testing";
import { claimJobs, completeJob, enqueue, failJob, recoverStuckJobs } from "./queue";

const deps = createTestDeps();
afterAll(() => deps.close());

describe("cola de trabajos en PostgreSQL", () => {
  beforeEach(() => resetDatabase(deps.db));

  it("reparte de forma justa entre hoteles: uno con muchas tareas no demora a los demás", async () => {
    const a = await createHotelFixture(deps, { name: "Hotel Grande" });
    const b = await createHotelFixture(deps, { name: "Hotel Chico" });
    const old = new Date(Date.now() - 60_000);
    for (let i = 0; i < 20; i++) await enqueue(deps.db, { queue: "stats.recompute", hotelId: a.hotelId, runAt: old });
    await enqueue(deps.db, { queue: "notify.handoff", hotelId: b.hotelId });
    const claimed = await claimJobs(deps.db, "w1", 2);
    expect(new Set(claimed.map((j) => j.hotelId))).toEqual(new Set([a.hotelId, b.hotelId]));
  });

  it("dos workers nunca toman el mismo trabajo", async () => {
    for (let i = 0; i < 30; i++) await enqueue(deps.db, { queue: "stats.recompute", payload: { i } });
    const [x, y] = await Promise.all([claimJobs(deps.db, "w1", 20), claimJobs(deps.db, "w2", 20)]);
    const ids = [...x, ...y].map((j) => j.id);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });

  it("dedupe, reintentos con espera y descarte al agotar intentos", async () => {
    await enqueue(deps.db, { queue: "notify.booking", dedupeKey: "k1", maxAttempts: 2 });
    await enqueue(deps.db, { queue: "notify.booking", dedupeKey: "k1", maxAttempts: 2 });
    expect(await deps.db.select().from(jobs)).toHaveLength(1);
    const [job] = await claimJobs(deps.db, "w1", 5);
    expect(await failJob(deps.db, job!, "falló", true)).toBe("retry");
    expect(await claimJobs(deps.db, "w1", 5)).toHaveLength(0); // espera antes de reintentar
    await deps.db.execute(sql`update jobs set run_at = now() - interval '1 second'`);
    const [again] = await claimJobs(deps.db, "w1", 5);
    expect(again?.attempts).toBe(2);
    expect(await failJob(deps.db, again!, "falló otra vez", true)).toBe("dead");
    const [row] = await deps.db.select().from(jobs);
    expect(row?.status).toBe("failed");
  });

  it("recupera trabajos de un worker caído", async () => {
    await enqueue(deps.db, { queue: "stats.recompute" });
    const [job] = await claimJobs(deps.db, "w1", 1);
    await deps.db.execute(sql`update jobs set locked_at = now() - interval '1 hour'`);
    expect(await recoverStuckJobs(deps.db, 10 * 60 * 1000)).toBe(1);
    const [again] = await claimJobs(deps.db, "w2", 1);
    expect(again?.id).toBe(job?.id);
    await completeJob(deps.db, again!.id);
    const [row] = await deps.db.select().from(jobs);
    expect(row?.status).toBe("done");
  });
});
