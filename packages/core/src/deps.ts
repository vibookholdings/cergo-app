import type { Db } from "@cergo/db";
import type {
  Mailer,
  ObjectStorage,
  PmsAdapter,
  VoiceAgentProvider,
  WhatsappSender,
} from "@cergo/integrations";
import type { AiReviewer } from "./agent/review";
import type { Logger } from "./logger";

export type AppConfig = {
  env: "development" | "test" | "production";
  /** URL pública del panel, para los links de los mails. */
  appUrl: string;
  /** Secreto para cifrar semillas de 2FA. */
  authSecret: string;
  /** Exigir 2FA al equipo CERGO para entrar al panel interno. */
  requireStaffMfa: boolean;
  /** Costo estimado por minuto de llamada (USD), para el panel interno. */
  costPerMinuteUsd: number;
};

/** Todo lo que la lógica de negocio necesita del mundo exterior. Se arma una vez por proceso. */
export type Deps = {
  db: Db;
  log: Logger;
  config: AppConfig;
  mailer: Mailer;
  whatsapp: WhatsappSender;
  voice: VoiceAgentProvider;
  storage: ObjectStorage;
  pms: PmsAdapter;
  aiReviewer: AiReviewer | null;
};
