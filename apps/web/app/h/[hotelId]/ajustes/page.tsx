"use client";

import type { HotelSettingsView } from "@cergo/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { useHotel } from "@/components/shell";
import { Alert, Button, Card, CardHeader, Field, Input, Loading, PageHeader, Select, Textarea, Toggle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const ZONES = [
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Santiago",
  "America/Asuncion",
  "America/Sao_Paulo",
  "America/La_Paz",
  "America/Lima",
  "America/Bogota",
  "America/Mexico_City",
  "America/New_York",
  "Europe/Madrid",
];

type Form = { name: string; city: string; timezone: string; notifyEmails: string; notifyWhatsapp: string; retentionMonths: number; allowNonOwnersToDraft: boolean };

const toForm = (s: HotelSettingsView): Form => ({
  name: s.name,
  city: s.city,
  timezone: s.timezone,
  notifyEmails: s.notifyEmails.join("\n"),
  notifyWhatsapp: s.notifyWhatsapp ?? "",
  retentionMonths: s.retentionMonths,
  allowNonOwnersToDraft: s.allowNonOwnersToDraft,
});

export default function SettingsPage() {
  const hotel = useHotel();
  const path = `/h/${hotel.id}/settings`;
  const { data, error, mutate } = useApi<HotelSettingsView>(path);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (data && !form) setForm(toForm(data));
  }, [data, form]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMsg(null);
    try {
      const updated = await api<HotelSettingsView>(path, {
        method: "PUT",
        body: {
          name: form.name,
          city: form.city,
          timezone: form.timezone,
          notifyEmails: form.notifyEmails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean),
          notifyWhatsapp: form.notifyWhatsapp.trim() || null,
          retentionMonths: form.retentionMonths,
          allowNonOwnersToDraft: form.allowNonOwnersToDraft,
        },
      });
      mutate(updated);
      setForm(toForm(updated));
      setMsg({ tone: "success", text: "Ajustes guardados." });
    } catch (err) {
      setMsg({ tone: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const zones = form && !ZONES.includes(form.timezone) ? [form.timezone, ...ZONES] : ZONES;

  return (
    <>
      <PageHeader title="Ajustes" description="Datos del hotel, a quién avisamos y cuánto tiempo guardamos las grabaciones." />
      {error && <Alert tone="error">{error.message}</Alert>}
      {!form && !error && <Loading />}
      {form && data && (
        <form onSubmit={save} className="grid xl:grid-cols-[1fr_340px] gap-6 items-start">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader title="Hotel" />
              <div className="p-5 grid sm:grid-cols-2 gap-4">
                <Field label="Nombre">{(id) => <Input id={id} required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
                <Field label="Ciudad" optional>{(id) => <Input id={id} maxLength={120} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />}</Field>
                <Field label="Zona horaria" hint="Para los horarios de las llamadas y de recepción.">
                  {(id) => (
                    <Select id={id} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                      {zones.map((z) => (
                        <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </Card>
            <Card>
              <CardHeader title="Avisos de pendientes y reservas" description="Además de las personas del equipo que tienen los avisos activados." />
              <div className="p-5 grid gap-4">
                <Field label="Mails extra" optional hint="Uno por línea. Hasta 10.">
                  {(id) => <Textarea id={id} value={form.notifyEmails} onChange={(e) => setForm({ ...form, notifyEmails: e.target.value })} placeholder={"recepcion@tuhotel.com\ngerencia@tuhotel.com"} />}
                </Field>
                <Field label="WhatsApp de recepción" optional hint="Con código de país. Ej.: +54 9 294 412-3456.">
                  {(id) => <Input id={id} inputMode="tel" value={form.notifyWhatsapp} onChange={(e) => setForm({ ...form, notifyWhatsapp: e.target.value })} />}
                </Field>
              </div>
            </Card>
            <Card>
              <CardHeader title="Privacidad y permisos" />
              <div className="p-5 grid gap-5">
                <Field label="Guardar grabaciones y transcripciones durante" hint="Pasado ese plazo se borran solas. Las métricas se mantienen.">
                  {(id) => (
                    <Select id={id} value={form.retentionMonths} onChange={(e) => setForm({ ...form, retentionMonths: Number(e.target.value) })} className="max-w-[240px]">
                      {[1, 3, 6, 12, 24, 36, 60].map((m) => (
                        <option key={m} value={m}>{m === 1 ? "1 mes" : `${m} meses`}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Toggle
                  checked={form.allowNonOwnersToDraft}
                  onChange={(v) => setForm({ ...form, allowNonOwnersToDraft: v })}
                  label="Recepción puede proponer cambios al agente"
                  description="Guardan borradores; publicar sigue siendo cosa del dueño."
                />
              </div>
            </Card>
          </div>
          <div className="flex flex-col gap-4 xl:sticky xl:top-[88px]">
            <Card>
              <CardHeader title="Plan" />
              <div className="p-5 text-[0.92rem] flex flex-col gap-1">
                <p className="font-serif text-[1.8rem] leading-tight text-brand capitalize">{data.plan}</p>
                <p className="text-muted">{formatNumber(data.monthlyMinutes)} minutos de llamadas por mes.</p>
                <p className="text-[0.84rem] text-soft mt-2">Para cambiar de plan, escribinos y lo ajustamos.</p>
              </div>
            </Card>
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <Button type="submit" loading={saving}>Guardar ajustes</Button>
          </div>
        </form>
      )}
    </>
  );
}
