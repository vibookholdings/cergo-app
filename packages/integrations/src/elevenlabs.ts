import { createHmac, timingSafeEqual } from "node:crypto";
import { ensureOk, fetchWithTimeout, IntegrationError } from "./http";

export type AgentPublishPayload = {
  prompt: string;
  firstMessage: string;
  language?: string;
  voiceId?: string | null;
};

export interface VoiceAgentProvider {
  readonly configured: boolean;
  updateAgent(agentId: string, payload: AgentPublishPayload): Promise<void>;
  getSignedUrl(agentId: string): Promise<string>;
  fetchConversationAudio(conversationId: string): Promise<Uint8Array | null>;
}

const API = "https://api.elevenlabs.io";

export class ElevenLabsClient implements VoiceAgentProvider {
  readonly configured = true;
  constructor(private readonly apiKey: string) {}

  private headers() {
    return { "xi-api-key": this.apiKey, "content-type": "application/json" };
  }

  async updateAgent(agentId: string, payload: AgentPublishPayload): Promise<void> {
    const body = {
      conversation_config: {
        agent: {
          first_message: payload.firstMessage,
          ...(payload.language ? { language: payload.language } : {}),
          prompt: { prompt: payload.prompt },
          // Valor por defecto de la marca de prueba: en llamadas reales vale "0"; la prueba desde
          // el panel manda "1" y las herramientas no guardan nada.
          dynamic_variables: { dynamic_variable_placeholders: { cergo_test: "0" } },
        },
        ...(payload.voiceId ? { tts: { voice_id: payload.voiceId } } : {}),
      },
    };
    const res = await fetchWithTimeout(`${API}/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
      timeoutMs: 15_000,
    });
    await ensureOk("elevenlabs", res);
  }

  async getSignedUrl(agentId: string): Promise<string> {
    const res = await fetchWithTimeout(
      `${API}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: this.headers(), timeoutMs: 8_000 },
    );
    await ensureOk("elevenlabs", res);
    const json = (await res.json()) as { signed_url?: string };
    if (!json.signed_url) throw new IntegrationError("elevenlabs", "Sin signed_url en la respuesta");
    return json.signed_url;
  }

  async fetchConversationAudio(conversationId: string): Promise<Uint8Array | null> {
    const res = await fetchWithTimeout(
      `${API}/v1/convai/conversations/${encodeURIComponent(conversationId)}/audio`,
      { headers: { "xi-api-key": this.apiKey }, timeoutMs: 30_000 },
    );
    if (res.status === 404) return null;
    await ensureOk("elevenlabs", res);
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Sin API key: no publica nada y lo dice claro (staging sin credenciales, tests). */
export class DisabledVoiceAgentProvider implements VoiceAgentProvider {
  readonly configured = false;
  readonly published: { agentId: string; payload: AgentPublishPayload }[] = [];
  constructor(private readonly recordOnly = false) {}

  async updateAgent(agentId: string, payload: AgentPublishPayload): Promise<void> {
    if (this.recordOnly) {
      this.published.push({ agentId, payload });
      return;
    }
    throw new IntegrationError(
      "elevenlabs",
      "Falta ELEVENLABS_API_KEY: no se puede publicar en ElevenLabs",
      undefined,
      false,
    );
  }
  async getSignedUrl(): Promise<string> {
    throw new IntegrationError("elevenlabs", "Falta ELEVENLABS_API_KEY", undefined, false);
  }
  async fetchConversationAudio(): Promise<Uint8Array | null> {
    return null;
  }
}

/**
 * Verifica la firma `ElevenLabs-Signature: t=<unix>,v0=<hmac_sha256(secret, "<t>.<body>")>`.
 * Rechaza eventos más viejos que `toleranceSecs` para evitar reenvíos maliciosos.
 */
export function verifyElevenlabsSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  opts: { toleranceSecs?: number; now?: number } = {},
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string | undefined>;
  const t = Number(parts.t);
  const sig = parts.v0;
  if (!Number.isFinite(t) || !sig) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSecs ?? 30 * 60)) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signElevenlabsPayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v0=${sig}`;
}
