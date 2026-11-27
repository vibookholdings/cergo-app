"use client";

import { roleLabels, type Role } from "@cergo/contracts";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert, Button, Field, Input, Loading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type Invite = { email: string; hotelName: string; role: Role | null; userExists: boolean; expiresAt: string };

function AcceptInvite() {
  const token = useSearchParams().get("token") ?? "";
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Invite>(`/auth/invite?token=${encodeURIComponent(token)}`, { redirectOnAuth: false })
      .then(setInvite)
      .catch((err) => setLoadError(errorMessage(err)));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ mfaRequired: boolean; hotelId: string }>("/auth/invite/accept", {
        body: { token, name, ...(invite?.userExists ? {} : { password }) },
        redirectOnAuth: false,
      });
      window.location.assign(res.mfaRequired ? `/entrar/2fa?next=/h/${res.hotelId}` : `/h/${res.hotelId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <AuthCard title="Invitación no válida">
        <Alert tone="error">{loadError}. Pedile a quien te invitó que te mande una nueva.</Alert>
      </AuthCard>
    );
  }
  if (!invite) return <AuthCard title="Invitación"><Loading /></AuthCard>;
  return (
    <AuthCard
      title={<>Sumate a <em className="text-brand">{invite.hotelName}</em></>}
      description={`Te invitaron como ${invite.role ? roleLabels[invite.role].toLowerCase() : "miembro del equipo"}. Vas a entrar con ${invite.email}.`}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Tu nombre">{(id) => <Input id={id} required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        {!invite.userExists && (
          <Field label="Elegí una contraseña" hint="Al menos 10 caracteres.">
            {(id) => <Input id={id} type="password" minLength={10} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy}>Aceptar invitación</Button>
      </form>
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AcceptInvite />
    </Suspense>
  );
}
