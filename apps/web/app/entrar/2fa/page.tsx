"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

function TwoFactor() {
  const params = useSearchParams();
  const raw = params.get("next");
  const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/2fa/verify", { body: { code: code.replace(/\s/g, "") }, redirectOnAuth: false });
      window.location.assign(next);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Verificación en dos pasos" description="Escribí el código de 6 dígitos de tu app de autenticación, o uno de tus códigos de respaldo.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Código">
          {(id) => (
            <Input id={id} inputMode="numeric" autoComplete="one-time-code" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} className="tabular text-[1.2rem] tracking-[0.2em]" />
          )}
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy}>Verificar</Button>
      </form>
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <TwoFactor />
    </Suspense>
  );
}
