import { callReasons, type CallReason } from "@cergo/contracts";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const reasonKeywords: Record<Exclude<CallReason, "other">, string[]> = {
  complaint: ["reclamo", "queja", "problema", "reembolso", "devolucion", "factura", "cobro", "cobraron", "complaint", "refund", "reclamacao"],
  change: ["cambiar la reserva", "cambio de reserva", "modificar", "cancelar", "cancelacion", "cambiar las fechas", "postergar", "cancel", "change my booking", "alterar"],
  reservation: ["reservar", "reserva", "disponibilidad", "cotizacion", "cuanto sale", "cuanto cuesta", "tarifa", "precio", "habitacion para", "book", "booking", "availability", "price", "reservar um", "quarto"],
  inquiry: ["horario", "check-in", "check in", "checkout", "check-out", "estacionamiento", "desayuno", "mascota", "wifi", "como llego", "ubicacion", "piscina", "spa", "parking", "breakfast", "pet", "cafe da manha"],
};

/** Mapea el "motivo" que devuelve el análisis de ElevenLabs (si está configurado) a nuestras categorías. */
export function reasonFromAnalysis(value: unknown): CallReason | null {
  if (typeof value !== "string") return null;
  const v = normalize(value.trim());
  if ((callReasons as readonly string[]).includes(v)) return v as CallReason;
  if (/reclam|queja|complain|factur|reembols/.test(v)) return "complaint";
  if (/cambi|modific|cancel/.test(v)) return "change";
  if (/reserv|cotiz|book|precio|tarifa/.test(v)) return "reservation";
  if (/consult|pregunt|inform|inquir/.test(v)) return "inquiry";
  if (/otro|other/.test(v)) return "other";
  return null;
}

/**
 * Clasificación por palabras clave sobre lo que dijo el huésped. Es una red de seguridad:
 * lo ideal es configurar "motivo" en el análisis de ElevenLabs y usar ese valor.
 */
export function classifyReason(
  guestText: string,
  signals: { hasBooking: boolean; hasQuote: boolean; hasHandoff: boolean },
): CallReason {
  const text = normalize(guestText);
  const score = (k: keyof typeof reasonKeywords) => reasonKeywords[k].reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
  if (score("complaint") > 0) return "complaint";
  if (score("change") > 0) return "change";
  if (signals.hasBooking || signals.hasQuote || score("reservation") > 0) return "reservation";
  if (score("inquiry") > 0) return "inquiry";
  return "other";
}

const stopwords: Record<"es" | "en" | "pt", string[]> = {
  es: [" que ", " de ", " la ", " el ", " quiero ", " para ", " habitacion ", " gracias ", " hola ", " por favor ", " tienen ", " noche "],
  en: [" the ", " and ", " want ", " room ", " thanks ", " hello ", " please ", " do you ", " night ", " is ", " for "],
  pt: [" voce ", " obrigado ", " obrigada ", " quarto ", " ola ", " por favor ", " noite ", " tem ", " gostaria ", " uma ", " com "],
};

/** Idioma predominante de lo que dijo el huésped, si ElevenLabs no lo informa. */
export function detectLanguage(guestText: string): "es" | "en" | "pt" | null {
  const text = ` ${normalize(guestText).replace(/[^\p{L}\s]/gu, " ")} `;
  if (text.trim().length < 8) return null;
  const scores = (Object.keys(stopwords) as ("es" | "en" | "pt")[]).map((lang) => ({
    lang,
    n: stopwords[lang].reduce((acc, w) => acc + text.split(w).length - 1, 0),
  }));
  scores.sort((a, b) => b.n - a.n);
  return scores[0] && scores[0].n > 0 ? scores[0].lang : null;
}
