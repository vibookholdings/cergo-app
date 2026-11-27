import type { BookingStatus, CallOutcome, HandoffStatus, HandoffUrgency } from "@cergo/contracts";

type Tone = "lime" | "warn" | "soft" | "brand" | "error";

export const outcomeTone = (o: CallOutcome): Tone =>
  o === "booking" || o === "resolved" ? "lime" : o === "quote" ? "brand" : o === "handed_off" ? "warn" : o === "failed" ? "error" : "soft";

export const handoffTone = (s: HandoffStatus): Tone => (s === "resolved" ? "lime" : s === "in_progress" ? "brand" : "warn");

export const urgencyTone = (u: HandoffUrgency): Tone => (u === "emergency" ? "error" : u === "high" ? "warn" : "soft");

export const bookingTone = (s: BookingStatus): Tone =>
  s === "confirmed" || s === "paid" ? "lime" : s === "pending" ? "warn" : s === "quoted" ? "brand" : "soft";
