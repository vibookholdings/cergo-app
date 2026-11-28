import { z } from "zod";

/** Entradas de las server tools que el agente de ElevenLabs llama durante la llamada. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** `cergo_test` llega como "1" en las pruebas desde el panel: se responde igual pero no se guarda nada. */
const common = {
  conversation_id: optionalText(200),
  cergo_test: optionalText(10),
};

export const quoteToolInput = z.object({
  ...common,
  check_in: isoDate,
  check_out: isoDate,
  adults: z.coerce.number().int().min(1).max(50).default(2),
  children: z.coerce.number().int().min(0).max(50).default(0),
  room_type: optionalText(120),
});
export type QuoteToolInput = z.infer<typeof quoteToolInput>;

export const bookingToolInput = z.object({
  ...common,
  guest_name: z.string().trim().min(1).max(160),
  guest_phone: z.string().trim().min(3).max(60),
  guest_email: optionalText(160),
  check_in: isoDate,
  check_out: isoDate,
  adults: z.coerce.number().int().min(1).max(50).default(2),
  children: z.coerce.number().int().min(0).max(50).default(0),
  room_type: z.string().trim().min(1).max(120),
  notes: optionalText(1000),
});
export type BookingToolInput = z.infer<typeof bookingToolInput>;

export const handoffToolInput = z.object({
  ...common,
  guest_name: optionalText(160),
  guest_phone: optionalText(60),
  reason: z.string().trim().min(1).max(300),
  summary: optionalText(2000),
  urgency: z.enum(["normal", "high", "emergency"]).default("normal"),
});
export type HandoffToolInput = z.infer<typeof handoffToolInput>;

export const availabilityToolInput = z.object({
  ...common,
  check_in: isoDate,
  check_out: isoDate,
  adults: z.coerce.number().int().min(1).max(50).default(2),
  children: z.coerce.number().int().min(0).max(50).default(0),
});
export type AvailabilityToolInput = z.infer<typeof availabilityToolInput>;
