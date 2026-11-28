import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usá el formato HH:MM");
const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Usá el formato MM-DD");

export const timeRangeSchema = z.object({ from: hhmm, to: hhmm });
export type TimeRange = z.infer<typeof timeRangeSchema>;

export const weekdays = ["1", "2", "3", "4", "5", "6", "0"] as const;
export const weekdayLabels: Record<(typeof weekdays)[number], string> = {
  "1": "Lunes",
  "2": "Martes",
  "3": "Miércoles",
  "4": "Jueves",
  "5": "Viernes",
  "6": "Sábado",
  "0": "Domingo",
};

export const weeklyScheduleSchema = z.object({
  "0": z.array(timeRangeSchema).max(4),
  "1": z.array(timeRangeSchema).max(4),
  "2": z.array(timeRangeSchema).max(4),
  "3": z.array(timeRangeSchema).max(4),
  "4": z.array(timeRangeSchema).max(4),
  "5": z.array(timeRangeSchema).max(4),
  "6": z.array(timeRangeSchema).max(4),
});
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;

export const roomSchema = z.object({
  name: z.string().trim().min(1, "Poné el nombre de la habitación").max(80),
  capacity: z.string().trim().max(120).default(""),
  rateUsd: z.number().nonnegative().max(100_000).nullable().default(null),
  highSeasonRateUsd: z.number().nonnegative().max(100_000).nullable().default(null),
  description: z.string().trim().max(600).default(""),
});
export type Room = z.infer<typeof roomSchema>;

export const faqItemSchema = z.object({
  question: z.string().trim().min(1, "Falta la pregunta").max(300),
  answer: z.string().trim().min(1, "Falta la respuesta").max(2000),
});
export type FaqItem = z.infer<typeof faqItemSchema>;

export const languageSchema = z.enum(["es", "en", "pt"]);
export type Language = z.infer<typeof languageSchema>;
export const languageLabels: Record<Language, string> = {
  es: "Español",
  en: "Inglés",
  pt: "Portugués",
};

/**
 * Capa del hotel: todo lo que el hotel edita por su cuenta desde el panel.
 * La capa base de CERGO (reglas fijas) vive en @cergo/core y no se edita desde acá.
 */
export const agentConfigSchema = z.object({
  hotel: z.object({
    name: z.string().trim().min(1, "Poné el nombre del hotel").max(120),
    city: z.string().trim().max(120).default(""),
    address: z.string().trim().max(240).default(""),
    phone: z.string().trim().max(60).default(""),
    email: z.string().trim().max(160).default(""),
    website: z.string().trim().max(200).default(""),
    checkIn: hhmm.default("15:00"),
    checkOut: hhmm.default("11:00"),
  }),
  personality: z.string().max(4000).default(""),
  greeting: z.string().trim().min(1, "El saludo no puede quedar vacío").max(500),
  objectives: z.string().max(4000).default(""),
  handoffRules: z.string().max(4000).default(""),
  maxGroupRooms: z.number().int().min(1).max(200).default(4),
  policies: z.string().max(8000).default(""),
  rooms: z.array(roomSchema).max(60).default([]),
  highSeason: z.array(z.object({ from: mmdd, to: mmdd })).max(12).default([]),
  faq: z.array(faqItemSchema).max(300).default([]),
  receptionHours: weeklyScheduleSchema,
  languages: z.array(languageSchema).min(1).max(3).default(["es"]),
  voiceId: z.string().trim().max(120).nullable().default(null),
  advanced: z.string().max(10_000).default(""),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type AgentConfigInput = z.input<typeof agentConfigSchema>;

export const alwaysOpen = (): WeeklySchedule => ({
  "0": [{ from: "00:00", to: "23:59" }],
  "1": [{ from: "00:00", to: "23:59" }],
  "2": [{ from: "00:00", to: "23:59" }],
  "3": [{ from: "00:00", to: "23:59" }],
  "4": [{ from: "00:00", to: "23:59" }],
  "5": [{ from: "00:00", to: "23:59" }],
  "6": [{ from: "00:00", to: "23:59" }],
});

export function emptyAgentConfig(hotelName: string, city = ""): AgentConfig {
  return agentConfigSchema.parse({
    hotel: { name: hotelName, city },
    greeting: `Hola, buenas, ${hotelName}, te habla el asistente de recepción. ¿En qué te puedo ayudar?`,
    receptionHours: alwaysOpen(),
  });
}

export type ReviewSeverity = "error" | "warning" | "info";
export type ReviewItem = {
  severity: ReviewSeverity;
  section: string;
  message: string;
};
