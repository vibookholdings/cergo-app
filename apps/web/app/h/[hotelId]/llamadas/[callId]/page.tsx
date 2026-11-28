"use client";

import { bookingStatusLabels, handoffStatusLabels, outcomeLabels, reasonLabels, type CallDetail } from "@cergo/contracts";
import { Bot, CalendarCheck, BellRing, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { BackLink } from "@/components/list";
import { useHotel, useMe } from "@/components/shell";
import { Alert, Card, CardHeader, KeyValue, Loading, PageHeader, Pill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDay, formatDuration, formatUsd } from "@/lib/format";
import { bookingTone, handoffTone, outcomeTone } from "@/lib/labels";
import { useApi } from "@/lib/use-api";

const mmss = (s: number | null) => (s === null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

export default function CallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = use(params);
  const hotel = useHotel();
  const me = useMe();
  const { data: call, error } = useApi<CallDetail>(`/h/${hotel.id}/calls/${callId}`);

  return (
    <>
      <BackLink href={`${hotel.base}/llamadas`}>Llamadas</BackLink>
      {error && <Alert tone="error">{error.message}</Alert>}
      {!call && !error && <Loading />}
      {call && (
        <>
          <PageHeader
            eyebrow={formatDateTime(call.startedAt, hotel.timezone)}
            title={call.callerNumber ?? "Número oculto"}
            actions={
              <div className="flex flex-wrap gap-1.5">
                {call.isTest && <Pill tone="soft">Prueba</Pill>}
                {call.afterHours && <Pill tone="brand">Fuera de horario</Pill>}
                <Pill tone={outcomeTone(call.outcome)}>{outcomeLabels[call.outcome]}</Pill>
              </div>
            }
          />
          <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
            <div className="flex flex-col gap-6 min-w-0">
              <Card>
                <CardHeader title="Resumen" />
                <div className="p-5 flex flex-col gap-5">
                  <p className="leading-relaxed">{call.summary ?? <span className="text-soft">El agente no dejó resumen de esta llamada.</span>}</p>
                  {call.hasAudio ? (
                    <audio controls preload="none" className="w-full" src={`/api/h/${hotel.id}/calls/${call.id}/audio`}>
                      Tu navegador no puede reproducir la grabación.
                    </audio>
                  ) : (
                    <p className="text-[0.86rem] text-soft">No hay grabación de esta llamada (todavía no llegó o ya se borró por la política de retención).</p>
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="Transcripción" description={`${call.messages.length} mensajes`} />
                <ol className="p-5 flex flex-col gap-3">
                  {call.messages.length === 0 && <li className="text-soft">Sin transcripción.</li>}
                  {call.messages.map((m) =>
                    m.toolName ? (
                      <li key={m.seq} className="self-center flex items-center gap-2 rounded-full bg-bg-deep border border-line px-3 py-1 text-[0.8rem] text-muted">
                        <Wrench className="size-3.5 text-brand" aria-hidden /> Usó la herramienta <strong className="font-semibold">{m.toolName}</strong>
                        <span className="tabular text-soft">{mmss(m.timeSecs)}</span>
                      </li>
                    ) : (
                      <li key={m.seq} className={cn("flex gap-2.5 max-w-[85%]", m.role === "user" ? "self-end flex-row-reverse" : "self-start")}>
                        <span className={cn("size-8 shrink-0 rounded-full grid place-items-center", m.role === "user" ? "bg-lime text-lime-ink" : "bg-brand text-brand-ink")}>
                          {m.role === "user" ? <UserRound className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}
                        </span>
                        <div className={cn("rounded-tile px-3.5 py-2.5 border", m.role === "user" ? "bg-lime/35 border-lime" : "bg-surface-soft border-line")}>
                          <p className="text-[0.74rem] font-bold text-soft mb-0.5">
                            {m.role === "user" ? "Huésped" : "Agente"} <span className="tabular font-medium">{mmss(m.timeSecs)}</span>
                          </p>
                          <p className="text-[0.93rem] leading-relaxed whitespace-pre-wrap">{m.text}</p>
                        </div>
                      </li>
                    ),
                  )}
                </ol>
              </Card>
            </div>
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader title="Datos" />
                <dl className="p-5 grid grid-cols-2 gap-4">
                  <KeyValue label="Motivo">{reasonLabels[call.reason]}</KeyValue>
                  <KeyValue label="Duración"><span className="tabular">{formatDuration(call.durationSecs)}</span></KeyValue>
                  <KeyValue label="Idioma"><span className="uppercase">{call.language ?? "—"}</span></KeyValue>
                  <KeyValue label="Derivada">{call.handedOff ? "Sí" : "No"}</KeyValue>
                  {me.user.isStaff && call.costUsd !== null && <KeyValue label="Costo (interno)"><span className="tabular">{formatUsd(call.costUsd, 2)}</span></KeyValue>}
                  <KeyValue label="Conversación"><span className="text-[0.78rem] break-all text-muted">{call.conversationId}</span></KeyValue>
                </dl>
              </Card>
              {call.handoffs.length > 0 && (
                <Card>
                  <CardHeader title="Pendientes de esta llamada" />
                  <ul className="divide-y divide-line">
                    {call.handoffs.map((h) => (
                      <li key={h.id}>
                        <Link href={`${hotel.base}/pendientes/${h.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-brand/4">
                          <BellRing className="size-4 text-brand mt-1" aria-hidden />
                          <span className="flex-1 min-w-0 text-[0.9rem]">{h.reason}</span>
                          <Pill tone={handoffTone(h.status)}>{handoffStatusLabels[h.status]}</Pill>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {call.bookings.length > 0 && (
                <Card>
                  <CardHeader title="Reservas y cotizaciones" />
                  <ul className="divide-y divide-line">
                    {call.bookings.map((b) => (
                      <li key={b.id}>
                        <Link href={`${hotel.base}/reservas/${b.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-brand/4">
                          <CalendarCheck className="size-4 text-brand mt-1" aria-hidden />
                          <span className="flex-1 min-w-0 text-[0.9rem]">
                            {b.roomType ?? "Habitación"} · {formatDay(b.checkIn)} al {formatDay(b.checkOut)}
                            <span className="block text-soft tabular">{formatUsd(b.totalUsd)}</span>
                          </span>
                          <Pill tone={bookingTone(b.status)}>{bookingStatusLabels[b.status]}</Pill>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
