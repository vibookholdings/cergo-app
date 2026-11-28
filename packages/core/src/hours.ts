import type { WeeklySchedule } from "@cergo/contracts";

const WEEKDAY: Record<string, string> = { Sun: "0", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6" };

/** Día de la semana y hora local (HH:MM) de un instante en una zona horaria. */
export function localParts(date: Date, timeZone: string): { weekday: string; time: string; day: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return {
    weekday: WEEKDAY[parts.weekday ?? "Sun"] ?? "0",
    time: `${String(hour).padStart(2, "0")}:${parts.minute}`,
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
  };
}

/** Fecha local (AAAA-MM-DD) de un instante en la zona horaria del hotel. */
export function localDay(date: Date, timeZone: string): string {
  return localParts(date, timeZone).day;
}

/**
 * ¿Recepción está atendiendo en ese momento? Un rango con `to` menor que `from` cruza la
 * medianoche (por ejemplo 22:00 a 06:00). "23:59" como fin cuenta todo el último minuto.
 */
export function isWithinSchedule(date: Date, schedule: WeeklySchedule | null | undefined, timeZone: string): boolean {
  if (!schedule) return true;
  const { weekday, time } = localParts(date, timeZone);
  const prevDay = String((Number(weekday) + 6) % 7) as keyof WeeklySchedule;
  const today = schedule[weekday as keyof WeeklySchedule] ?? [];
  for (const r of today) {
    if (r.from <= r.to) {
      if (time >= r.from && (time < r.to || r.to === "23:59")) return true;
    } else if (time >= r.from) {
      return true;
    }
  }
  for (const r of schedule[prevDay] ?? []) {
    if (r.from > r.to && time < r.to) return true;
  }
  return false;
}

/** Suma días a una fecha AAAA-MM-DD sin pasar por zonas horarias. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
