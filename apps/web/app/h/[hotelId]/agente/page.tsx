"use client";

import type { AgentState, AgentVersionDetail } from "@cergo/contracts";
import { AgentEditor } from "@/components/agent/editor";
import { useHotel } from "@/components/shell";
import { Alert, Loading, PageHeader } from "@/components/ui";
import { useApi } from "@/lib/use-api";

export default function AgentPage() {
  const hotel = useHotel();
  const { data: state, error, reload } = useApi<AgentState>(`/h/${hotel.id}/agent`);
  const failedId = state && !state.draft && state.inFlight?.status === "failed" ? state.inFlight.id : null;
  const failed = useApi<AgentVersionDetail>(failedId ? `/h/${hotel.id}/agent/versions/${failedId}` : null);

  return (
    <>
      <PageHeader
        eyebrow="Agente"
        title={<>Cómo atiende <em className="text-brand">tu agente</em></>}
        description="Todo lo que dice y sabe el agente lo decidís desde acá: datos, tarifas, políticas, preguntas frecuentes y cuándo pasar a recepción. Guardás un borrador, lo probás y lo publicás."
      />
      {error && <Alert tone="error">{error.message}</Alert>}
      {!state && !error && <Loading />}
      {state && (!failedId || failed.data) && <AgentEditor state={state} failed={failedId ? (failed.data ?? null) : null} reload={reload} />}
      {state && failedId && !failed.data && !failed.error && <Loading />}
    </>
  );
}
