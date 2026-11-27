"use client";

import { callOutcomes, callReasons, outcomeLabels, reasonLabels, type CallListItem, type CallOutcome, type CallReason } from "@cergo/contracts";
import { Moon, PhoneCall, Search } from "lucide-react";
import { useState } from "react";
import { FilterBar, List, LoadMore, RowLink } from "@/components/list";
import { useHotel } from "@/components/shell";
import { Alert, Card, EmptyState, Field, Input, Loading, PageHeader, Pill, Select, Toggle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration } from "@/lib/format";
import { outcomeTone } from "@/lib/labels";
import { useDebounced } from "@/lib/use-debounced";
import { qs, usePaged } from "@/lib/use-paged";

export default function CallsPage() {
  const hotel = useHotel();
  const [q, setQ] = useState("");
  const [reason, setReason] = useState<CallReason | "">("");
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tests, setTests] = useState(false);
  const search = useDebounced(q.trim());
  const path = `/h/${hotel.id}/calls${qs({ q: search, reason, outcome, from, to, test: tests ? "include" : "" })}`;
  const paged = usePaged<CallListItem>(path);
  const filtered = Boolean(search || reason || outcome || from || to);

  return (
    <>
      <PageHeader title="Llamadas" description="Todo lo que atendió el agente, con el resumen, la grabación y la transcripción de cada llamada." />
      <FilterBar>
        <Field label="Buscar" className="w-full sm:w-[280px]">
          {(id) => (
            <div className="relative">
              <Search className="size-4 text-soft absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
              <Input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, número o tema" className="pl-10" />
            </div>
          )}
        </Field>
        <Field label="Motivo" className="w-[calc(50%-6px)] sm:w-[170px]">
          {(id) => (
            <Select id={id} value={reason} onChange={(e) => setReason(e.target.value as CallReason | "")}>
              <option value="">Todos</option>
              {callReasons.map((r) => (
                <option key={r} value={r}>{reasonLabels[r]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Resultado" className="w-[calc(50%-6px)] sm:w-[170px]">
          {(id) => (
            <Select id={id} value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome | "")}>
              <option value="">Todos</option>
              {callOutcomes.map((o) => (
                <option key={o} value={o}>{outcomeLabels[o]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Desde" className="w-[calc(50%-6px)] sm:w-[160px]">
          {(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} />}
        </Field>
        <Field label="Hasta" className="w-[calc(50%-6px)] sm:w-[160px]">
          {(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} />}
        </Field>
        <div className="pb-2.5">
          <Toggle checked={tests} onChange={setTests} label="Incluir pruebas" />
        </div>
      </FilterBar>

      {paged.error && <Alert tone="error">{paged.error.message}</Alert>}
      {!paged.ready && !paged.error && <Loading />}
      {paged.ready && (
        <Card className={cn("transition-opacity", paged.loading && "opacity-60")}>
          {paged.items.length === 0 ? (
            <EmptyState icon={<PhoneCall className="size-5" />} title={filtered ? "No hay llamadas con esos filtros" : "Todavía no hay llamadas"}>
              {filtered ? "Probá con otras fechas o sacá algún filtro." : "Cuando el agente atienda la primera llamada, la vas a ver acá con su resumen."}
            </EmptyState>
          ) : (
            <List>
              {paged.items.map((c) => (
                <RowLink key={c.id} href={`${hotel.base}/llamadas/${c.id}`}>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[150px_1fr_auto] items-start">
                    <div className="text-[0.86rem]">
                      <p className="font-semibold tabular">{formatDateTime(c.startedAt, hotel.timezone)}</p>
                      <p className="text-soft tabular">{c.callerNumber ?? "Número oculto"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[0.92rem] leading-snug line-clamp-2">{c.summary ?? <span className="text-soft">Sin resumen</span>}</p>
                      <p className="text-[0.8rem] text-soft mt-1 flex flex-wrap items-center gap-x-2">
                        <span>{reasonLabels[c.reason]}</span>
                        <span aria-hidden>·</span>
                        <span className="tabular">{formatDuration(c.durationSecs)}</span>
                        {c.language && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="uppercase">{c.language}</span>
                          </>
                        )}
                        {c.afterHours && (
                          <span className="inline-flex items-center gap-1">
                            <span aria-hidden>·</span>
                            <Moon className="size-3.5" aria-hidden /> fuera de horario
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      {c.isTest && <Pill tone="soft">Prueba</Pill>}
                      <Pill tone={outcomeTone(c.outcome)}>{outcomeLabels[c.outcome]}</Pill>
                    </div>
                  </div>
                </RowLink>
              ))}
            </List>
          )}
        </Card>
      )}
      <LoadMore {...paged} />
    </>
  );
}
