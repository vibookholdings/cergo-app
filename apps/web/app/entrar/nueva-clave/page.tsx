"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== repeat) return setError("Las contraseñas no coinciden");
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ mfaRequired: boolean }>("/auth/password-reset", { body: { token, password }, redirectOnAuth: false });
      window.location.assign(res.mfaRequired ? "/entrar/2fa" : "/");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Elegí una contraseña nueva" description="Al menos 10 caracteres. Se cierran las demás sesiones abiertas.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Contraseña nueva">{(id) => <Input id={id} type="password" minLength={10} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <Field label="Repetila">{(id) => <Input id={id} type="password" minLength={10} required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}</Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy}>Guardar y entrar</Button>
      </form>
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
