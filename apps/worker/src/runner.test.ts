import { agentConfigSchema } from "@cergo/contracts";
import { authenticateTool, handoffTool, requestPublish, saveDraft } from "@cergo/core";
import { createHotelFixture, createTestDeps, resetDatabase } from "@cergo/core/testing";
import { agentConfigVersions, eq, jobs, sql, withTenant } from "@cergo/db";
import { IntegrationError, type AgentPublishPayload, type VoiceAgentProvider } from "@cergo/integrations";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { JobRunner } from "./runner";

class FlakyVoice implements VoiceAgentProvider {
  readonly configured = true;
  calls: AgentPublishPayload[] = [];
  constructor(private readonly mode: "ok" | "reject") {}
  async updateAgent(_id: string, payload: AgentPublishPayload) {
    this.calls.push(payload);
    if (this.mode === "reject") throw new IntegrationError("elevenlabs", "Prompt inválido", 400, false);
  }
  async getSignedUrl() {
    return "wss://example.test";
  }
  async fetchConversationAudio() {
    return null;
  }
}

const deps = createTestDeps();
afterAll(() => deps.close());
const opts = { concurrency: 4, pollMs: 10, maintenanceHour: 99 };

const config = () =>
  agentConfigSchema.parse({
    hotel: { name: "Casa del Lago" },
    greeting: "Hola, {{hotel_nombre}}.",
    rooms: [{ name: "Doble", capacity: "2", rateUsd: 100, highSeasonRateUsd: null }],
    receptionHours: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] },
  });

async function draftAndRequest(d: typeof deps, hotelId: string, staffId: string) {
  const draft = await withTenant(d.db, hotelId, (tx) => saveDraft(tx, hotelId, { config: config() }, { userId: staffId }));
  await withTenant(d.db, hotelId, (tx) => requestPublish(d, tx, hotelId, { versionId: draft.id }, { userId: staffId }));
  return draft.id;
}

describe("worker", () => {
  beforeEach(() => resetDatabase(deps.db));

  it("procesa avisos y publicaciones encolados", async () => {
    const fx = await createHotelFixture(deps, { name: "Casa del Lago", elevenlabsAgentId: "agent_w" });
    await deps.db.execute(sql`update organizations set settings = settings || '{"notifyEmails":["recepcion@lago.test"]}'::jsonb`);
    const voice = new FlakyVoice("ok");
    const withVoice = { ...deps, voice };
    const versionId = await draftAndRequest(withVoice, fx.hotelId, fx.staffId);
    const ctx = await authenticateTool(deps, fx.toolToken);
    await handoffTool(deps, ctx, { reason: "Quiere hablar con recepción", urgency: "normal" });

    await new JobRunner(withVoice, null, opts).drain();

    expect(voice.calls).toHaveLength(1);
    expect(voice.calls[0]?.prompt).toContain("Casa del Lago");
    const [v] = await deps.db.select().from(agentConfigVersions).where(eq(agentConfigVersions.id, versionId));
    expect(v?.status).toBe("published");
    expect(deps.mailer.sent.some((m) => m.to.includes("recepcion@lago.test"))).toBe(true);
    const pending = await deps.db.select().from(jobs).where(sql`${jobs.status} <> 'done'`);
    expect(pending).toHaveLength(0);
  });

  it("si ElevenLabs rechaza el cambio, la versión queda 'falló' y el agente en vivo no cambia", async () => {
    const fx = await createHotelFixture(deps, { name: "Hotel Rechazo", elevenlabsAgentId: "agent_r" });
    const voice = new FlakyVoice("reject");
    const withVoice = { ...deps, voice };
    const versionId = await draftAndRequest(withVoice, fx.hotelId, fx.staffId);
    await new JobRunner(withVoice, null, opts).drain();
    const [v] = await deps.db.select().from(agentConfigVersions).where(eq(agentConfigVersions.id, versionId));
    expect(v?.status).toBe("failed");
    expect(v?.error).toMatch(/rechazó/);
  });
});
