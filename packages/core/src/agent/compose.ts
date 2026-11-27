import { languageLabels, weekdayLabels, weekdays, type AgentConfig, type WeeklySchedule } from "@cergo/contracts";
import { BASE_LAYER, BASE_LAYER_VERSION } from "./base-layer";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function formatMonthDay(mmdd: string): string {
  const [m, d] = mmdd.split("-").map(Number);
  return `${d} de ${MONTHS[(m ?? 1) - 1]}`;
}

const usd = (n: number) => `USD ${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** "Lunes a viernes: 08:00 a 20:00", agrupando días consecutivos con el mismo horario. */
export function formatSchedule(schedule: WeeklySchedule): string[] {
  const describe = (day: (typeof weekdays)[number]) => {
    const ranges = schedule[day] ?? [];
    if (ranges.length === 0) return "cerrado";
    if (ranges.length === 1 && ranges[0]!.from === "00:00" && ranges[0]!.to === "23:59") return "las 24 horas";
    return ranges.map((r) => `${r.from} a ${r.to}`).join(" y ");
  };
  const lines: string[] = [];
  let start = 0;
  for (let i = 1; i <= weekdays.length; i++) {
    const prev = describe(weekdays[i - 1]!);
    if (i < weekdays.length && describe(weekdays[i]!) === prev) continue;
    const first = weekdayLabels[weekdays[start]!];
    const last = weekdayLabels[weekdays[i - 1]!];
    const label = start === i - 1 ? first : `${first} a ${last.toLowerCase()}`;
    lines.push(`${label}: ${prev}`);
    start = i;
  }
  if (lines.length === 1 && lines[0]!.startsWith("Lunes a domingo")) return [lines[0]!.replace("Lunes a domingo", "Todos los días")];
  return lines;
}

function section(title: string, body: string | string[] | null | undefined): string {
  const content = Array.isArray(body) ? body.filter(Boolean).join("\n") : (body ?? "").trim();
  return content ? `## ${title}\n${content}` : "";
}

export function fillVariables(text: string, config: AgentConfig): string {
  return text
    .replaceAll("{{hotel_nombre}}", config.hotel.name)
    .replaceAll("{{hotel_ciudad}}", config.hotel.city || "su ciudad")
    .replaceAll("{{max_habitaciones_grupo}}", String(config.maxGroupRooms));
}

export type CompiledAgent = {
  prompt: string;
  firstMessage: string;
  language: string;
  baseLayerVersion: string;
};

/**
 * Arma el prompt final: capa base de CERGO (fija) + capa del hotel (editable).
 * La capa base va primero y declara que prevalece ante cualquier contradicción.
 */
export function compileAgent(config: AgentConfig): CompiledAgent {
  const h = config.hotel;
  const general = [
    `- Nombre: ${h.name}`,
    h.city && `- Ciudad: ${h.city}`,
    h.address && `- Dirección: ${h.address}`,
    h.phone && `- Teléfono de recepción: ${h.phone}`,
    h.email && `- Mail: ${h.email}`,
    h.website && `- Web: ${h.website}`,
    `- Check-in desde las ${h.checkIn}. Check-out hasta las ${h.checkOut}.`,
    `- Idiomas en los que atendés: ${config.languages.map((l) => languageLabels[l]).join(", ")}.`,
  ].filter(Boolean) as string[];

  const rooms = config.rooms.map((r) => {
    const rates =
      r.rateUsd === null
        ? "tarifa a consultar con recepción"
        : `${usd(r.rateUsd)} por noche${r.highSeasonRateUsd !== null ? ` (temporada alta ${usd(r.highSeasonRateUsd)})` : ""}`;
    return `- ${r.name}${r.capacity ? ` (${r.capacity})` : ""}: ${rates}.${r.description ? ` ${r.description}` : ""}`;
  });

  const season = config.highSeason.map((s) => `- Del ${formatMonthDay(s.from)} al ${formatMonthDay(s.to)}.`);
  const faq = config.faq.map((f) => `- P: ${f.question}\n  R: ${f.answer}`);

  const hotelLayer = [
    "# Información del hotel",
    "Esta parte la carga el hotel. Usala para responder; si contradice las reglas base, valen las reglas base.",
    section("Datos generales", general),
    section("Horario de recepción", formatSchedule(config.receptionHours).map((l) => `- ${l}`)),
    section("Estilo propio del hotel", config.personality),
    section("Qué tenés que resolver", config.objectives),
    section("Cuándo derivar a recepción (además de las reglas base)", config.handoffRules),
    section("Habitaciones y tarifas de referencia (en dólares, por noche)", rooms),
    section("Temporada alta", season),
    section("Políticas", config.policies),
    section("Preguntas frecuentes", faq),
    section("Indicaciones adicionales del hotel", config.advanced),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    prompt: `${fillVariables(BASE_LAYER, config)}\n\n${hotelLayer}\n`,
    firstMessage: fillVariables(config.greeting, config),
    language: config.languages[0] ?? "es",
    baseLayerVersion: BASE_LAYER_VERSION,
  };
}
