"use client";

import { handoffStatusLabels, urgencyLabels, type HandoffListItem } from "@cergo/contracts";
import { BellRing, Phone } from "lucide-react";
import { useState } from "react";
import { List, LoadMore, RowLink } from "@/components/list";
import { useHotel } from "@/components/shell";
import { Alert, Card, EmptyState, Loading, PageHeader, Pill, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import { handoffTone, urgencyTone } from "@/lib/labels";
import { usePaged } from "@/lib/use-paged";

type Filter = "open" | "new" | "in_progress" | "resolved" | "all";
const filters: { value: Filter; label: string }[] = [
  { value: "open", label: "Abiertos" },
  { value: "new", label: "Nuevos" },
  { value: "in_progress", label: "En curso" },
  { value: "resolved", label: "Resueltos" },
  { value: "all", label: "Todos" },
];

export default function HandoffsPage() {
  const hotel = useHotel();
  const [status, setStatus] = useState<Filter>("open");
  const paged = usePaged<HandoffListItem>(`/h/${hotel.id}/handoffs?status=${status}`);

  return (
    <>
      <PageHeader
        title="Pendientes"
        description="Lo que el agente derivó a recepción: llamadas para devolver, pedidos especiales y urgencias. Avisamos por mail y WhatsApp apenas entran."
      />
      <Tabs value={status} onChange={setStatus} options={filters} className="mb-5" />
      {paged.error && <Alert tone="error">{paged.error.message}</Alert>}
      {!paged.ready && !paged.error && <Loading />}
      {paged.ready && (
        <Card className={cn("transition-opacity", paged.loading && "opacity-60")}>
          {paged.items.length === 0 ? (
            <EmptyState icon={<BellRing className="size-5" />} title={status === "open" ? "Nada pendiente" : "No hay pendientes acá"}>
              {status === "open" ? "Cuando el agente derive algo a recepción, aparece acá y les avisamos." : "Probá con otra pestaña."}
            </EmptyState>
          ) : (
            <List>
              {paged.items.map((h) => (
                <RowLink key={h.id} href={`${hotel.base}/pendientes/${h.id}`}>
                  <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[1fr_auto] items-start">
                    <div className="min-w-0">
                      <p className="font-semibold flex flex-wrap items-center gap-x-2">
                        {h.guestName ?? "Huésped sin nombre"}
                        {h.guestPhone && (
                          <span className="text-[0.84rem] text-soft font-medium inline-flex items-center gap-1 tabular">
                            <Phone className="size-3.5" aria-hidden /> {h.guestPhone}
                          </span>
                        )}
                      </p>
                      <p className="text-[0.92rem] mt-0.5">{h.reason}</p>
                      {h.summary && <p className="text-[0.86rem] text-muted mt-0.5 line-clamp-2">{h.summary}</p>}
                      <p className="text-[0.8rem] text-soft mt-1">
                        <span title={formatDateTime(h.createdAt, hotel.timezone)}>{formatRelative(h.createdAt)}</span>
                        {h.assignedTo && <> · a cargo de {h.assignedTo.name}</>}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      {h.urgency !== "normal" && <Pill tone={urgencyTone(h.urgency)}>{urgencyLabels[h.urgency]}</Pill>}
                      <Pill tone={handoffTone(h.status)}>{handoffStatusLabels[h.status]}</Pill>
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
