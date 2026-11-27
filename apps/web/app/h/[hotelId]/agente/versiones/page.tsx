"use client";

import { versionStatusLabels, type AgentVersionDetail, type AgentVersionSummary, type VersionStatus } from "@cergo/contracts";
import { diffLines } from "diff";
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { BackLink } from "@/components/list";
import { useHotel } from "@/components/shell";
import { Alert, Button, Card, CardHeader, Dialog, Loading, PageHeader, Pill, Tabs } from "@/components/ui";
import { configToText } from "@/lib/agent-text";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type Tone = "lime" | "brand" | "warn" | "soft" | "error";
const tone = (s: VersionStatus): Tone => (s === "published" ? "lime" : s === "failed" ? "error" : s === "publishing" ? "brand" : s === "draft" ? "warn" : "soft");

function Diff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffLines(before, after), [before, after]);
  const changed = parts.some((p) => p.added || p.removed);
  if (!changed) return <p className="text-soft text-[0.92rem]">No hay diferencias en la configuración.</p>;
  return (
    <div className="rounded-tile border border-line overflow-hidden text-[0.86rem] leading-relaxed">
      {parts.map((p, i) =>
        p.value
          .replace(/\n$/, "")
          .split("\n")
          .map((line, j) => (
            <div
              key={`${i}-${j}`}
              className={cn(
                "px-3 py-0.5 whitespace-pre-wrap break-words",
                p.added && "bg-lime/45 text-lime-ink",
                p.removed && "bg-error-bg text-error-ink line-through decoration-error/40",
                !p.added && !p.removed && (line.startsWith("## ") ? "text-ink font-bold bg-surface-soft" : "text-muted"),
              )}
            >
              <span className="sr-only">{p.added ? "Agregado: " : p.removed ? "Quitado: " : ""}</span>
              <span aria-hidden className="inline-block w-4 select-none text-soft">{p.added ? "+" : p.removed ? "−" : ""}</span>
              {line || " "}
            </div>
          )),
      )}
    </div>
  );
}

export default function VersionsPage() {
  const hotel = useHotel();
  const { data: versions, error, reload } = useApi<AgentVersionSummary[]>(`/h/${hotel.id}/agent/versions`);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [against, setAgainst] = useState<"previous" | "live">("previous");
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const selected = versions?.find((v) => v.id === selectedId) ?? versions?.[0] ?? null;
  const live = versions?.find((v) => v.status === "published") ?? null;
  const previous = selected && versions ? (versions.find((v) => v.version < selected.version) ?? null) : null;
  const compareTo = against === "live" ? live : previous;

  const a = useApi<AgentVersionDetail>(selected ? `/h/${hotel.id}/agent/versions/${selected.id}` : null);
  const b = useApi<AgentVersionDetail>(compareTo && compareTo.id !== selected?.id ? `/h/${hotel.id}/agent/versions/${compareTo.id}` : null);

  async function restore() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/h/${hotel.id}/agent/restore`, { body: { versionId: selected.id } });
      setRestoreOpen(false);
      setMsg({ tone: "success", text: `Se está publicando una versión nueva con la configuración de la versión ${selected.version}.` });
      setSelectedId(null);
      await reload();
    } catch (err) {
      setRestoreOpen(false);
      setMsg({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BackLink href={`${hotel.base}/agente`}>Agente</BackLink>
      <PageHeader title="Historial de versiones" description="Cada vez que alguien guarda o publica queda una versión. Podés ver qué cambió y volver a cualquiera." />
      {error && <Alert tone="error">{error.message}</Alert>}
      {msg && <Alert tone={msg.tone} className="mb-5">{msg.text}</Alert>}
      {!versions && !error && <Loading />}
      {versions && versions.length === 0 && <Alert tone="info">Todavía no hay versiones.</Alert>}
      {versions && selected && (
        <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
          <Card>
            <ul className="divide-y divide-line max-h-[70vh] overflow-y-auto">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    aria-current={v.id === selected.id ? "true" : undefined}
                    className={cn("w-full text-left px-4 py-3 hover:bg-brand/4", v.id === selected.id && "bg-brand/6")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <strong>Versión {v.version}</strong>
                      <Pill tone={tone(v.status)}>{versionStatusLabels[v.status]}</Pill>
                    </span>
                    <span className="block text-[0.8rem] text-soft mt-0.5">
                      {formatDateTime(v.publishedAt ?? v.updatedAt, hotel.timezone)}
                      {(v.publishedBy ?? v.createdBy) && ` · ${v.publishedBy ?? v.createdBy}`}
                    </span>
                    {v.notes && <span className="block text-[0.84rem] text-muted mt-1 line-clamp-2">{v.notes}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="min-w-0">
            <CardHeader
              title={`Versión ${selected.version}`}
              description={selected.error ?? selected.notes ?? undefined}
              actions={
                hotel.can("agent:publish") && selected.status !== "published" && selected.status !== "publishing" && selected.status !== "draft" ? (
                  <Button size="sm" variant="ghost" onClick={() => setRestoreOpen(true)}>
                    <RotateCcw className="size-4" aria-hidden /> Volver a esta versión
                  </Button>
                ) : undefined
              }
            />
            <div className="p-5 flex flex-col gap-4">
              <Tabs
                value={against}
                onChange={setAgainst}
                options={[
                  { value: "previous", label: "Contra la versión anterior" },
                  { value: "live", label: "Contra la que está en vivo" },
                ]}
              />
              {a.error && <Alert tone="error">{a.error.message}</Alert>}
              {!compareTo && against === "previous" && a.data && (
                <>
                  <p className="text-[0.9rem] text-muted">Es la primera versión. Así quedó cargada:</p>
                  <Diff before="" after={configToText(a.data.config)} />
                </>
              )}
              {compareTo && compareTo.id === selected.id && <p className="text-soft text-[0.92rem]">Esta es la versión que está en vivo.</p>}
              {!compareTo && against === "live" && <p className="text-soft text-[0.92rem]">Todavía no hay una versión en vivo para comparar.</p>}
              {compareTo && compareTo.id !== selected.id && (!a.data || !b.data) && !a.error && !b.error && <Loading />}
              {compareTo && compareTo.id !== selected.id && a.data && b.data && (
                <>
                  <p className="text-[0.88rem] text-muted">
                    Cambios de la versión {selected.version} respecto de la versión {compareTo.version}: en verde lo que se agregó, tachado lo que se quitó.
                  </p>
                  <Diff before={configToText(b.data.config)} after={configToText(a.data.config)} />
                </>
              )}
            </div>
          </Card>
        </div>
      )}
      <Dialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title={selected ? `Volver a la versión ${selected.version}` : "Volver a una versión"}
        description="Se crea una versión nueva con esa configuración y se publica. El historial no se pierde."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRestoreOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={restore} loading={busy}>Publicar esa configuración</Button>
          </>
        }
      />
    </>
  );
}
