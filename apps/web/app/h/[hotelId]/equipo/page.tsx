"use client";

import { hotelRoles, roleLabels, type HotelRole, type PendingInvitation, type Role, type TeamMember } from "@cergo/contracts";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useHotel } from "@/components/shell";
import { Alert, Button, Card, CardHeader, Dialog, Field, Input, Loading, PageHeader, Pill, Select, Toggle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatIn, formatRelative } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const roleHelp: Record<HotelRole, string> = {
  owner: "Ve y cambia todo: el agente, el equipo y los ajustes.",
  reception: "Atiende pendientes, ve llamadas y reservas.",
  sales: "Reservas y cotizaciones, con exportación.",
  readonly: "Solo ve el inicio con las métricas.",
};

export default function TeamPage() {
  const hotel = useHotel();
  const { data, error, reload } = useApi<{ members: TeamMember[]; invites: PendingInvitation[] }>(`/h/${hotel.id}/team`);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<HotelRole>("reception");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      await reload();
      if (ok) setMsg({ tone: "success", text: ok });
      return true;
    } catch (err) {
      setMsg({ tone: "error", text: errorMessage(err) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    const target = email.trim();
    const done = await run("invite", () => api(`/h/${hotel.id}/team/invites`, { body: { email: target, role } }), `Le mandamos la invitación a ${target}. Vence en 7 días.`);
    if (done) setEmail("");
  }

  return (
    <>
      <PageHeader title="Equipo" description="Quiénes entran al panel, qué puede hacer cada uno y quién recibe los avisos de pendientes." />
      {error && <Alert tone="error">{error.message}</Alert>}
      {msg && <Alert tone={msg.tone} className="mb-5">{msg.text}</Alert>}
      {!data && !error && <Loading />}
      {data && (
        <div className="grid xl:grid-cols-[1fr_360px] gap-6 items-start">
          <Card>
            <CardHeader title="Personas con acceso" description={`${data.members.length} ${data.members.length === 1 ? "persona" : "personas"}`} />
            <ul className="divide-y divide-line">
              {data.members.map((m) => (
                <li key={m.membershipId} className="px-5 py-4 grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {m.name || m.email} {m.isYou && <Pill tone="brand" className="ml-1">Vos</Pill>}
                    </p>
                    <p className="text-[0.86rem] text-muted truncate">{m.email}</p>
                    <p className="text-[0.78rem] text-soft mt-0.5">{m.lastLoginAt ? `Entró ${formatRelative(m.lastLoginAt)}` : "Todavía no entró"}</p>
                  </div>
                  <Select
                    aria-label={`Rol de ${m.name || m.email}`}
                    value={m.role}
                    disabled={busy !== null || m.role === "group_admin"}
                    onChange={(e) => void run(`role-${m.membershipId}`, () => api(`/h/${hotel.id}/team/members/${m.membershipId}`, { method: "PATCH", body: { role: e.target.value } }), "Rol actualizado.")}
                  >
                    {(m.role === "group_admin" ? (["group_admin"] as Role[]) : hotelRoles).map((r) => (
                      <option key={r} value={r}>{roleLabels[r]}</option>
                    ))}
                  </Select>
                  <div className="flex items-center gap-3 md:justify-end">
                    <Toggle
                      checked={m.notifyByEmail}
                      disabled={busy !== null}
                      onChange={(v) => void run(`notify-${m.membershipId}`, () => api(`/h/${hotel.id}/team/members/${m.membershipId}`, { method: "PATCH", body: { notifyByEmail: v } }))}
                      label="Avisos"
                    />
                    {!m.isYou && (
                      <Button variant="quiet" size="sm" className="px-2 hover:text-error" onClick={() => setRemoving(m)} aria-label={`Quitar a ${m.name || m.email}`}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader title="Invitar a alguien" />
              <form onSubmit={invite} className="p-5 flex flex-col gap-4">
                <Field label="Mail">{(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="recepcion@tuhotel.com" />}</Field>
                <Field label="Rol" hint={roleHelp[role]}>
                  {(id) => (
                    <Select id={id} value={role} onChange={(e) => setRole(e.target.value as HotelRole)}>
                      {hotelRoles.map((r) => (
                        <option key={r} value={r}>{roleLabels[r]}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Button type="submit" loading={busy === "invite"} disabled={!email.trim()}>
                  <UserPlus className="size-4" aria-hidden /> Mandar invitación
                </Button>
              </form>
            </Card>
            {data.invites.length > 0 && (
              <Card>
                <CardHeader title="Invitaciones pendientes" />
                <ul className="divide-y divide-line">
                  {data.invites.map((i) => (
                    <li key={i.id} className="px-5 py-3 flex items-center gap-3">
                      <Mail className="size-4 text-brand shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.9rem] font-semibold truncate">{i.email}</p>
                        <p className="text-[0.78rem] text-soft">{i.role ? roleLabels[i.role] : "Sin rol"} · vence {formatIn(i.expiresAt)}</p>
                      </div>
                      <Button
                        variant="quiet"
                        size="sm"
                        loading={busy === `revoke-${i.id}`}
                        onClick={() => void run(`revoke-${i.id}`, () => api(`/h/${hotel.id}/team/invites/${i.id}`, { method: "DELETE" }), "Invitación cancelada.")}
                      >
                        Cancelar
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Quitar a ${removing?.name || removing?.email || ""}`}
        description="Deja de tener acceso al panel de este hotel en el momento. Podés volver a invitarlo cuando quieras."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRemoving(null)}>Cancelar</Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy === "remove"}
              onClick={async () => {
                const m = removing;
                if (!m) return;
                await run("remove", () => api(`/h/${hotel.id}/team/members/${m.membershipId}`, { method: "DELETE" }), "Acceso quitado.");
                setRemoving(null);
              }}
            >
              Quitar acceso
            </Button>
          </>
        }
      />
    </>
  );
}
