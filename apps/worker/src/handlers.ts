import {
  fetchCallAudio,
  localDay,
  markPublishFailed,
  notifyBooking,
  notifyHandoff,
  performPublish,
  processWebhookEvent,
  recomputeDailyStats,
  runDailyMaintenance,
  type ClaimedJob,
  type Deps,
  type QueueName,
} from "@cergo/core";
import { eq, organizations } from "@cergo/db";

type Handler = (deps: Deps, job: ClaimedJob) => Promise<void>;

const str = (job: ClaimedJob, key: string): string => {
  const v = job.payload[key];
  if (typeof v !== "string" || !v) throw Object.assign(new Error(`Falta ${key} en el trabajo ${job.id}`), { retryable: false });
  return v;
};

export const handlers: Record<QueueName, Handler> = {
  "webhook.process": (deps, job) => processWebhookEvent(deps, str(job, "eventId")),
  "call.fetch_audio": (deps, job) => fetchCallAudio(deps, job.hotelId ?? str(job, "hotelId"), str(job, "callId"), str(job, "conversationId")),
  "notify.handoff": (deps, job) => notifyHandoff(deps, str(job, "handoffId")),
  "notify.booking": (deps, job) => notifyBooking(deps, str(job, "bookingId")),
  "agent.publish": (deps, job) => performPublish(deps, str(job, "versionId")),
  "stats.recompute": async (deps, job) => {
    const hotelId = job.hotelId ?? str(job, "hotelId");
    const [hotel] = await deps.db.select({ tz: organizations.timezone }).from(organizations).where(eq(organizations.id, hotelId)).limit(1);
    if (!hotel) return;
    const day = typeof job.payload.day === "string" ? job.payload.day : localDay(new Date(), hotel.tz);
    await recomputeDailyStats(deps.db, hotelId, day, hotel.tz);
  },
  "maintenance.daily": async (deps) => {
    await runDailyMaintenance(deps);
  },
};

/** Qué hacer cuando un trabajo agota sus reintentos. */
export async function onDead(deps: Deps, job: ClaimedJob, error: string): Promise<void> {
  if (job.queue === "agent.publish" && typeof job.payload.versionId === "string") {
    await markPublishFailed(deps.db, job.payload.versionId, error);
  }
  deps.log.error({ jobId: job.id, queue: job.queue, hotelId: job.hotelId, error }, "Trabajo descartado tras agotar reintentos");
}
