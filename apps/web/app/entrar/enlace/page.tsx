"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert, Loading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

function MagicLink() {
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError("El enlace está incompleto. Pedí uno nuevo.");
      return;
    }
    api<{ mfaRequired: boolean }>("/auth/magic-link/verify", { body: { token }, redirectOnAuth: false })
      .then((res) => window.location.assign(res.mfaRequired ? "/entrar/2fa" : "/"))
      .catch((err) => setError(errorMessage(err)));
  }, [token]);
  return (
    <AuthCard title="Entrando…">
      {error ? (
        <Alert tone="error" title="No pudimos entrar con este enlace">
          {error} <Link href="/entrar" className="font-bold underline">Volver a entrar</Link>
        </Alert>
      ) : (
        <Loading label="Validando el enlace" />
      )}
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <MagicLink />
    </Suspense>
  );
}
