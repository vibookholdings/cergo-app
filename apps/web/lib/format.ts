const AR = "es-AR";

export function formatDateTime(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat(AR, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat(AR, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));
}

export function formatDay(day: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat(AR, { ...opts, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

export function formatRelative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(AR, { numeric: "auto" });
  if (diff < 60) return "recién";
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

export function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m ? `${m} min ${String(s).padStart(2, "0")} s` : `${s} s`;
}

export function formatUsd(n: number | null | undefined, decimals = 0) {
  if (n === null || n === undefined) return "—";
  return `USD ${new Intl.NumberFormat(AR, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)}`;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat(AR).format(n);
}

/** 1.284 / 12,9 mil / 4,2 M */
export function compact(n: number) {
  return new Intl.NumberFormat(AR, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatPercent(n: number) {
  return `${new Intl.NumberFormat(AR, { maximumFractionDigits: 1 }).format(n)} %`;
}

/** Para fechas futuras: "dentro de 6 días". */
export function formatIn(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(AR, { numeric: "auto" });
  if (diff < 3600) return rtf.format(Math.max(1, Math.round(diff / 60)), "minute");
  if (diff < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
