"use client";

import { Eye, KeyRound, Trash2 } from "lucide-react";
import { use, useEffect, useState, type FormEvent } from "react";
import { CopyField } from "@/components/copy-field";
import { BackLink } from "@/components/list";
import { Alert, Button, ButtonLink, Card, CardHeader, Dialog, Field, Input, KeyValue, Loading, PageHeader, Pill, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type Detail = {
  hotel: { id: string; name: string; city: string | null; timezone: string; status: string; plan: string; monthlyMinutes: number; parentId: string | null };
  agent: { id: string; elevenlabsAgentId: string | null; elevenlabsTestAgentId: string | null; toolTokenHint: string | null } | null;
  phoneLines: { id: string; number: string; provider: string; forwarding: string; active: boolean }[];
};

const forwardingLabel: Record<string, string> = { no_answer: "Si no atienden", after_hours: "Fuera de horario", always: "Siempre" };

export default function AdminHotelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const path = `/admin/hotels/${id}`;
  const { data, error, reload } = useApi<Detail>(path);
  const [agentIds, setAgentIds] = useState<{ main: string; test: string } | null>(null);
  const [line, setLine] = useState({ number: "", provider: "twilio", forwarding: "no_answer" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [rotateOpen, setRotateOpen] = useState(false);

  useEffect(() => {
    if (data?.agent && !agentIds) setAgentIds({ main: data.agent.elevenlabsAgentId ?? "", test: data.agent.elevenlabsTestAgentId ?? "" });
  }, [data, agentIds]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      await reload();
      setMsg({ tone: "success", text: ok });
      return true;
    } catch (err) {
      setMsg({ tone: "error", text: errorMessage(err) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveAgent(e: FormEvent) {
    e.preventDefault();
    if (!agentIds) return;
    await run(
      "agent",
      () => api(`${path}/agent`, { method: "PATCH", body: { elevenlabsAgentId: agentIds.main.trim() || null, elevenlabsTestAgentId: agentIds.test.trim() || null } }),
      "Agentes de ElevenLabs actualizados.",
    );
  }

  async function addLine(e: FormEvent) {
    e.preventDefault();
    const ok = await run("line", () => api(`${path}/phone-lines`, { body: line }), "Línea agregada.");
    if (ok) setLine({ ...line, number: "" });
  }

  async function rotate() {
    setBusy("rotate");
    setMsg(null);
    try {
      const res = await api<{ toolToken: string }>(`${path}/tool-token`, { body: {} });
      setNewToken(res.toolToken);
      setRotateOpen(false);
      await reload();
    } catch (err) {
      setMsg({ tone: "error", text: errorMessage(err) });
      setRotateOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <BackLink href="/admin">Hoteles</BackLink>
      {error && <Alert tone="error">{error.message}</Alert>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <PageHeader
            eyebrow={[data.hotel.city, data.hotel.timezone].filter(Boolean).join(" · ")}
            title={data.hotel.name}
            actions={
              <ButtonLink href={`/h/${data.hotel.id}`} variant="ghost" size="sm">
                <Eye className="size-4" aria-hidden /> Ver el panel del hotel
              </ButtonLink>
            }
          />
          {msg && <Alert tone={msg.tone} className="mb-5">{msg.text}</Alert>}
          {newToken && (
            <Card className="mb-6">
              <CardHeader title="Token nuevo" description="Se muestra una sola vez. Actualizalo en las server tools de ElevenLabs: el anterior ya no funciona." />
              <div className="p-5">
                <CopyField label="Token de herramientas" value={newToken} />
              </div>
            </Card>
          )}
          <div className="grid xl:grid-cols-2 gap-6 items-start">
            <Card>
              <CardHeader title="Suscripción" />
              <div className="p-5 flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-4">
                  <KeyValue label="Plan"><span className="capitalize">{data.hotel.plan}</span></KeyValue>
                  <KeyValue label="Minutos por mes"><span className="tabular">{formatNumber(data.hotel.monthlyMinutes)}</span></KeyValue>
                </dl>
                <Field label="Estado">
                  {(fid) => (
                    <Select
                      id={fid}
                      value={data.hotel.status}
                      disabled={busy !== null}
                      onChange={(e) => void run("status", () => api(`${path}/status`, { method: "PATCH", body: { status: e.target.value } }), "Estado actualizado.")}
                    >
                      <option value="trial">Prueba</option>
                      <option value="active">Activo</option>
                      <option value="paused">Pausado</option>
                      <option value="cancelled">Baja</option>
                    </Select>
                  )}
                </Field>
              </div>
            </Card>
            <Card>
              <CardHeader title="Agente de voz" description="IDs de ElevenLabs y token de las server tools." />
              {data.agent && agentIds ? (
                <form onSubmit={saveAgent} className="p-5 flex flex-col gap-4">
                  <Field label="Agente principal (el que atiende la línea)">{(fid) => <Input id={fid} value={agentIds.main} onChange={(e) => setAgentIds({ ...agentIds, main: e.target.value })} />}</Field>
                  <Field label="Agente de prueba" optional hint="Si está, la prueba por voz del panel usa este agente y no toca el principal.">
                    {(fid) => <Input id={fid} value={agentIds.test} onChange={(e) => setAgentIds({ ...agentIds, test: e.target.value })} />}
                  </Field>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" size="sm" loading={busy === "agent"}>Guardar IDs</Button>
                    <span className="text-[0.84rem] text-muted inline-flex items-center gap-1.5">
                      <KeyRound className="size-4 text-brand" aria-hidden /> Token: {data.agent.toolTokenHint ? `…${data.agent.toolTokenHint}` : "sin token"}
                    </span>
                    <Button variant="quiet" size="sm" onClick={() => setRotateOpen(true)}>Generar token nuevo</Button>
                  </div>
                </form>
              ) : (
                <p className="p-5 text-soft">Este hotel no tiene agente.</p>
              )}
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="Líneas telefónicas" description="Números que desvían al agente. CERGO se hace cargo de la telefonía." />
              <ul className="divide-y divide-line">
                {data.phoneLines.length === 0 && <li className="px-5 py-4 text-soft">Sin líneas cargadas.</li>}
                {data.phoneLines.map((l) => (
                  <li key={l.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                    <span className="font-semibold tabular">{l.number}</span>
                    <Pill tone="soft">{l.provider}</Pill>
                    <span className="text-[0.86rem] text-muted">Desvío: {forwardingLabel[l.forwarding] ?? l.forwarding}</span>
                    {!l.active && <Pill tone="warn">Inactiva</Pill>}
                    <Button
                      variant="quiet"
                      size="sm"
                      className="ml-auto px-2 hover:text-error"
                      aria-label={`Quitar la línea ${l.number}`}
                      loading={busy === `del-${l.id}`}
                      onClick={() => void run(`del-${l.id}`, () => api(`${path}/phone-lines/${l.id}`, { method: "DELETE" }), "Línea quitada.")}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
              <form onSubmit={addLine} className="p-5 border-t border-line flex flex-wrap items-end gap-3">
                <Field label="Número" className="w-full sm:w-[220px]">{(fid) => <Input id={fid} required inputMode="tel" value={line.number} onChange={(e) => setLine({ ...line, number: e.target.value })} />}</Field>
                <Field label="Proveedor" className="w-[calc(50%-6px)] sm:w-[150px]">
                  {(fid) => (
                    <Select id={fid} value={line.provider} onChange={(e) => setLine({ ...line, provider: e.target.value })}>
                      <option value="twilio">Twilio</option>
                      <option value="sip">SIP</option>
                      <option value="other">Otro</option>
                    </Select>
                  )}
                </Field>
                <Field label="Desvío" className="w-[calc(50%-6px)] sm:w-[190px]">
                  {(fid) => (
                    <Select id={fid} value={line.forwarding} onChange={(e) => setLine({ ...line, forwarding: e.target.value })}>
                      <option value="no_answer">Si no atienden</option>
                      <option value="after_hours">Fuera de horario</option>
                      <option value="always">Siempre</option>
                    </Select>
                  )}
                </Field>
                <Button type="submit" size="sm" loading={busy === "line"}>Agregar línea</Button>
              </form>
            </Card>
          </div>
          <Dialog
            open={rotateOpen}
            onClose={() => setRotateOpen(false)}
            title="Generar un token nuevo"
            description="El token actual deja de funcionar en el momento: el agente no va a poder cotizar ni reservar hasta que cargues el nuevo en ElevenLabs."
            footer={
              <>
                <Button variant="ghost" size="sm" onClick={() => setRotateOpen(false)}>Cancelar</Button>
                <Button variant="danger" size="sm" onClick={rotate} loading={busy === "rotate"}>Generar token nuevo</Button>
              </>
            }
          />
        </>
      )}
    </>
  );
}
