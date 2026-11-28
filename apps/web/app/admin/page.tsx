"use client";

import { versionStatusLabels, type AdminHotelRow } from "@cergo/contracts";
import { Eye, Plus, RefreshCw, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, Button, ButtonLink, Card, EmptyState, Loading, PageHeader, Pill } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatNumber, formatRelative } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const statusLabel: Record<string, string> = { trial: "Prueba", active: "Activo", paused: "Pausado", cancelled: "Baja" };
type Tone = "lime" | "brand" | "warn" | "soft" | "error";
const statusTone = (s: string): Tone => (s === "active" ? "lime" : s === "trial" ? "brand" : s === "paused" ? "warn" : "soft");

export default function AdminHome() {
  const { data, error, reload } = useApi<AdminHotelRow[]>("/admin/hotels");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const failed = data?.reduce((n, h) => n + h.failedWebhooks24h, 0) ?? 0;

  async function replay() {
    setReplaying(true);
    setMsg(null);
    try {
      const res = await api<{ replayed: number }>("/admin/webhooks/replay", { body: {} });
      setMsg({ tone: "success", text: `Se reencolaron ${res.replayed} eventos.` });
      await reload();
    } catch (err) {
      setMsg({ tone: "error", text: errorMessage(err) });
    } finally {
      setReplaying(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Equipo CERGO"
        title="Hoteles"
        description="Alta de hoteles, agentes, líneas y salud del servicio. Todo lo que se hace acá queda auditado."
        actions={
          <>
            {failed > 0 && (
              <Button variant="ghost" size="sm" onClick={replay} loading={replaying}>
                <RefreshCw className="size-4" aria-hidden /> Reintentar {failed} eventos fallidos
              </Button>
            )}
            <ButtonLink href="/admin/hoteles/nuevo" size="sm">
              <Plus className="size-4" aria-hidden /> Nuevo hotel
            </ButtonLink>
          </>
        }
      />
      {error && <Alert tone="error">{error.message}</Alert>}
      {msg && <Alert tone={msg.tone} className="mb-5">{msg.text}</Alert>}
      {!data && !error && <Loading />}
      {data && (
        <Card>
          {data.length === 0 ? (
            <EmptyState title="Todavía no hay hoteles">Creá el primero con “Nuevo hotel”.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.88rem]">
                <thead className="bg-surface-soft text-left text-[0.74rem] uppercase tracking-[0.06em] text-soft">
                  <tr>
                    <th className="px-4 py-3 font-bold">Hotel</th>
                    <th className="px-4 py-3 font-bold">Estado</th>
                    <th className="px-4 py-3 font-bold text-right">Minutos del mes</th>
                    <th className="px-4 py-3 font-bold text-right">Llamadas 7 días</th>
                    <th className="px-4 py-3 font-bold">Última llamada</th>
                    <th className="px-4 py-3 font-bold">Agente</th>
                    <th className="px-4 py-3 font-bold">Alertas</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.map((h) => {
                    const usage = h.monthlyMinutes ? h.minutesThisMonth / h.monthlyMinutes : 0;
                    return (
                      <tr key={h.id} className="align-top">
                        <td className="px-4 py-3">
                          <Link href={`/admin/hoteles/${h.id}`} className="font-semibold hover:underline">{h.name}</Link>
                          <p className="text-soft text-[0.8rem]">{[h.city, h.plan, ...h.phoneNumbers].filter(Boolean).join(" · ")}</p>
                        </td>
                        <td className="px-4 py-3"><Pill tone={statusTone(h.status)}>{statusLabel[h.status] ?? h.status}</Pill></td>
                        <td className="px-4 py-3 text-right tabular">
                          {formatNumber(h.minutesThisMonth)} / {formatNumber(h.monthlyMinutes)}
                          {usage >= 0.8 && <p className={usage >= 1 ? "text-error font-semibold" : "text-warn-ink font-semibold"}>{Math.round(usage * 100)} %</p>}
                        </td>
                        <td className="px-4 py-3 text-right tabular">{formatNumber(h.callsLast7d)}</td>
                        <td className="px-4 py-3 text-muted">{h.lastCallAt ? formatRelative(h.lastCallAt) : "—"}</td>
                        <td className="px-4 py-3">
                          {h.agentStatus === "none" ? <span className="text-soft">Sin publicar</span> : <span>{versionStatusLabels[h.agentStatus]}</span>}
                          {!h.elevenlabsAgentId && <p className="text-warn-ink text-[0.8rem] font-semibold">Falta ID de ElevenLabs</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {h.failedWebhooks24h > 0 && <Pill tone="error">{h.failedWebhooks24h} webhooks fallidos</Pill>}
                            {h.openHandoffs > 0 && <Pill tone="warn">{h.openHandoffs} pendientes</Pill>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            <Link href={`/h/${h.id}`} className="size-9 grid place-items-center rounded-chip hover:bg-brand/6" title="Ver el panel como el hotel" aria-label={`Ver el panel de ${h.name}`}>
                              <Eye className="size-4 text-brand" aria-hidden />
                            </Link>
                            <Link href={`/admin/hoteles/${h.id}`} className="size-9 grid place-items-center rounded-chip hover:bg-brand/6" title="Configurar" aria-label={`Configurar ${h.name}`}>
                              <Settings2 className="size-4 text-brand" aria-hidden />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
