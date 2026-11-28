"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert, Button, Field, Input, Tabs } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "password") {
        const res = await api<{ mfaRequired: boolean }>("/auth/login", { body: { email, password }, redirectOnAuth: false });
        window.location.assign(res.mfaRequired ? `/entrar/2fa?next=${encodeURIComponent(next)}` : next);
        return;
      }
      await api("/auth/magic-link", { body: { email }, redirectOnAuth: false });
      setLinkSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Entrá al panel"
      description="Las llamadas que atendió tu agente, los pendientes para recepción y las reservas, en un solo lugar."
      footer={<>¿No tenés cuenta? Te la crea el dueño del hotel desde Equipo.</>}
    >
      <Tabs
        className="mb-5"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          setLinkSent(false);
        }}
        options={[
          { value: "password", label: "Con contraseña" },
          { value: "link", label: "Con un enlace por mail" },
        ]}
      />
      {linkSent ? (
        <Alert tone="success" title="Revisá tu mail">
          Si {email} tiene acceso, le llega un enlace para entrar. Vence en 15 minutos.
        </Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Mail">
            {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          {mode === "password" && (
            <Field label="Contraseña">
              {(id) => (
                <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
            </Field>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={busy} className="w-full mt-1">
            {mode === "password" ? "Entrar" : "Mandarme el enlace"}
          </Button>
          {mode === "password" && (
            <Link href="/entrar/recuperar" className="text-[0.9rem] text-brand font-semibold text-center hover:underline">
              Me olvidé la contraseña
            </Link>
          )}
        </form>
      )}
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
