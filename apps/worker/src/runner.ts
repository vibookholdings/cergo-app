import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  claimJobs,
  completeJob,
  enqueue,
  failJob,
  localDay,
  localParts,
  recoverStuckJobs,
  type ClaimedJob,
  type Deps,
  type QueueName,
} from "@cergo/core";
import type pg from "pg";
import { handlers, onDead } from "./handlers";

export type RunnerOptions = {
  concurrency: number;
  pollMs: number;
  /** Colas que atiende este worker (todas por defecto). Permite workers dedicados por tipo de tarea. */
  queues?: readonly QueueName[];
  /** Hora local (Buenos Aires) del mantenimiento diario. */
  maintenanceHour: number;
};

/**
 * Worker de la cola propia en PostgreSQL. Toma trabajos con SKIP LOCKED (se pueden correr varias
 * réplicas), los reparte de forma justa entre hoteles, reintenta con espera exponencial y se
 * despierta al instante con LISTEN/NOTIFY cuando entra un trabajo nuevo.
 */
export class JobRunner {
  readonly id = `${hostname()}-${randomUUID().slice(0, 8)}`;
  private inflight = new Set<Promise<void>>();
  private stopped = false;
  private wake: (() => void) | null = null;
  private listener: pg.PoolClient | null = null;
  private lastRecover = 0;

  constructor(
    private readonly deps: Deps,
    private readonly pool: pg.Pool | null,
    private readonly opts: RunnerOptions,
  ) {}

  async start(): Promise<void> {
    await this.listen();
    this.deps.log.info({ workerId: this.id, concurrency: this.opts.concurrency, queues: this.opts.queues ?? "todas" }, "Worker iniciado");
    while (!this.stopped) {
      try {
        await this.housekeeping();
        const claimed = await this.tick();
        if (claimed === 0) await this.sleep(this.opts.pollMs);
      } catch (err) {
        this.deps.log.error({ err }, "Error en el ciclo del worker");
        await this.sleep(this.opts.pollMs * 2);
      }
    }
    await Promise.allSettled(this.inflight);
  }

  /** Toma y lanza los trabajos que entren en la concurrencia libre. Devuelve cuántos tomó. */
  async tick(): Promise<number> {
    const free = this.opts.concurrency - this.inflight.size;
    if (free <= 0) {
      await Promise.race(this.inflight);
      return 1;
    }
    const jobs = await claimJobs(this.deps.db, this.id, free, this.opts.queues);
    for (const job of jobs) {
      const p = this.run(job).finally(() => this.inflight.delete(p));
      this.inflight.add(p);
    }
    return jobs.length;
  }

  /** Procesa todo lo pendiente y espera a que termine (para tests y scripts). */
  async drain(): Promise<void> {
    while ((await this.tick()) > 0 || this.inflight.size > 0) {
      await Promise.allSettled(this.inflight);
    }
  }

  async run(job: ClaimedJob): Promise<void> {
    const started = Date.now();
    try {
      await handlers[job.queue](this.deps, job);
      await completeJob(this.deps.db, job.id);
      this.deps.log.info({ jobId: job.id, queue: job.queue, hotelId: job.hotelId, ms: Date.now() - started }, "Trabajo listo");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = (err as { retryable?: boolean }).retryable !== false;
      const result = await failJob(this.deps.db, job, message, retryable);
      if (result === "dead") await onDead(this.deps, job, message);
      else this.deps.log.warn({ jobId: job.id, queue: job.queue, attempt: job.attempts, error: message }, "Trabajo falló; se reintenta");
    }
  }

  private async housekeeping(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRecover < 60_000) return;
    this.lastRecover = now;
    const recovered = await recoverStuckJobs(this.deps.db);
    if (recovered) this.deps.log.warn({ recovered }, "Trabajos recuperados de un worker caído");
    // Mantenimiento diario: la clave de idempotencia evita que varias réplicas lo encolen dos veces.
    const tz = "America/Argentina/Buenos_Aires";
    if (localParts(new Date(), tz).hour >= this.opts.maintenanceHour) {
      await enqueue(this.deps.db, { queue: "maintenance.daily", dedupeKey: `maintenance:${localDay(new Date(), tz)}`, maxAttempts: 3 });
    }
  }

  private async listen(): Promise<void> {
    if (!this.pool) return;
    try {
      this.listener = await this.pool.connect();
      this.listener.on("notification", () => this.wake?.());
      this.listener.on("error", (err) => this.deps.log.warn({ err }, "Se cortó LISTEN; sigo con sondeo"));
      await this.listener.query("LISTEN cergo_jobs");
    } catch (err) {
      this.deps.log.warn({ err }, "No se pudo hacer LISTEN; sigo con sondeo");
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.wake?.();
    if (this.listener) {
      await this.listener.query("UNLISTEN *").catch(() => undefined);
      this.listener.release();
      this.listener = null;
    }
  }
}
