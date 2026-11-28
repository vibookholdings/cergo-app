import { ensureOk, fetchWithTimeout } from "./http";

export type MailMessage = { to: string[]; subject: string; text: string; html?: string };

export interface Mailer {
  readonly kind: "resend" | "memory";
  send(msg: MailMessage): Promise<void>;
}

export class ResendMailer implements Mailer {
  readonly kind = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(msg: MailMessage): Promise<void> {
    if (msg.to.length === 0) return;
    const res = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
      timeoutMs: 10_000,
    });
    await ensureOk("resend", res);
  }
}

/** Sin proveedor configurado: guarda los mails en memoria y los muestra en el log (desarrollo y tests). */
export class MemoryMailer implements Mailer {
  readonly kind = "memory" as const;
  readonly sent: MailMessage[] = [];
  constructor(private readonly log?: (msg: string, data: unknown) => void) {}

  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg);
    this.log?.("mail (sin proveedor configurado)", { to: msg.to, subject: msg.subject, text: msg.text });
  }
}
