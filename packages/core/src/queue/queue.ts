import { jobs, sql, type Db, type DbOrTx } from "@cergo/db";

export const queues = [
  "webhook.process",
  "call.fetch_audio",
  "notify.handoff",
  "notify.booking",
  "agent.publish",
  "stats.recompute",
  "maintenance.daily",
] as const;
export type QueueName = (typeof queues)[number];

export type EnqueueInput = {
  queue: QueueName;
  payload?: Record<string, unknown>;
  hotelId?: string | null;
  runAt?: Date;
  /** Clave de idempotencia: si ya hay un trabajo con esta clave, no se encola otro. */
  dedupeKey?: string;
  maxAttempts?: number;
};

/**
 * Encola un trabajo. Usá la misma transacción que el cambio de negocio (patrón outbox):
 * si la transacción se cae, el aviso tampoco sale; si se confirma, el aviso sale sí o sí.
 */
export async function enqueue(tx: DbOrTx, job: EnqueueInput): Promise<void> {
  await tx
    .insert(jobs)
    .values({
      queue: job.queue,
      payload: job.payload ?? {},
      hotelId: job.hotelId ?? null,
      runAt: job.runAt ?? new Date(),
      dedupeKey: job.dedupeKey ?? null,
      maxAttempts: job.maxAttempts ?? 8,
    })
    .onConflictDoNothing();
}

export type ClaimedJob = {
  id: number;
  queue: QueueName;
  hotelId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
};

/**
 * Toma hasta `limit` trabajos listos, repartidos de forma justa entre hoteles: primero el más
 * viejo de cada hotel, después el segundo de cada uno, etc. Así un hotel con miles de tareas no
 * demora los avisos de los demás. `SKIP LOCKED` permite varios workers en paralelo.
 */
export async function claimJobs(db: Db, workerId: string, limit: number, only?: readonly QueueName[]): Promise<ClaimedJob[]> {
  const queueFilter = only?.length ? sql`and queue in (${sql.join(only.map((q) => sql`${q}`), sql`, `)})` : sql``;
  const res = await db.execute<{
    id: number;
    queue: QueueName;
    hotel_id: string | null;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }>(sql`
    with oldest as (
      select id, hotel_id, queue, run_at from jobs
      where status = 'queued' and run_at <= now() ${queueFilter}
      order by run_at
      limit 500
    ), ranked as (
      select id, run_at,
        row_number() over (partition by coalesce(hotel_id::text, queue) order by run_at, id) as rn
      from oldest
    ), picked as (
      select j.id from jobs j
      join ranked r on r.id = j.id
      where j.status = 'queued'
      order by r.rn, r.run_at
      limit ${limit}
      for update of j skip locked
    )
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = jobs.attempts + 1
    from picked where jobs.id = picked.id
    returning jobs.id, jobs.queue, jobs.hotel_id, jobs.payload, jobs.attempts, jobs.max_attempts
  `);
  return res.rows.map((r) => ({
    id: Number(r.id),
    queue: r.queue,
    hotelId: r.hotel_id,
    payload: r.payload ?? {},
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
  }));
}

export async function completeJob(db: Db, id: number): Promise<void> {
  await db.execute(sql`update jobs set status = 'done', finished_at = now(), locked_at = null, last_error = null where id = ${id}`);
}

/** Espera exponencial con tope de 1 hora y algo de azar para no reintentar todos juntos. */
export function backoffMs(attempts: number): number {
  const base = Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 60 * 60 * 1000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

export async function failJob(db: Db, job: ClaimedJob, error: string, retryable: boolean): Promise<"retry" | "dead"> {
  const dead = !retryable || job.attempts >= job.maxAttempts;
  if (dead) {
    await db.execute(sql`update jobs set status = 'failed', finished_at = now(), locked_at = null, last_error = ${error.slice(0, 2000)} where id = ${job.id}`);
    return "dead";
  }
  const runAt = new Date(Date.now() + backoffMs(job.attempts));
  await db.execute(sql`update jobs set status = 'queued', run_at = ${runAt}, locked_at = null, last_error = ${error.slice(0, 2000)} where id = ${job.id}`);
  return "retry";
}

/** Trabajos que quedaron "corriendo" porque se cayó un worker: vuelven a la cola. */
export async function recoverStuckJobs(db: Db, olderThanMs = 10 * 60 * 1000): Promise<number> {
  const res = await db.execute(sql`
    update jobs set status = 'queued', locked_at = null, last_error = 'Recuperado: el worker no terminó'
    where status = 'running' and locked_at < now() - (${olderThanMs} * interval '1 millisecond')
  `);
  return res.rowCount ?? 0;
}

export async function purgeFinishedJobs(db: Db, olderThanDays = 7): Promise<number> {
  const res = await db.execute(sql`
    delete from jobs where status in ('done', 'failed') and finished_at < now() - (${olderThanDays} * interval '1 day')
  `);
  return res.rowCount ?? 0;
}
