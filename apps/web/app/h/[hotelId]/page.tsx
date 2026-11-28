"use client";

import { languageLabels, reasonLabels, type DashboardData, type DashboardRange, type Language } from "@cergo/contracts";
import { ArrowRight, BellRing, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ColumnChart, DataTable, Meter, RankedBars, SERIES, StatTile } from "@/components/charts";
import { useHotel } from "@/components/shell";
import { Alert, Card, CardHeader, EmptyState, Loading, PageHeader, Pill, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDay, formatDuration, formatNumber, formatPercent, formatRelative, formatUsd } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { urgencyTone } from "@/lib/labels";

const ranges: { value: DashboardRange; label: string; vs: string }[] = [
  { value: "today", label: "Hoy", vs: "vs. ayer" },
  { value: "7d", label: "7 días", vs: "vs. 7 días anteriores" },
  { value: "30d", label: "30 días", vs: "vs. 30 días anteriores" },
  { value: "month", label: "Este mes", vs: "vs. período anterior" },
];

function pctDelta(cur: number, prev: number) {
  if (!prev) return null;
  const v = Math.round(((cur - prev) / prev) * 100);
  return { value: v, text: `${v > 0 ? "+" : ""}${v} %` };
}

function pointsDelta(cur: number, prev: number, hadCalls: boolean) {
  if (!hadCalls) return null;
  const v = Math.round((cur - prev) * 10) / 10;
  return { value: v, text: `${v > 0 ? "+" : ""}${v} pts` };
}

export default function DashboardPage() {
  const hotel = useHotel();
  const [range, setRange] = useState<DashboardRange>("7d");
  const { data, error, loading } = useApi<DashboardData>(`/h/${hotel.id}/dashboard?range=${range}`);
  const vs = ranges.find((r) => r.value === range)!.vs;

  return (
    <>
      <PageHeader
        eyebrow={hotel.name}
        title={<>Así viene <em className="text-brand">tu recepción</em></>}
        description="Lo que atendió el agente, lo que quedó para el equipo y las reservas que entraron por teléfono."
      />
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Tabs value={range} onChange={setRange} options={ranges.map((r) => ({ value: r.value, label: r.label }))} />
        {data && <span className="text-[0.84rem] text-soft">{data.from === data.to ? formatDay(data.from, { day: "numeric", month: "long" }) : `${formatDay(data.from)} al ${formatDay(data.to)}`}</span>}
      </div>
      {error && <Alert tone="error">{error.message}</Alert>}
      {!data && !error && <Loading />}
      {data && <Dashboard data={data} vs={vs} loading={loading} />}
    </>
  );
}

function Dashboard({ data, vs, loading }: { data: DashboardData; vs: string; loading: boolean }) {
  const hotel = useHotel();
  const t = data.totals;
  const other = (d: { calls: number; resolved: number; handedOff: number }) => Math.max(0, d.calls - d.resolved - d.handedOff);
  const columnData = data.series.map((d) => ({
    key: d.day,
    label: data.series.length > 7 ? formatDay(d.day, { day: "numeric" }) : formatDay(d.day, { weekday: "short", day: "numeric" }),
    longLabel: formatDay(d.day, { weekday: "long", day: "numeric", month: "long" }),
    values: [d.resolved, d.handedOff, other(d)],
  }));
  const hours = data.byHour.map((n, h) => ({ key: String(h), label: `${h}`, longLabel: `De ${h}:00 a ${h}:59`, values: [n] }));
  const reasons = Object.entries(data.byReason).map(([k, v]) => ({ label: reasonLabels[k as keyof typeof reasonLabels], value: v }));
  const languages = Object.entries(data.byLanguage).map(([k, v]) => ({ label: languageLabels[k as Language] ?? (k === "otro" ? "Sin detectar" : k), value: v }));

  return (
    <div className={cn("flex flex-col gap-6 transition-opacity", loading && "opacity-60")}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Llamadas atendidas" value={formatNumber(t.calls)} delta={pctDelta(t.calls, data.previous.calls) && { ...pctDelta(t.calls, data.previous.calls)!, vs }} hint={t.afterHours ? `${t.afterHours} fuera del horario de recepción` : undefined} />
        <StatTile label="Resueltas por el agente" value={formatPercent(t.resolutionRate)} delta={pointsDelta(t.resolutionRate, data.previous.resolutionRate, data.previous.calls > 0) && { ...pointsDelta(t.resolutionRate, data.previous.resolutionRate, true)!, vs }} hint={`${t.resolved} de ${t.calls} sin intervención del equipo`} />
        <StatTile label="Reservas cargadas" value={formatNumber(t.bookings)} delta={pctDelta(t.bookings, data.previous.bookings) && { ...pctDelta(t.bookings, data.previous.bookings)!, vs }} hint={`${t.quotes} cotizaciones · ${formatPercent(t.quoteToBookingRate)} pasó a reserva`} />
        <StatTile label="Horas de recepción liberadas" value={formatNumber(t.hoursSaved)} hint={`Llamada promedio de ${formatDuration(t.avgDurationSecs)}`} />
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
        <Card>
          <CardHeader title="Llamadas por día" description="Cómo terminó cada llamada" />
          <div className="p-5">
            {t.calls === 0 ? (
              <EmptyState title="Sin llamadas en este período">Cuando el agente atienda, acá vas a ver cada día.</EmptyState>
            ) : (
              <>
                <ColumnChart
                  ariaLabel="Llamadas por día, separadas en resueltas, derivadas y sin resolver"
                  data={columnData}
                  series={[
                    { name: "Resueltas por el agente", color: SERIES[0] },
                    { name: "Derivadas a recepción", color: SERIES[1] },
                    { name: "Sin resolver", color: SERIES[2] },
                  ]}
                />
                <DataTable
                  caption="Llamadas por día"
                  head={["Día", "Total", "Resueltas", "Derivadas", "Sin resolver"]}
                  rows={data.series.map((d) => [formatDay(d.day, { weekday: "short", day: "numeric", month: "short" }), d.calls, d.resolved, d.handedOff, other(d)])}
                />
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Para hacer" description="Lo que quedó para el equipo" />
          <div className="p-5 flex flex-col gap-5">
            {hotel.can("handoffs:view") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-[0.92rem] flex items-center gap-2"><BellRing className="size-4 text-brand" aria-hidden /> Pendientes abiertos</h3>
                  <Link href={`${hotel.base}/pendientes`} className="text-[0.84rem] font-semibold text-brand inline-flex items-center gap-1 hover:underline">Ver todos <ArrowRight className="size-3.5" /></Link>
                </div>
                {data.todo.openHandoffs.length === 0 ? (
                  <p className="text-[0.88rem] text-soft">No hay pendientes abiertos.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line border border-line rounded-tile">
                    {data.todo.openHandoffs.map((h) => (
                      <li key={h.id}>
                        <Link href={`${hotel.base}/pendientes/${h.id}`} className="flex items-start gap-3 px-3 py-2.5 hover:bg-brand/4">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[0.9rem] truncate">{h.guestName ?? h.guestPhone ?? "Huésped"}</p>
                            <p className="text-[0.84rem] text-muted truncate">{h.reason}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {h.urgency !== "normal" && <Pill tone={urgencyTone(h.urgency)}>{h.urgency === "emergency" ? "Emergencia" : "Urgente"}</Pill>}
                            <span className="text-[0.76rem] text-soft">{formatRelative(h.createdAt)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {hotel.can("bookings:view") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-[0.92rem] flex items-center gap-2"><CalendarCheck className="size-4 text-brand" aria-hidden /> Reservas por confirmar</h3>
                  <Link href={`${hotel.base}/reservas`} className="text-[0.84rem] font-semibold text-brand inline-flex items-center gap-1 hover:underline">Ver todas <ArrowRight className="size-3.5" /></Link>
                </div>
                {data.todo.pendingBookings.length === 0 ? (
                  <p className="text-[0.88rem] text-soft">No hay reservas esperando confirmación.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line border border-line rounded-tile">
                    {data.todo.pendingBookings.map((b) => (
                      <li key={b.id}>
                        <Link href={`${hotel.base}/reservas/${b.id}`} className="flex items-start gap-3 px-3 py-2.5 hover:bg-brand/4">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[0.9rem] truncate">{b.guestName ?? "Huésped"}</p>
                            <p className="text-[0.84rem] text-muted truncate">{b.roomType} · {formatDay(b.checkIn)} al {formatDay(b.checkOut)}</p>
                          </div>
                          <span className="text-[0.86rem] font-semibold tabular">{formatUsd(b.totalUsd)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="¿A qué hora llaman?" description="Llamadas por hora del día, en el horario del hotel" />
          <div className="p-5">
            <ColumnChart ariaLabel="Llamadas por hora del día" data={hours} series={[{ name: "Llamadas", color: SERIES[0] }]} height={180} labelEvery={3} />
            <DataTable caption="Llamadas por hora" head={["Hora", "Llamadas"]} rows={data.byHour.map((n, h) => [`${h}:00`, n])} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Plan del mes" />
          <div className="p-5 flex flex-col gap-5">
            <Meter label="Minutos usados" value={data.usage.monthMinutes} max={data.usage.planMinutes} valueText={`${formatNumber(data.usage.monthMinutes)} de ${formatNumber(data.usage.planMinutes)}`} />
            <div className="grid grid-cols-2 gap-3 text-[0.88rem]">
              <div>
                <p className="text-soft text-[0.78rem] font-semibold">Ingresos confirmados</p>
                <p className="font-serif text-[1.8rem] text-brand leading-tight">{formatUsd(t.revenueUsd)}</p>
              </div>
              <div>
                <p className="text-soft text-[0.78rem] font-semibold">Derivadas</p>
                <p className="font-serif text-[1.8rem] text-brand leading-tight">{formatNumber(t.handedOff)}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Motivos de llamada" />
          <div className="p-5">
            {t.calls ? <RankedBars rows={reasons} /> : <p className="text-soft text-[0.9rem]">Sin datos todavía.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Idiomas" />
          <div className="p-5">
            {t.calls ? <RankedBars rows={languages} /> : <p className="text-soft text-[0.9rem]">Sin datos todavía.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
