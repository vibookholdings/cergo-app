"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password-reset/request", { body: { email }, redirectOnAuth: false });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Recuperá tu contraseña" description="Te mandamos un enlace para elegir una nueva." footer={<Link href="/entrar" className="text-brand font-semibold">Volver a entrar</Link>}>
      {sent ? (
        <Alert tone="success" title="Listo">Si {email} tiene cuenta, le llega un mail con el enlace. Vence en 1 hora.</Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Mail">{(id) => <Input id={id} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={busy}>Mandarme el enlace</Button>
        </form>
      )}
    </AuthCard>
  );
}
