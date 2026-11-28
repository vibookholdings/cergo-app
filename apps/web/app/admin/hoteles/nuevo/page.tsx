"use client";

import { useState, type FormEvent } from "react";
import { CopyField } from "@/components/copy-field";
import { BackLink } from "@/components/list";
import { Alert, Button, ButtonLink, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type Created = { hotelId: string; toolToken: string; inviteUrl: string | null };

export default function NewHotelPage() {
  const [form, setForm] = useState({
    name: "",
    city: "",
    timezone: "America/Argentina/Buenos_Aires",
    plan: "esencial",
    monthlyMinutes: 400,
    elevenlabsAgentId: "",
    phoneNumber: "",
    ownerEmail: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<Created>("/admin/hotels", {
        body: {
          name: form.name,
          city: form.city,
          timezone: form.timezone,
          plan: form.plan,
          monthlyMinutes: form.monthlyMinutes,
          elevenlabsAgentId: form.elevenlabsAgentId.trim() || undefined,
          phoneNumber: form.phoneNumber.trim() || undefined,
          ownerEmail: form.ownerEmail.trim() || undefined,
        },
      });
      setCreated(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <>
        <PageHeader eyebrow="Hotel creado" title={form.name} />
        <Card className="max-w-[720px]">
          <CardHeader title="Datos para conectar el agente" description="El token se muestra una sola vez. Guardalo en las server tools de ElevenLabs (header Authorization: Bearer …)." />
          <div className="p-5 flex flex-col gap-5">
            <CopyField label="Token de herramientas" value={created.toolToken} />
            {created.inviteUrl && <CopyField label="Invitación del dueño (también se mandó por mail)" value={created.inviteUrl} />}
            <Alert tone="warn">Si perdés el token, generá uno nuevo desde la ficha del hotel: el anterior deja de funcionar en el momento.</Alert>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/admin/hoteles/${created.hotelId}`}>Ir a la ficha del hotel</ButtonLink>
              <ButtonLink href={`/h/${created.hotelId}/agente`} variant="ghost">Cargar la configuración del agente</ButtonLink>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <BackLink href="/admin">Hoteles</BackLink>
      <PageHeader title="Nuevo hotel" description="Crea el hotel, su agente con un borrador inicial, la línea y la invitación al dueño." />
      <form onSubmit={submit} className="max-w-[720px] flex flex-col gap-6">
        <Card>
          <CardHeader title="Hotel" />
          <div className="p-5 grid sm:grid-cols-2 gap-4">
            <Field label="Nombre">{(id) => <Input id={id} required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
            <Field label="Ciudad" optional>{(id) => <Input id={id} maxLength={120} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />}</Field>
            <Field label="Zona horaria">{(id) => <Input id={id} required value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />}</Field>
            <Field label="Mail del dueño" optional hint="Le llega la invitación para entrar al panel.">
              {(id) => <Input id={id} type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />}
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Plan" description="Suscripción mensual en dólares. Sin costos de alta." />
          <div className="p-5 grid sm:grid-cols-2 gap-4">
            <Field label="Plan">
              {(id) => (
                <Select id={id} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                  <option value="esencial">Esencial</option>
                  <option value="profesional">Profesional</option>
                  <option value="cadena">Cadena</option>
                </Select>
              )}
            </Field>
            <Field label="Minutos por mes">
              {(id) => <Input id={id} type="number" min={0} value={form.monthlyMinutes} onChange={(e) => setForm({ ...form, monthlyMinutes: Number(e.target.value) || 0 })} />}
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Voz y línea" description="Se puede completar después desde la ficha." />
          <div className="p-5 grid sm:grid-cols-2 gap-4">
            <Field label="ID del agente en ElevenLabs" optional>{(id) => <Input id={id} value={form.elevenlabsAgentId} onChange={(e) => setForm({ ...form, elevenlabsAgentId: e.target.value })} />}</Field>
            <Field label="Número de la línea" optional>{(id) => <Input id={id} inputMode="tel" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+54 294 400-0000" />}</Field>
          </div>
        </Card>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy} className="self-start">Crear hotel</Button>
      </form>
    </>
  );
}
