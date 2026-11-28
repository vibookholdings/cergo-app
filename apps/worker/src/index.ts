import { createDepsFromEnv, queues, type QueueName } from "@cergo/core";
import { JobRunner } from "./runner";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 8);
const only = process.env.WORKER_QUEUES?.split(",").map((q) => q.trim()).filter(Boolean) as QueueName[] | undefined;
for (const q of only ?? []) if (!queues.includes(q)) throw new Error(`Cola desconocida en WORKER_QUEUES: ${q}`);

const deps = createDepsFromEnv("worker", { poolMax: concurrency + 3 });
const runner = new JobRunner(deps, deps.handle.pool, {
  concurrency,
  pollMs: Number(process.env.WORKER_POLL_MS ?? 2000),
  queues: only?.length ? only : undefined,
  maintenanceHour: Number(process.env.MAINTENANCE_HOUR ?? 4),
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  deps.log.info({ signal }, "Cerrando el worker: termino lo que está en curso");
  setTimeout(() => process.exit(1), 25_000).unref();
  await runner.stop();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await runner.start();
await deps.handle.close().catch(() => undefined);
process.exit(0);
