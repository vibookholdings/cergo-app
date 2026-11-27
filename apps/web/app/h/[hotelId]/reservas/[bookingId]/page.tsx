"use client";

import { bookingStatuses, bookingStatusLabels, type BookingListItem, type BookingStatus } from "@cergo/contracts";
import { Mail, Phone, PhoneCall } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState, type FormEvent } from "react";
import { BackLink } from "@/components/list";
import { useHotel } from "@/components/shell";
import { Alert, Button, Card, CardHeader, Field, Input, KeyValue, Loading, PageHeader, Pill, Select, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatDay, formatUsd } from "@/lib/format";
import { bookingTone } from "@/lib/labels";
import { useApi } from "@/lib/use-api";

export default function BookingDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = use(params);
  const hotel = useHotel();
  const path = `/h/${hotel.id}/bookings/${bookingId}`;
  const { data: b, error, mutate } = useApi<BookingListItem>(path);
  const [form, setForm] = useState<{ status: BookingStatus; pmsId: string; notes: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const canManage = hotel.can("bookings:manage");

  useEffect(() => {
    if (b && !form) setForm({ status: b.status, pmsId: b.pmsId ?? "", notes: b.notes ?? "" });
  }, [b, form]);

  const dirty = Boolean(b && form && (form.status !== b.status || form.pmsId !== (b.pmsId ?? "") || form.notes !== (b.notes ?? "")));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await api<BookingListItem>(path, {
        method: "PATCH",
        body: { status: form.status, pmsId: form.pmsId.trim() || null, notes: form.notes.trim() || null },
      });
      mutate(updated);
      setForm({ status: updated.status, pmsId: updated.pmsId ?? "", notes: updated.notes ?? "" });
      setSaved(true);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BackLink href={`${hotel.base}/reservas`}>Reservas</BackLink>
      {error && <Alert tone="error">{error.message}</Alert>}
      {!b && !error && <Loading />}
      {b && (
        <>
          <PageHeader
            eyebrow={`${b.kind === "quote" ? "Cotización" : "Reserva"} · entró ${formatDateTime(b.createdAt, hotel.timezone)}`}
            title={b.guestName ?? "Huésped sin nombre"}
            actions={<Pill tone={bookingTone(b.status)}>{bookingStatusLabels[b.status]}</Pill>}
          />
          <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
            <Card>
              <CardHeader title="Estadía" />
              <dl className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-5">
                <KeyValue label="Llegada">{formatDay(b.checkIn, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</KeyValue>
                <KeyValue label="Salida">{formatDay(b.checkOut, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</KeyValue>
                <KeyValue label="Noches"><span className="tabular">{b.nights}</span></KeyValue>
                <KeyValue label="Habitación">{b.roomType ?? "A definir"}</KeyValue>
                <KeyValue label="Personas">
                  {b.adults} {b.adults === 1 ? "adulto" : "adultos"}
                  {b.children > 0 && `, ${b.children} ${b.children === 1 ? "menor" : "menores"}`}
                </KeyValue>
                <KeyValue label="Total cotizado"><span className="font-serif text-[1.6rem] text-brand leading-none">{formatUsd(b.totalUsd)}</span></KeyValue>
              </dl>
              <div className="px-5 pb-5 flex flex-wrap gap-x-6 gap-y-2 text-[0.92rem]">
                {b.guestPhone && (
                  <a href={`tel:${b.guestPhone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
                    <Phone className="size-4" aria-hidden /> {b.guestPhone}
                  </a>
                )}
                {b.guestEmail && (
                  <a href={`mailto:${b.guestEmail}`} className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
                    <Mail className="size-4" aria-hidden /> {b.guestEmail}
                  </a>
                )}
                {b.callId && hotel.can("calls:view") && (
                  <Link href={`${hotel.base}/llamadas/${b.callId}`} className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
                    <PhoneCall className="size-4" aria-hidden /> Escuchar la llamada
                  </Link>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Seguimiento" />
              {form && (
                <form onSubmit={save} className="p-5 flex flex-col gap-4">
                  <Field label="Estado">
                    {(id) => (
                      <Select id={id} value={form.status} disabled={!canManage} onChange={(e) => setForm({ ...form, status: e.target.value as BookingStatus })}>
                        {bookingStatuses.map((s) => (
                          <option key={s} value={s}>{bookingStatusLabels[s]}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Número en el PMS" optional hint="Para encontrarla en tu sistema de reservas.">
                    {(id) => <Input id={id} value={form.pmsId} disabled={!canManage} maxLength={120} onChange={(e) => setForm({ ...form, pmsId: e.target.value })} />}
                  </Field>
                  <Field label="Notas" optional>
                    {(id) => <Textarea id={id} value={form.notes} disabled={!canManage} maxLength={4000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}
                  </Field>
                  {saveError && <Alert tone="error">{saveError}</Alert>}
                  {saved && !dirty && <Alert tone="success">Cambios guardados.</Alert>}
                  {canManage && (
                    <Button type="submit" loading={saving} disabled={!dirty}>
                      Guardar cambios
                    </Button>
                  )}
                </form>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
