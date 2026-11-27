import type { AgentConfig, ReviewItem } from "@cergo/contracts";
import type { CompiledAgent } from "./compose";

/** Revisión con IA (opcional): devuelve avisos, nunca bloquea por sí sola. */
export interface AiReviewer {
  review(input: { config: AgentConfig; compiled: CompiledAgent; baseLayer: string }): Promise<ReviewItem[]>;
}

type Rule = { pattern: RegExp; severity: ReviewItem["severity"]; message: string };

/**
 * Frases que chocan con la capa base. Se buscan en todo lo que escribe el hotel.
 * Son "error": no se puede publicar hasta corregirlas.
 */
const conflictRules: Rule[] = [
  {
    pattern: /(ped[ií]|solicit[aá]|tom[aá]|anot[aá])\w*\s+(los\s+|el\s+)?(datos|n[uú]mero)s?\s+de\s+(la\s+)?tarjeta|\bcvv\b|c[oó]digo de seguridad de la tarjeta/i,
    severity: "error",
    message: "El agente no puede pedir datos de tarjeta por teléfono: el pago es siempre por link (regla base).",
  },
  {
    pattern: /\b(no|nunca|jam[aá]s)\s+(derives?|transfieras?|pases?\s+con\s+recepci[oó]n)/i,
    severity: "error",
    message: "No se pueden sacar los casos de derivación de la regla base (reclamos, emergencias, grupos, pedido explícito).",
  },
  {
    pattern: /\binvent[aá]|pod[eé]s inventar|si no sab[eé]s.{0,30}(decí|deci|respond[eé]) (algo|cualquier)/i,
    severity: "error",
    message: "El agente nunca inventa precios, disponibilidad ni servicios (regla base).",
  },
  {
    pattern: /ignor[aá]\w*\s+(las|tus|todas las)?\s*(reglas|instrucciones)|olvid[aá]\w*\s+(las|tus)\s+(reglas|instrucciones)/i,
    severity: "error",
    message: "No se pueden dar instrucciones para que el agente ignore sus reglas base.",
  },
  {
    pattern: /(dec[ií]|dec[ií]le|afirm[aá])\w*\s+que\s+sos\s+(un|una)\s+(persona|humano|humana)|no\s+(digas|admitas)\s+que\s+sos\s+(un\s+)?(asistente|bot|robot|ia)/i,
    severity: "error",
    message: "Si le preguntan, el agente no puede negar que es un asistente virtual (regla base).",
  },
  {
    pattern: /dato[s]? de (otros|otro) hu[eé]sped|inform[aá]\w* si (un|una) (hu[eé]sped|persona) est[aá] alojad/i,
    severity: "error",
    message: "El agente no puede dar datos de otros huéspedes (regla base de privacidad).",
  },
  {
    pattern: /garantiz[aá]\w*\s+(la\s+)?disponibilidad|confirm[aá]\w*\s+la\s+reserva\s+sin\s+(se[nñ]a|pago)/i,
    severity: "warning",
    message: "El agente no confirma disponibilidad ni reservas firmes: las deja cargadas y recepción confirma.",
  },
];

function hotelTexts(config: AgentConfig): { section: string; text: string }[] {
  return [
    { section: "Saludo", text: config.greeting },
    { section: "Estilo", text: config.personality },
    { section: "Qué resolver", text: config.objectives },
    { section: "Cuándo derivar", text: config.handoffRules },
    { section: "Políticas", text: config.policies },
    { section: "Modo avanzado", text: config.advanced },
    ...config.faq.map((f, i) => ({ section: `Pregunta frecuente ${i + 1}`, text: `${f.question} ${f.answer}` })),
    ...config.rooms.map((r) => ({ section: `Habitación ${r.name}`, text: r.description })),
  ];
}

/** Revisión automática antes de publicar. Los "error" bloquean; los "warning" e "info" solo avisan. */
export function reviewConfig(config: AgentConfig, compiled: CompiledAgent): ReviewItem[] {
  const items: ReviewItem[] = [];

  for (const { section, text } of hotelTexts(config)) {
    if (!text) continue;
    for (const rule of conflictRules) {
      if (rule.pattern.test(text)) items.push({ severity: rule.severity, section, message: rule.message });
    }
  }

  if (config.rooms.length === 0) {
    items.push({ severity: "warning", section: "Habitaciones", message: "No hay habitaciones cargadas: el agente no va a poder cotizar." });
  }
  for (const r of config.rooms) {
    if (r.rateUsd === null) {
      items.push({ severity: "warning", section: `Habitación ${r.name}`, message: "No tiene tarifa: el agente va a derivar las cotizaciones de esta habitación." });
    }
    if (r.highSeasonRateUsd !== null && config.highSeason.length === 0) {
      items.push({ severity: "warning", section: `Habitación ${r.name}`, message: "Tiene tarifa de temporada alta pero no cargaste las fechas de temporada alta." });
    }
  }
  const names = config.rooms.map((r) => r.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    items.push({ severity: "warning", section: "Habitaciones", message: "Hay dos habitaciones con el mismo nombre." });
  }
  if (config.faq.length === 0) {
    items.push({ severity: "info", section: "Preguntas frecuentes", message: "Sin preguntas frecuentes, el agente va a derivar más consultas." });
  }
  const questions = config.faq.map((f) => f.question.trim().toLowerCase());
  if (new Set(questions).size !== questions.length) {
    items.push({ severity: "warning", section: "Preguntas frecuentes", message: "Hay preguntas repetidas: dejá una sola respuesta por pregunta." });
  }
  const openDays = Object.values(config.receptionHours).filter((r) => r.length > 0).length;
  if (openDays === 0) {
    items.push({ severity: "warning", section: "Horarios", message: "Recepción figura cerrada todos los días: revisá el horario." });
  }
  for (const [day, ranges] of Object.entries(config.receptionHours)) {
    for (const r of ranges) {
      if (r.from === r.to) {
        items.push({ severity: "warning", section: "Horarios", message: `Hay un horario que empieza y termina a la misma hora (${r.from}) el día ${day}.` });
      }
    }
  }
  if (!config.hotel.phone) {
    items.push({ severity: "info", section: "Datos generales", message: "Sin teléfono de recepción: el agente no lo va a poder dar si se lo piden." });
  }
  if (compiled.prompt.length > 30_000) {
    items.push({ severity: "warning", section: "General", message: "El texto total es muy largo y puede hacer más lento al agente. Resumí políticas o preguntas frecuentes." });
  }
  return items;
}

export const hasBlocking = (items: ReviewItem[]) => items.some((i) => i.severity === "error");
