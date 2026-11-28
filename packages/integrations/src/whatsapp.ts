import { ensureOk, fetchWithTimeout } from "./http";

export interface WhatsappSender {
  readonly kind: "twilio" | "memory";
  send(to: string, body: string): Promise<void>;
}

/**
 * WhatsApp vía Twilio. Ojo: fuera de la ventana de 24 h, Meta exige plantillas aprobadas;
 * para avisos a recepción conviene que el número de recepción le escriba una vez al de CERGO.
 */
export class TwilioWhatsappSender implements WhatsappSender {
  readonly kind = "twilio" as const;
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(to: string, body: string): Promise<void> {
    const form = new URLSearchParams({
      From: this.from.startsWith("whatsapp:") ? this.from : `whatsapp:${this.from}`,
      To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      Body: body,
    });
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const res = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        timeoutMs: 10_000,
      },
    );
    await ensureOk("twilio", res);
  }
}

export class MemoryWhatsappSender implements WhatsappSender {
  readonly kind = "memory" as const;
  readonly sent: { to: string; body: string }[] = [];
  constructor(private readonly log?: (msg: string, data: unknown) => void) {}

  async send(to: string, body: string): Promise<void> {
    this.sent.push({ to, body });
    this.log?.("whatsapp (sin proveedor configurado)", { to, body });
  }
}
