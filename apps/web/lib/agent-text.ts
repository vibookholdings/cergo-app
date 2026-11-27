import { languageLabels, weekdayLabels, weekdays, type AgentConfig } from "@cergo/contracts";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const md = (v: string) => {
  const [m, d] = v.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1] ?? ""}`;
};
const usd = (n: number | null) => (n === null ? "sin tarifa" : `USD ${n}`);

/**
 * Ficha legible de una configuración, una línea por dato, para comparar versiones con un diff
 * que entienda cualquiera del hotel (no JSON).
 */
export function configToText(c: AgentConfig): string {
  const out: string[] = [];
  const block = (title: string, lines: string[]) => {
    out.push(`## ${title}`);
    out.push(...(lines.length ? lines : ["(vacío)"]));
    out.push("");
  };
  const text = (v: string) => (v.trim() ? v.trim().split("\n") : []);

  block("Datos del hotel", [
    `Nombre: ${c.hotel.name}`,
    `Ciudad: ${c.hotel.city || "—"}`,
    `Dirección: ${c.hotel.address || "—"}`,
    `Teléfono: ${c.hotel.phone || "—"}`,
    `Mail: ${c.hotel.email || "—"}`,
    `Web: ${c.hotel.website || "—"}`,
    `Check-in: ${c.hotel.checkIn} · Check-out: ${c.hotel.checkOut}`,
    `Idiomas: ${c.languages.map((l) => languageLabels[l]).join(", ")}`,
  ]);
  block("Saludo", text(c.greeting));
  block("Estilo", text(c.personality));
  block("Qué resolver", text(c.objectives));
  block(
    "Habitaciones",
    c.rooms.map((r) => `${r.name}${r.capacity ? ` (${r.capacity})` : ""}: ${usd(r.rateUsd)}${r.highSeasonRateUsd !== null ? ` · alta ${usd(r.highSeasonRateUsd)}` : ""}${r.description ? ` · ${r.description}` : ""}`),
  );
  block("Temporada alta", c.highSeason.map((s) => `Del ${md(s.from)} al ${md(s.to)}`));
  block("Políticas", [...text(c.policies), `Máximo de habitaciones por reserva: ${c.maxGroupRooms}`]);
  block("Preguntas frecuentes", c.faq.flatMap((f) => [`P: ${f.question}`, `R: ${f.answer}`]));
  block(
    "Horario de recepción",
    weekdays.map((d) => `${weekdayLabels[d]}: ${c.receptionHours[d].length ? c.receptionHours[d].map((r) => `${r.from} a ${r.to}`).join(", ") : "cerrado"}`),
  );
  block("Cuándo derivar", text(c.handoffRules));
  block("Avanzado", [...text(c.advanced), ...(c.voiceId ? [`Voz: ${c.voiceId}`] : [])]);
  return out.join("\n");
}
