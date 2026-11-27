"use client";

import { handoffStatusLabels, urgencyLabels, type HandoffDetail } from "@cergo/contracts";
import { CheckCircle2, Hand, Phone, PhoneCall, RotateCcw, UserMinus } from "lucide-react";
import Link from "next/link";
import { use, useState, type FormEvent } from "react";
import { BackLink } from "@/components/list";
import { useHotel, useMe } from "@/components/shell";
import { Alert, Button, Card, CardHeader, Field, KeyValue, Loading, PageHeader, Pill, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { handoffTone, urgencyTone } from "@/lib/labels";
import { useApi } from "@/lib/use-api";

export default function HandoffDetailPage({ params }: { params: Promise<{ handoffId: string }> }) {
  const { handoffId } = use(params);
  const hotel = useHotel();
  const me = useMe();
  const path = `/h/${hotel.id}/handoffs/${handoffId}`;
  const { data: h, error, mutate } = useApi<HandoffDetail>(path);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const canManage = hotel.can("handoffs:manage");

  async function patch(key: string, body: { status?: HandoffDetail["status"]; assignedTo?: string | null }) {
    setBusy(key);
    setActionError(null);
    try {
      mutate(await api<HandoffDetail>(path, { method: "PATCH", body }));
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function addComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy("comment");
    setActionError(null);
    try {
      mutate(await api<HandoffDetail>(`${path}/comments`, { body: { body: comment.trim() } }));
      setComment("");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <BackLink href={`${hotel.base}/pendientes`}>Pendientes</BackLink>
      {error && <Alert tone="error">{error.message}</Alert>}
      {!h && !error && <Loading />}
      {h && (
        <>
          <PageHeader
            eyebrow={`Entró ${formatRelative(h.createdAt)} · ${formatDateTime(h.createdAt, hotel.timezone)}`}
            title={h.guestName ?? "Huésped sin nombre"}
            actions={
              <div className="flex flex-wrap gap-1.5">
                {h.urgency !== "normal" && <Pill tone={urgencyTone(h.urgency)}>{urgencyLabels[h.urgency]}</Pill>}
                <Pill tone={handoffTone(h.status)}>{handoffStatusLabels[h.status]}</Pill>
              </div>
            }
          />
          {actionError && <Alert tone="error" className="mb-5">{actionError}</Alert>}
          <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
            <div className="flex flex-col gap-6 min-w-0">
              <Card>
                <CardHeader title="Qué necesita" />
                <div className="p-5 flex flex-col gap-3">
                  <p className="text-[1.05rem] font-semibold">{h.reason}</p>
                  {h.summary && <p className="leading-relaxed text-muted whitespace-pre-wrap">{h.summary}</p>}
                  {h.guestPhone && (
                    <a href={`tel:${h.guestPhone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-2 font-semibold text-brand hover:underline w-fit">
                      <Phone className="size-4" aria-hidden /> Llamar al {h.guestPhone}
                    </a>
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="Notas del equipo" description="Quedan en el historial de este pendiente." />
                <div className="p-5 flex flex-col gap-4">
                  {h.comments.length === 0 && <p className="text-soft text-[0.9rem]">Todavía no hay notas.</p>}
                  <ol className="flex flex-col gap-3">
                    {h.comments.map((c) => (
                      <li key={c.id} className="rounded-tile border border-line bg-surface-soft px-4 py-3">
                        <p className="text-[0.8rem] text-soft mb-1">
                          <strong className="text-ink font-semibold">{c.user?.name ?? "Alguien del equipo"}</strong> · {formatDateTime(c.createdAt, hotel.timezone)}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed text-[0.93rem]">{c.body}</p>
                      </li>
                    ))}
                  </ol>
                  {canManage && (
                    <form onSubmit={addComment} className="flex flex-col gap-3">
                      <Field label="Agregar una nota">
                        {(id) => <Textarea id={id} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ej.: Lo llamé a las 18, le mando la cotización por mail." maxLength={4000} />}
                      </Field>
                      <Button type="submit" size="sm" className="self-end" loading={busy === "comment"} disabled={!comment.trim()}>
                        Guardar nota
                      </Button>
                    </form>
                  )}
                </div>
              </Card>
            </div>
            <div className="flex flex-col gap-6">
              {canManage && (
                <Card>
                  <CardHeader title="Acciones" />
                  <div className="p-5 flex flex-col gap-2.5">
                    {h.status === "new" && (
                      <Button onClick={() => patch("take", { status: "in_progress" })} loading={busy === "take"}>
                        <Hand className="size-4" aria-hidden /> Lo tomo yo
                      </Button>
                    )}
                    {h.status !== "resolved" && (
                      <Button variant={h.status === "new" ? "ghost" : "primary"} onClick={() => patch("resolve", { status: "resolved" })} loading={busy === "resolve"}>
                        <CheckCircle2 className="size-4" aria-hidden /> Marcar como resuelto
                      </Button>
                    )}
                    {h.status === "resolved" && (
                      <Button variant="ghost" onClick={() => patch("reopen", { status: "in_progress" })} loading={busy === "reopen"}>
                        <RotateCcw className="size-4" aria-hidden /> Reabrir
                      </Button>
                    )}
                    {h.assignedTo?.id === me.user.id && h.status !== "resolved" && (
                      <Button variant="quiet" onClick={() => patch("release", { assignedTo: null })} loading={busy === "release"}>
                        <UserMinus className="size-4" aria-hidden /> Soltarlo
                      </Button>
                    )}
                    {h.assignedTo?.id !== me.user.id && h.status === "in_progress" && (
                      <Button variant="quiet" onClick={() => patch("assign", { assignedTo: me.user.id })} loading={busy === "assign"}>
                        <Hand className="size-4" aria-hidden /> Pasármelo a mí
                      </Button>
                    )}
                  </div>
                </Card>
              )}
              <Card>
                <CardHeader title="Datos" />
                <dl className="p-5 grid gap-4">
                  <KeyValue label="A cargo de">{h.assignedTo?.name ?? "Nadie todavía"}</KeyValue>
                  <KeyValue label="Aviso al equipo">{h.notifiedAt ? `Enviado ${formatRelative(h.notifiedAt)}` : "Pendiente de envío"}</KeyValue>
                  {h.resolvedAt && (
                    <KeyValue label="Resuelto">
                      {formatDateTime(h.resolvedAt, hotel.timezone)}
                      {h.resolvedBy && ` por ${h.resolvedBy.name}`}
                    </KeyValue>
                  )}
                  {h.callId && hotel.can("calls:view") && (
                    <KeyValue label="Llamada">
                      <Link href={`${hotel.base}/llamadas/${h.callId}`} className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
                        <PhoneCall className="size-4" aria-hidden /> Escuchar la llamada
                      </Link>
                    </KeyValue>
                  )}
                </dl>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
