"use client";

import {
  agentConfigSchema,
  weekdayLabels,
  type AgentConfig,
  type AgentState,
  type AgentVersionDetail,
  type AgentVersionSummary,
  type ReviewItem,
  type ReviewResult,
} from "@cergo/contracts";
import { compileAgent, reviewConfig } from "@cergo/core/agent";
import { AlertTriangle, CheckCircle2, History, Info, Mic, Rocket, Save, Sparkles, Undo2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ZodIssue } from "zod";
import { useHotel } from "@/components/shell";
import { Alert, Button, ButtonLink, Card, CardHeader, Counter, Dialog, Field, Input, Pill, Tabs, Textarea } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { FaqEditor, LanguagesEditor, RoomsEditor, ScheduleEditor, SeasonEditor } from "./fields";
import { VoiceTest } from "./voice-test";

type Tab = "datos" | "estilo" | "habitaciones" | "temporada" | "politicas" | "preguntas" | "horarios" | "derivaciones" | "avanzado" | "vista";

const TABS: { value: Tab; label: string }[] = [
  { value: "datos", label: "Datos" },
  { value: "estilo", label: "Saludo y estilo" },
  { value: "habitaciones", label: "Habitaciones" },
  { value: "temporada", label: "Temporada alta" },
  { value: "politicas", label: "Políticas" },
  { value: "preguntas", label: "Preguntas" },
  { value: "horarios", label: "Horarios" },
  { value: "derivaciones", label: "Derivaciones" },
  { value: "avanzado", label: "Avanzado" },
  { value: "vista", label: "Vista previa" },
];

function tabForPath(path: (string | number)[]): Tab {
  const [a] = path;
  switch (a) {
    case "hotel":
      return "datos";
    case "greeting":
    case "personality":
    case "objectives":
    case "languages":
      return "estilo";
    case "rooms":
      return "habitaciones";
    case "highSeason":
      return "temporada";
    case "policies":
    case "maxGroupRooms":
      return "politicas";
    case "faq":
      return "preguntas";
    case "receptionHours":
      return "horarios";
    case "handoffRules":
      return "derivaciones";
    default:
      return "avanzado";
  }
}

function tabForSection(section: string): Tab {
  const s = section.toLowerCase();
  if (s.startsWith("habitaci")) return "habitaciones";
  if (s.startsWith("pregunta")) return "preguntas";
  if (s.startsWith("horario")) return "horarios";
  if (s.startsWith("saludo") || s.startsWith("estilo") || s.startsWith("qué resolver")) return "estilo";
  if (s.startsWith("cuándo derivar")) return "derivaciones";
  if (s.startsWith("políticas")) return "politicas";
  if (s.startsWith("temporada")) return "temporada";
  if (s.startsWith("datos")) return "datos";
  if (s.startsWith("modo avanzado")) return "avanzado";
  return "vista";
}

function pathLabel(path: (string | number)[]): string {
  const [a, b] = path;
  if (a === "rooms") return typeof b === "number" ? `Habitación ${b + 1}` : "Habitaciones";
  if (a === "faq") return typeof b === "number" ? `Pregunta ${b + 1}` : "Preguntas frecuentes";
  if (a === "receptionHours" && typeof b === "string" && b in weekdayLabels) return `Horario del ${weekdayLabels[b as keyof typeof weekdayLabels].toLowerCase()}`;
  const labels: Record<string, string> = {
    hotel: "Datos del hotel",
    greeting: "Saludo",
    personality: "Estilo",
    objectives: "Qué resolver",
    languages: "Idiomas",
    highSeason: "Temporada alta",
    policies: "Políticas",
    maxGroupRooms: "Políticas",
    handoffRules: "Derivaciones",
    advanced: "Avanzado",
    voiceId: "Avanzado",
  };
  return labels[String(a)] ?? "Configuración";
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-serif text-[1.75rem] leading-tight">{title}</h2>
        {description && <p className="text-muted mt-1 max-w-[64ch] leading-relaxed text-[0.93rem]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function LongText({
  label,
  value,
  max,
  onChange,
  hint,
  placeholder,
  rows = 6,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="flex flex-col gap-1">
          <Textarea id={id} value={value} maxLength={max} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
          <div className="self-end">
            <Counter value={value} max={max} />
          </div>
        </div>
      )}
    </Field>
  );
}

const severityOrder = { error: 0, warning: 1, info: 2 } as const;

function ReviewList({ items, onGo }: { items: ReviewItem[]; onGo: (t: Tab) => void }) {
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 text-[0.9rem] text-lime-ink">
        <CheckCircle2 className="size-4" aria-hidden /> Todo en orden.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {[...items]
        .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
        .map((item, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onGo(tabForSection(item.section))}
              className={cn(
                "w-full text-left flex gap-2.5 rounded-field border px-3 py-2.5 text-[0.86rem] hover:border-ink transition-colors",
                item.severity === "error" ? "bg-error-bg border-error/30 text-error-ink" : item.severity === "warning" ? "bg-warn-bg border-warn-ink/20 text-warn-ink" : "bg-surface-soft border-line text-muted",
              )}
            >
              {item.severity === "info" ? <Info className="size-4 shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />}
              <span>
                <strong className="font-bold">{item.section}:</strong> {item.message}
              </span>
            </button>
          </li>
        ))}
    </ul>
  );
}

export function AgentEditor({ state, failed, reload }: { state: AgentState; failed: AgentVersionDetail | null; reload: () => Promise<void> }) {
  const hotel = useHotel();
  const base = `/h/${hotel.id}/agent`;
  const saved: AgentConfig | null = state.draft?.config ?? failed?.config ?? state.published?.config ?? null;
  const savedJson = JSON.stringify(saved);
  const [config, setConfig] = useState<AgentConfig | null>(saved);
  const lastSaved = useRef(savedJson);
  const [tab, setTab] = useState<Tab>("datos");
  const [busy, setBusy] = useState<"save" | "publish" | "discard" | "review" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [issues, setIssues] = useState<ZodIssue[]>([]);
  const [serverReview, setServerReview] = useState<{ forJson: string; result: ReviewResult } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);

  // Si el estado del servidor cambia (se publicó, otro usuario guardó) y acá no hay cambios
  // locales, la pantalla sigue al servidor.
  useEffect(() => {
    if (savedJson === lastSaved.current) return;
    setConfig((current) => (JSON.stringify(current) === lastSaved.current ? saved : current));
    lastSaved.current = savedJson;
  }, [savedJson]);

  const configJson = JSON.stringify(config);
  const dirty = configJson !== savedJson;
  const readOnly = !state.canDraft;
  const publishing = state.inFlight?.status === "publishing";

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!publishing) return;
    const t = setInterval(() => void reload(), 2500);
    return () => clearInterval(t);
  }, [publishing, reload]);

  // Cuando termina la publicación que pidió esta pantalla, avisamos cómo salió.
  useEffect(() => {
    if (pendingVersion === null) return;
    if (state.published?.version === pendingVersion) {
      setMessage({ tone: "success", text: `Listo: el agente ya atiende con la versión ${pendingVersion}.` });
      setPendingVersion(null);
    } else if (state.inFlight?.status === "failed" && state.inFlight.version === pendingVersion) {
      setMessage(null);
      setPendingVersion(null);
    }
  }, [pendingVersion, state.published?.version, state.inFlight?.status, state.inFlight?.version]);

  const deferred = useDeferredValue(config);
  const compiled = useMemo(() => (deferred ? compileAgent(deferred) : null), [deferred]);
  const liveReview = useMemo(() => (deferred && compiled ? reviewConfig(deferred, compiled) : []), [deferred, compiled]);
  const review = serverReview && serverReview.forJson === configJson ? serverReview.result.items : liveReview;

  const update = useCallback(<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
    setConfig((c) => (c ? { ...c, [key]: value } : c));
    setIssues([]);
  }, []);
  const updateHotel = (patch: Partial<AgentConfig["hotel"]>) => setConfig((c) => (c ? { ...c, hotel: { ...c.hotel, ...patch } } : c));

  if (!config) {
    return <Alert tone="warn">Este agente todavía no tiene configuración. Pedile al equipo de CERGO que lo inicialice.</Alert>;
  }

  function validate(): AgentConfig | null {
    const parsed = agentConfigSchema.safeParse(config);
    if (parsed.success) {
      setIssues([]);
      return parsed.data;
    }
    setIssues(parsed.error.issues);
    const first = parsed.error.issues[0];
    if (first) setTab(tabForPath(first.path));
    setMessage({ tone: "error", text: "Hay campos para completar antes de guardar." });
    return null;
  }

  async function saveDraft(): Promise<AgentVersionDetail | null> {
    const valid = validate();
    if (!valid) return null;
    const res = await api<AgentVersionDetail>(`${base}/draft`, { method: "PUT", body: { config: valid } });
    const json = JSON.stringify(res.config);
    lastSaved.current = json;
    setConfig(res.config);
    await reload();
    return res;
  }

  async function onSave() {
    setBusy("save");
    setMessage(null);
    try {
      if (await saveDraft()) setMessage({ tone: "success", text: "Borrador guardado. El agente en vivo no cambia hasta que publiques." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function onReview() {
    const valid = validate();
    if (!valid) return;
    setBusy("review");
    setMessage(null);
    try {
      const result = await api<ReviewResult>(`${base}/review`, { body: { config: valid } });
      setServerReview({ forJson: configJson, result });
      setMessage({
        tone: result.blocking ? "error" : "info",
        text: result.blocking ? "Hay cosas para corregir antes de publicar." : result.usedAi ? "Revisión completa, incluida la lectura con IA." : "Revisión completa.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function onPublish() {
    setBusy("publish");
    setMessage(null);
    try {
      let versionId = state.draft?.id ?? failed?.id;
      if (dirty || !versionId) {
        const res = await saveDraft();
        if (!res) {
          setPublishOpen(false);
          return;
        }
        versionId = res.id;
      }
      const res = await api<AgentVersionSummary>(`${base}/publish`, { body: { versionId, notes: notes.trim() || undefined } });
      setPublishOpen(false);
      setNotes("");
      setMessage({ tone: "info", text: "Publicando… En unos segundos el agente atiende con esta versión." });
      setPendingVersion(res.version);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_failed" && Array.isArray(err.details)) {
        setServerReview({ forJson: configJson, result: { items: err.details as ReviewItem[], blocking: true, usedAi: false } });
      }
      setPublishOpen(false);
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function onDiscardDraft() {
    setBusy("discard");
    setMessage(null);
    try {
      if (state.draft) await api(`${base}/draft`, { method: "DELETE" });
      const next = failed?.config ?? state.published?.config ?? config;
      lastSaved.current = JSON.stringify(next);
      setConfig(next);
      await reload();
      setMessage({ tone: "info", text: "Volviste a la versión publicada." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const errorsCount = issues.length + review.filter((r) => r.severity === "error").length;
  const voiceReady = state.elevenlabsConfigured && (state.agent.hasTestAgent || state.agent.voiceConfigured);

  return (
    <div className="flex flex-col gap-6">
      {/* Estado de versiones */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-tile border border-line bg-surface px-4 py-3">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-soft">En vivo</p>
          {state.published ? (
            <p className="mt-1 text-[0.92rem]">
              <strong>Versión {state.published.version}</strong>
              <span className="text-muted">
                {" "}
                · {state.published.publishedAt ? formatRelative(state.published.publishedAt) : ""}
                {state.published.publishedBy && ` por ${state.published.publishedBy}`}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-[0.92rem] text-muted">Todavía no publicaste ninguna versión.</p>
          )}
        </div>
        <div className="rounded-tile border border-line bg-surface px-4 py-3">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-soft">Borrador</p>
          <p className="mt-1 text-[0.92rem]">
            {state.draft ? (
              <>
                <strong>Versión {state.draft.version}</strong>
                <span className="text-muted"> · guardado {formatRelative(state.draft.updatedAt)}</span>
              </>
            ) : (
              <span className="text-muted">Sin borrador guardado.</span>
            )}
            {dirty && <Pill tone="warn" className="ml-2">Cambios sin guardar</Pill>}
          </p>
        </div>
        <div className="rounded-tile border border-line bg-surface px-4 py-3">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-soft">Línea</p>
          <p className="mt-1 text-[0.92rem]">
            {state.agent.voiceConfigured ? <span>Conectado a ElevenLabs</span> : <span className="text-muted">Sin agente de voz asignado todavía (lo hace CERGO).</span>}
          </p>
        </div>
      </div>

      {publishing && (
        <Alert tone="info" title={`Publicando la versión ${state.inFlight?.version}`}>
          El agente sigue atendiendo con la versión anterior hasta que termine. Tarda unos segundos.
        </Alert>
      )}
      {state.inFlight?.status === "failed" && !state.draft && (
        <Alert tone="error" title={`No se pudo publicar la versión ${state.inFlight.version}`}>
          {state.inFlight.error ?? "Probá de nuevo en unos minutos."} El agente sigue con la versión anterior. Podés reintentar con el botón Publicar.
        </Alert>
      )}
      {readOnly && <Alert tone="info">Podés ver cómo está configurado el agente. Para cambiarlo, pedíselo al dueño del hotel.</Alert>}
      {!readOnly && !state.canPublish && <Alert tone="info">Podés guardar borradores. Para que el agente los use, un dueño del hotel tiene que publicarlos.</Alert>}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="grid xl:grid-cols-[1fr_320px] gap-6 items-start">
        <Card className="min-w-0">
          <div className="px-4 pt-4 pb-3 border-b border-line bg-surface-soft overflow-x-auto">
            <Tabs value={tab} onChange={setTab} options={TABS} className="flex-nowrap sm:flex-wrap" />
          </div>
          <fieldset disabled={readOnly} className="p-5 sm:p-6 min-w-0">
            {tab === "datos" && (
              <Section title="Datos del hotel" description="Lo básico que el agente tiene que saber para responder sin dudar.">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Nombre del hotel">{(id) => <Input id={id} value={config.hotel.name} maxLength={120} onChange={(e) => updateHotel({ name: e.target.value })} />}</Field>
                  <Field label="Ciudad" optional>{(id) => <Input id={id} value={config.hotel.city} maxLength={120} onChange={(e) => updateHotel({ city: e.target.value })} />}</Field>
                  <Field label="Dirección" optional>{(id) => <Input id={id} value={config.hotel.address} maxLength={240} onChange={(e) => updateHotel({ address: e.target.value })} />}</Field>
                  <Field label="Teléfono de recepción" optional>{(id) => <Input id={id} value={config.hotel.phone} maxLength={60} onChange={(e) => updateHotel({ phone: e.target.value })} />}</Field>
                  <Field label="Mail" optional>{(id) => <Input id={id} type="email" value={config.hotel.email} maxLength={160} onChange={(e) => updateHotel({ email: e.target.value })} />}</Field>
                  <Field label="Web" optional>{(id) => <Input id={id} value={config.hotel.website} maxLength={200} onChange={(e) => updateHotel({ website: e.target.value })} />}</Field>
                  <Field label="Check-in desde">{(id) => <Input id={id} type="time" value={config.hotel.checkIn} onChange={(e) => updateHotel({ checkIn: e.target.value })} />}</Field>
                  <Field label="Check-out hasta">{(id) => <Input id={id} type="time" value={config.hotel.checkOut} onChange={(e) => updateHotel({ checkOut: e.target.value })} />}</Field>
                </div>
              </Section>
            )}

            {tab === "estilo" && (
              <Section title="Saludo y estilo" description="Cómo atiende: la primera frase, el tono y qué tiene que lograr en cada llamada.">
                <LongText label="Saludo" value={config.greeting} max={500} rows={3} onChange={(v) => update("greeting", v)} hint="Es lo primero que escucha quien llama. Corto y con el nombre del hotel." />
                <LongText
                  label="Estilo"
                  value={config.personality}
                  max={4000}
                  onChange={(v) => update("personality", v)}
                  placeholder="Cálido y cercano, tuteando. Si preguntan por la zona, recomendá el mirador y la costanera."
                />
                <LongText
                  label="Qué tiene que resolver"
                  value={config.objectives}
                  max={4000}
                  onChange={(v) => update("objectives", v)}
                  placeholder="Cotizar y tomar reservas de hasta 4 habitaciones. Responder dudas de la estadía. Ofrecer el desayuno incluido."
                />
                <LanguagesEditor languages={config.languages} onChange={(v) => update("languages", v)} />
              </Section>
            )}

            {tab === "habitaciones" && (
              <Section title="Habitaciones y tarifas" description="Tarifas de referencia en dólares por noche. El agente cotiza con estos valores y aclara que la reserva la confirma el hotel.">
                <RoomsEditor rooms={config.rooms} onChange={(v) => update("rooms", v)} />
              </Section>
            )}

            {tab === "temporada" && (
              <Section title="Temporada alta" description="En estas fechas el agente usa la tarifa de temporada alta de cada habitación.">
                <SeasonEditor ranges={config.highSeason} onChange={(v) => update("highSeason", v)} />
              </Section>
            )}

            {tab === "politicas" && (
              <Section title="Políticas" description="Cancelación, menores, mascotas, depósitos, formas de pago. Lo que el agente tiene que respetar al pie de la letra.">
                <LongText label="Políticas del hotel" value={config.policies} max={8000} rows={10} onChange={(v) => update("policies", v)} />
                <Field label="Máximo de habitaciones por reserva" hint="Pedidos más grandes (grupos, eventos) los deriva a recepción.">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      max={200}
                      className="w-[140px]"
                      value={config.maxGroupRooms}
                      onChange={(e) => update("maxGroupRooms", Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                    />
                  )}
                </Field>
              </Section>
            )}

            {tab === "preguntas" && (
              <Section title="Preguntas frecuentes" description="Respuestas exactas para lo que más preguntan. El agente las usa tal cual.">
                <FaqEditor faq={config.faq} onChange={(v) => update("faq", v)} />
              </Section>
            )}

            {tab === "horarios" && (
              <Section title="Horario de recepción" description="Cuándo hay alguien del equipo para atender lo que el agente deriva.">
                <ScheduleEditor schedule={config.receptionHours} onChange={(v) => update("receptionHours", v)} />
              </Section>
            )}

            {tab === "derivaciones" && (
              <Section
                title="Cuándo derivar a recepción"
                description="Además de las reglas fijas de CERGO (emergencias, quejas, grupos grandes, pagos), sumá los casos propios del hotel."
              >
                <LongText
                  label="Casos que siempre pasan a recepción"
                  value={config.handoffRules}
                  max={4000}
                  rows={8}
                  onChange={(v) => update("handoffRules", v)}
                  placeholder="Pedidos de eventos o casamientos. Reservas de más de 10 noches. Cualquier pedido de factura A."
                />
              </Section>
            )}

            {tab === "avanzado" && (
              <Section title="Avanzado" description="Indicaciones extra para casos especiales. No pueden saltear las reglas base de CERGO: si se contradicen, valen las reglas base.">
                <LongText label="Indicaciones adicionales" value={config.advanced} max={10000} rows={10} onChange={(v) => update("advanced", v)} />
                <Field label="ID de voz de ElevenLabs" optional hint="Vacío: usa la voz que eligió CERGO para tu hotel.">
                  {(id) => <Input id={id} value={config.voiceId ?? ""} maxLength={120} onChange={(e) => update("voiceId", e.target.value.trim() ? e.target.value.trim() : null)} />}
                </Field>
              </Section>
            )}

            {tab === "vista" && compiled && (
              <Section
                title="Vista previa"
                description="Esto es exactamente lo que recibe el agente. Arriba van las reglas base de CERGO (fijas, protegen al hotel); abajo, todo lo que cargaste vos."
              >
                <div className="rounded-tile border border-line bg-surface-soft p-4">
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-soft mb-1">Primer mensaje</p>
                  <p className="text-[0.95rem]">{compiled.firstMessage}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-soft">Prompt completo</p>
                    <span className="text-[0.78rem] text-soft tabular">{compiled.prompt.length.toLocaleString("es-AR")} caracteres · reglas base {compiled.baseLayerVersion}</span>
                  </div>
                  <pre className="max-h-[560px] overflow-auto rounded-tile border border-line bg-surface p-4 text-[0.8rem] leading-relaxed whitespace-pre-wrap font-mono text-ink">{compiled.prompt}</pre>
                </div>
              </Section>
            )}
          </fieldset>
        </Card>

        <div className="flex flex-col gap-6 xl:sticky xl:top-[88px]">
          {!readOnly && (
            <Card>
              <CardHeader title="Acciones" />
              <div className="p-4 flex flex-col gap-2.5">
                {state.canPublish && (
                  <Button
                    onClick={() => setPublishOpen(true)}
                    disabled={publishing || busy !== null || !(dirty || state.draft || failed)}
                    title={dirty || state.draft || failed ? undefined : "No hay cambios para publicar"}
                    loading={busy === "publish"}
                  >
                    <Rocket className="size-4" aria-hidden /> Publicar
                  </Button>
                )}
                <Button variant={state.canPublish ? "ghost" : "primary"} onClick={onSave} loading={busy === "save"} disabled={!dirty || busy !== null}>
                  <Save className="size-4" aria-hidden /> Guardar borrador
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setVoiceOpen(true)}
                  disabled={!voiceReady}
                  title={voiceReady ? undefined : "La prueba por voz se habilita cuando CERGO conecta el agente de ElevenLabs."}
                >
                  <Mic className="size-4" aria-hidden /> Probar por voz
                </Button>
                <Button variant="quiet" onClick={onReview} loading={busy === "review"} disabled={busy !== null}>
                  <Sparkles className="size-4" aria-hidden /> Revisión completa
                </Button>
                {dirty && (
                  <Button variant="quiet" onClick={() => { setConfig(saved); setIssues([]); setMessage(null); }} disabled={busy !== null}>
                    <Undo2 className="size-4" aria-hidden /> Deshacer cambios sin guardar
                  </Button>
                )}
                {state.draft && state.published && (
                  <Button variant="quiet" onClick={onDiscardDraft} loading={busy === "discard"} disabled={busy !== null}>
                    Descartar el borrador
                  </Button>
                )}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader
              title="Revisión"
              description={errorsCount ? `${errorsCount} para corregir antes de publicar` : "Se actualiza mientras editás"}
            />
            <div className="p-4 flex flex-col gap-3">
              {issues.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {issues.map((issue, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setTab(tabForPath(issue.path))}
                        className="w-full text-left flex gap-2.5 rounded-field border px-3 py-2.5 text-[0.86rem] bg-error-bg border-error/30 text-error-ink hover:border-ink"
                      >
                        <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
                        <span>
                          <strong className="font-bold">{pathLabel(issue.path)}:</strong> {issue.message}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <ReviewList items={review} onGo={setTab} />
            </div>
          </Card>
          <ButtonLink href={`${hotel.base}/agente/versiones`} variant="quiet" className="self-start">
            <History className="size-4" aria-hidden /> Historial de versiones
          </ButtonLink>
        </div>
      </div>

      <Dialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publicar esta configuración"
        description="El agente empieza a atender con esta versión en unos segundos. Siempre podés volver a una anterior desde el historial."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPublishOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onPublish} loading={busy === "publish"} disabled={errorsCount > 0}>
              <Rocket className="size-4" aria-hidden /> Publicar ahora
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {errorsCount > 0 && <Alert tone="error">Hay {errorsCount} cosas para corregir antes de publicar. Están en el panel de revisión.</Alert>}
          {errorsCount === 0 && review.some((r) => r.severity === "warning") && (
            <Alert tone="warn">Hay avisos en la revisión. Podés publicar igual, pero conviene mirarlos.</Alert>
          )}
          <Field label="¿Qué cambiaste?" optional hint="Queda en el historial para que el equipo sepa qué se tocó.">
            {(id) => <Input id={id} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Nuevas tarifas de verano" />}
          </Field>
        </div>
      </Dialog>

      {voiceReady && <VoiceTest hotelId={hotel.id} config={config} open={voiceOpen} onClose={() => setVoiceOpen(false)} />}

      {dirty && !readOnly && (
        <div className="fixed bottom-4 inset-x-4 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-field bg-brand text-brand-ink shadow-card px-4 py-2.5">
            <span className="text-[0.9rem] font-semibold">Tenés cambios sin guardar</span>
            <Button variant="lime" size="sm" onClick={onSave} loading={busy === "save"} disabled={busy !== null}>
              Guardar borrador
            </Button>
          </div>
        </div>
      )}
      <p className="text-[0.82rem] text-soft">
        ¿Dudas sobre qué conviene cargar? Mirá cómo quedó una llamada en <Link href={`${hotel.base}/llamadas`} className="font-semibold text-brand hover:underline">Llamadas</Link> y ajustá desde acá.
      </p>
    </div>
  );
}
