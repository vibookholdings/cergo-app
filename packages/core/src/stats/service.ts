import {
  callReasons,
  type BookingListItem,
  type CallReason,
  type DashboardData,
  type DashboardRange,
  type HandoffListItem,
} from "@cergo/contracts";
import { and, dailyStats, eq, gte, lte, sql, type DbOrTx } from "@cergo/db";
import { addDays, daysBetween, localDay } from "../hours";

/**
 * Recalcula la fila de `daily_stats` de un hotel y un día (en la zona horaria del hotel).
 * Es idempotente: se puede correr las veces que haga falta.
 */
export async function recomputeDailyStats(tx: DbOrTx, hotelId: string, day: string, timezone: string): Promise<void> {
  await tx.execute(sql`
    with bounds as (
      select (${day}::date)::timestamp at time zone ${timezone} as d0,
             ((${day}::date + 1)::timestamp) at time zone ${timezone} as d1
    ), c as (
      select calls.* from calls, bounds
      where hotel_id = ${hotelId} and is_test = false and started_at >= bounds.d0 and started_at < bounds.d1
    ), b as (
      select bookings.* from bookings, bounds
      where hotel_id = ${hotelId} and created_at >= bounds.d0 and created_at < bounds.d1
    ), agg as (
      select count(*)::int as calls,
        count(*) filter (where outcome in ('resolved', 'quote', 'booking'))::int as resolved,
        count(*) filter (where handed_off)::int as handed_off,
        count(*) filter (where after_hours)::int as after_hours,
        coalesce(sum(duration_secs), 0)::int as duration_secs,
        coalesce(sum(duration_secs) filter (where outcome in ('resolved', 'quote', 'booking')), 0)::int as resolved_duration_secs
      from c
    ), reasons as (
      select coalesce(jsonb_object_agg(reason, n), '{}'::jsonb) as m
      from (select reason, count(*)::int as n from c group by reason) x
    ), languages as (
      select coalesce(jsonb_object_agg(lang, n), '{}'::jsonb) as m
      from (select coalesce(language, 'otro') as lang, count(*)::int as n from c group by 1) x
    ), hours as (
      select jsonb_agg(coalesce(x.n, 0) order by h.h) as m
      from generate_series(0, 23) as h(h)
      left join (
        select extract(hour from started_at at time zone ${timezone})::int as hr, count(*)::int as n from c group by 1
      ) x on x.hr = h.h
    ), bk as (
      select count(*) filter (where kind = 'quote')::int as quotes,
        count(*) filter (where kind = 'booking')::int as bookings,
        coalesce(sum(total_usd) filter (where kind = 'booking' and status in ('confirmed', 'paid')), 0) as revenue
      from b
    )
    insert into daily_stats (hotel_id, day, calls, resolved, handed_off, after_hours, quotes, bookings, revenue_usd,
      duration_secs, resolved_duration_secs, by_reason, by_language, by_hour, updated_at)
    select ${hotelId}, ${day}::date, agg.calls, agg.resolved, agg.handed_off, agg.after_hours, bk.quotes, bk.bookings,
      bk.revenue, agg.duration_secs, agg.resolved_duration_secs, reasons.m, languages.m, hours.m, now()
    from agg, reasons, languages, hours, bk
    on conflict (hotel_id, day) do update set
      calls = excluded.calls, resolved = excluded.resolved, handed_off = excluded.handed_off,
      after_hours = excluded.after_hours, quotes = excluded.quotes, bookings = excluded.bookings,
      revenue_usd = excluded.revenue_usd, duration_secs = excluded.duration_secs,
      resolved_duration_secs = excluded.resolved_duration_secs, by_reason = excluded.by_reason,
      by_language = excluded.by_language, by_hour = excluded.by_hour, updated_at = now()
  `);
}

type StatsRow = typeof dailyStats.$inferSelect;

function sumRows(rows: StatsRow[]) {
  const t = {
    calls: 0,
    resolved: 0,
    handedOff: 0,
    afterHours: 0,
    quotes: 0,
    bookings: 0,
    revenueUsd: 0,
    durationSecs: 0,
    resolvedDurationSecs: 0,
    byHour: Array.from({ length: 24 }, () => 0),
    byReason: Object.fromEntries(callReasons.map((r) => [r, 0])) as Record<CallReason, number>,
    byLanguage: {} as Record<string, number>,
  };
  for (const r of rows) {
    t.calls += r.calls;
    t.resolved += r.resolved;
    t.handedOff += r.handedOff;
    t.afterHours += r.afterHours;
    t.quotes += r.quotes;
    t.bookings += r.bookings;
    t.revenueUsd += Number(r.revenueUsd);
    t.durationSecs += r.durationSecs;
    t.resolvedDurationSecs += r.resolvedDurationSecs;
    r.byHour.forEach((n, i) => {
      if (i < 24) t.byHour[i] = (t.byHour[i] ?? 0) + n;
    });
    for (const [k, n] of Object.entries(r.byReason)) {
      if (k in t.byReason) t.byReason[k as CallReason] += n;
    }
    for (const [k, n] of Object.entries(r.byLanguage)) t.byLanguage[k] = (t.byLanguage[k] ?? 0) + n;
  }
  return t;
}

const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export function rangeBounds(range: DashboardRange, today: string): { from: string; to: string } {
  switch (range) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

export async function getDashboard(
  tx: DbOrTx,
  hotel: { id: string; timezone: string; monthlyMinutes: number },
  range: DashboardRange,
  todo: { openHandoffs: HandoffListItem[]; pendingBookings: BookingListItem[] },
  now = new Date(),
): Promise<DashboardData> {
  const today = localDay(now, hotel.timezone);
  const { from, to } = rangeBounds(range, today);
  const span = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  const monthFrom = `${today.slice(0, 8)}01`;

  const rows = await tx
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.hotelId, hotel.id), gte(dailyStats.day, prevFrom < monthFrom ? prevFrom : monthFrom), lte(dailyStats.day, to)));

  const inRange = rows.filter((r) => r.day >= from && r.day <= to);
  const prev = sumRows(rows.filter((r) => r.day >= prevFrom && r.day <= prevTo));
  const cur = sumRows(inRange);
  const month = sumRows(rows.filter((r) => r.day >= monthFrom && r.day <= today));

  const byDay = new Map(inRange.map((r) => [r.day, r]));
  const series = Array.from({ length: span }, (_, i) => {
    const day = addDays(from, i);
    const r = byDay.get(day);
    return { day, calls: r?.calls ?? 0, resolved: r?.resolved ?? 0, handedOff: r?.handedOff ?? 0 };
  });

  return {
    range,
    from,
    to,
    timezone: hotel.timezone,
    totals: {
      calls: cur.calls,
      resolved: cur.resolved,
      handedOff: cur.handedOff,
      afterHours: cur.afterHours,
      quotes: cur.quotes,
      bookings: cur.bookings,
      revenueUsd: Math.round(cur.revenueUsd * 100) / 100,
      minutes: Math.round(cur.durationSecs / 60),
      avgDurationSecs: cur.calls ? Math.round(cur.durationSecs / cur.calls) : 0,
      resolutionRate: rate(cur.resolved, cur.calls),
      hoursSaved: Math.round((cur.resolvedDurationSecs / 3600) * 10) / 10,
      quoteToBookingRate: rate(cur.bookings, cur.quotes),
    },
    previous: {
      calls: prev.calls,
      resolutionRate: rate(prev.resolved, prev.calls),
      bookings: prev.bookings,
      revenueUsd: Math.round(prev.revenueUsd * 100) / 100,
    },
    series,
    byHour: cur.byHour,
    byReason: cur.byReason,
    byLanguage: cur.byLanguage,
    usage: { monthMinutes: Math.round(month.durationSecs / 60), planMinutes: hotel.monthlyMinutes },
    todo,
  };
}
