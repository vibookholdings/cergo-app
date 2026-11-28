"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { MeProvider, TopBar, useMe } from "@/components/shell";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Pill } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

function Profile() {
  const me = useMe();
  const [name, setName] = useState(me.user.name);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/me", { method: "PATCH", body: { name } });
      setMsg({ tone: "success", text: "Guardado" });
    } catch (err) {
      setMsg({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader title="Tus datos" description={me.user.email} />
      <form onSubmit={submit} className="p-5 flex flex-col gap-4 max-w-[480px]">
        <Field label="Nombre">{(id) => <Input id={id} value={name} required onChange={(e) => setName(e.target.value)} />}</Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" loading={busy} className="self-start">Guardar</Button>
      </form>
    </Card>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/me/password", { body: { currentPassword: current || undefined, newPassword: next } });
      setMsg({ tone: "success", text: "Contraseña cambiada. Cerramos tus otras sesiones." });
      setCurrent("");
      setNext("");
    } catch (err) {
      setMsg({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader title="Contraseña" description="Si entraste siempre con enlace por mail, dejá vacía la actual." />
      <form onSubmit={submit} className="p-5 grid gap-4 sm:grid-cols-2 max-w-[720px]">
        <Field label="Contraseña actual" optional>{(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
        <Field label="Contraseña nueva" hint="Al menos 10 caracteres.">{(id) => <Input id={id} type="password" minLength={10} required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
        {msg && <Alert tone={msg.tone} className="sm:col-span-2">{msg.text}</Alert>}
        <Button type="submit" loading={busy} className="justify-self-start">Cambiar contraseña</Button>
      </form>
    </Card>
  );
}

function TwoFactor() {
  const me = useMe();
  const highlight = useSearchParams().get("activar2fa") === "1";
  const [enabled, setEnabled] = useState(me.user.totpEnabled);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ secret: string; otpauthUrl: string }>("/auth/2fa/setup", { method: "POST" });
      setSetup({ secret: res.secret, qr: await QRCode.toDataURL(res.otpauthUrl, { margin: 1, width: 200, color: { dark: "#202720", light: "#FFFFFF" } }) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ backupCodes: string[] }>("/auth/2fa/confirm", { body: { code: code.replace(/\s/g, "") } });
      setBackup(res.backupCodes);
      setEnabled(true);
      setSetup(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function disable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/2fa/disable", { body: { code: code.replace(/\s/g, "") } });
      setEnabled(false);
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={highlight && !enabled ? "ring-2 ring-brand" : undefined}>
      <CardHeader
        title="Verificación en dos pasos"
        description="Además de la contraseña, te pedimos un código de tu celular (Google Authenticator, 1Password, Authy)."
        actions={enabled ? <Pill tone="lime">Activa</Pill> : <Pill>Desactivada</Pill>}
      />
      <div className="p-5 flex flex-col gap-4 max-w-[640px]">
        {highlight && !enabled && <Alert tone="warn">El equipo CERGO tiene que activar la verificación en dos pasos para entrar al panel interno.</Alert>}
        {backup && (
          <Alert tone="success" title="Guardá estos códigos de respaldo">
            <p>Sirven una sola vez cada uno si perdés el celular. No los vamos a volver a mostrar.</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[0.95rem]">
              {backup.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </Alert>
        )}
        {!enabled && !setup && (
          <Button onClick={start} loading={busy} className="self-start"><ShieldCheck className="size-4" /> Activar</Button>
        )}
        {setup && (
          <form onSubmit={confirm} className="flex flex-col sm:flex-row gap-5 items-start">
            <img src={setup.qr} alt="Código QR para tu app de autenticación" className="size-[200px] rounded-tile border border-line" />
            <div className="flex flex-col gap-3 flex-1">
              <p className="text-[0.92rem] text-muted">Escaneá el QR con tu app. Si no podés, cargá esta clave a mano:</p>
              <code className="text-[0.85rem] bg-bg-deep rounded-chip px-2 py-1 break-all">{setup.secret}</code>
              <Field label="Código de 6 dígitos">{(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
              <Button type="submit" loading={busy} className="self-start">Confirmar</Button>
            </div>
          </form>
        )}
        {enabled && !backup && (
          <form onSubmit={disable} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <Field label="Para desactivarla, escribí un código" className="flex-1">{(id) => <Input id={id} inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
            <Button type="submit" variant="danger" loading={busy}><KeyRound className="size-4" /> Desactivar</Button>
          </form>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Card>
  );
}

export default function AccountPage() {
  return (
    <MeProvider>
      <TopBar />
      <main className="max-w-[880px] mx-auto px-[clamp(16px,3vw,28px)] py-8 flex flex-col gap-6">
        <PageHeader title="Mi cuenta" />
        <Profile />
        <Password />
        <Suspense>
          <TwoFactor />
        </Suspense>
      </main>
    </MeProvider>
  );
}
