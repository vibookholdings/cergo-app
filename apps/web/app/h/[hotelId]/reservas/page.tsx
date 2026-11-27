"use client";

import { bookingStatuses, bookingStatusLabels, type BookingListItem, type BookingStatus } from "@cergo/contracts";
import { CalendarCheck, Download } from "lucide-react";
import { useState } from "react";
import { FilterBar, List, LoadMore, RowLink } from "@/components/list";
import { useHotel } from "@/components/shell";
import { Alert, Card, EmptyState, Field, Input, Loading, PageHeader, Pill, Select, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDay, formatRelative, formatUsd } from "@/lib/format";
import { bookingTone } from "@/lib/labels";
import { qs, usePaged } from "@/lib/use-paged";

type Kind = "" | "booking" | "quote";

export default function BookingsPage() {
  const hotel = useHotel();
  const [kind, setKind] = useState<Kind>("");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = qs({ kind, status, from, to });
  const paged = usePaged<BookingListItem>(`/h/${hotel.id}/bookings${query}`);
  const filtered = Boolean(kind || status || from || to);

  return (
    <>
      <PageHeader
        title="Reservas"
        description="Las reservas y cotizaciones que tomó el agente. Confirmalas, cargá el número del PMS y seguí cada una."
        actions={
          hotel.can("bookings:export") && (
            <a
              href={`/api/h/${hotel.id}/bookings/export.csv${query}`}
              className="inline-flex items-center gap-2 h-[38px] px-3.5 rounded-[10px] text-[0.88rem] font-semibold border-[1.5px] border-line-strong hover:border-ink"
              download
            >
              <Download className="size-4" aria-hidden /> Exportar CSV
            </a>
          )
        }
      />
      <FilterBar>
        <Tabs
          value={kind}
          onChange={setKind}
          options={[
            { value: "", label: "Todas" },
            { value: "booking", label: "Reservas" },
            { value: "quote", label: "Cotizaciones" },
          ]}
        />
        <Field label="Estado" className="w-[calc(50%-6px)] sm:w-[170px]">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | "")}>
              <option value="">Todos</option>
              {bookingStatuses.map((s) => (
                <option key={s} value={s}>{bookingStatusLabels[s]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Llegada desde" className="w-[calc(50%-6px)] sm:w-[160px]">
          {(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} />}
        </Field>
        <Field label="Llegada hasta" className="w-[calc(50%-6px)] sm:w-[160px]">
          {(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} />}
        </Field>
      </FilterBar>

      {paged.error && <Alert tone="error">{paged.error.message}</Alert>}
      {!paged.ready && !paged.error && <Loading />}
      {paged.ready && (
        <Card className={cn("transition-opacity", paged.loading && "opacity-60")}>
          {paged.items.length === 0 ? (
            <EmptyState icon={<CalendarCheck className="size-5" />} title={filtered ? "No hay reservas con esos filtros" : "Todavía no hay reservas"}>
              {filtered ? "Probá con otras fechas o sacá algún filtro." : "Cuando el agente cotice o tome una reserva, la vas a ver acá."}
            </EmptyState>
          ) : (
            <List>
              {paged.items.map((b) => (
                <RowLink key={b.id} href={`${hotel.base}/reservas/${b.id}`}>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[1fr_140px_auto] items-start">
                    <div className="min-w-0">
                      <p className="font-semibold">{b.guestName ?? "Huésped sin nombre"}</p>
                      <p className="text-[0.88rem] text-muted">
                        {b.roomType ?? "Habitación a definir"} · {formatDay(b.checkIn)} al {formatDay(b.checkOut)} · {b.nights} {b.nights === 1 ? "noche" : "noches"} ·{" "}
                        {b.adults} {b.adults === 1 ? "adulto" : "adultos"}
                        {b.children > 0 && ` y ${b.children} ${b.children === 1 ? "menor" : "menores"}`}
                      </p>
                      <p className="text-[0.8rem] text-soft mt-0.5">Entró {formatRelative(b.createdAt)}{b.pmsId && ` · PMS ${b.pmsId}`}</p>
                    </div>
                    <p className="font-semibold tabular sm:text-right">{formatUsd(b.totalUsd)}</p>
                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      <Pill tone="soft">{b.kind === "quote" ? "Cotización" : "Reserva"}</Pill>
                      <Pill tone={bookingTone(b.status)}>{bookingStatusLabels[b.status]}</Pill>
                    </div>
                  </div>
                </RowLink>
              ))}
            </List>
          )}
        </Card>
      )}
      <LoadMore {...paged} />
    </>
  );
}
