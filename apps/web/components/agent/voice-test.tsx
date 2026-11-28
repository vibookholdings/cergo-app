"use client";

import type { AgentConfig, TestSession } from "@cergo/contracts";
import { Bot, Mic, MicOff, PhoneOff, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Dialog } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";

type Phase = "idle" | "connecting" | "live" | "ended";
type Line = { role: "user" | "agent"; text: string };

/**
 * Prueba por voz desde el navegador con la configuración que se está editando (aunque no esté
 * guardada). Las herramientas reciben cergo_test=1: cotizan pero no guardan reservas ni pendientes.
 */
export function VoiceTest({ hotelId, config, open, onClose }: { hotelId: string; config: AgentConfig; open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"speaking" | "listening">("listening");
  const [muted, setMuted] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const conv = useRef<{ endSession(): Promise<void>; setMicMuted(m: boolean): void } | null>(null);
  const bottom = useRef<HTMLLIElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ block: "nearest" }), [lines]);
  useEffect(() => () => void conv.current?.endSession(), []);

  async function start() {
    setError(null);
    setLines([]);
    setPhase("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setPhase("idle");
      setError("Necesitamos permiso para usar el micrófono. Habilitalo en el navegador y probá de nuevo.");
      return;
    }
    try {
      const session = await api<TestSession>(`/h/${hotelId}/agent/test-session`, { body: { config } });
      const { Conversation } = await import("@elevenlabs/client");
      type Lang = NonNullable<NonNullable<NonNullable<Parameters<typeof Conversation.startSession>[0]["overrides"]>["agent"]>["language"]>;
      conv.current = await Conversation.startSession({
        signedUrl: session.signedUrl,
        ...(session.mode === "overrides"
          ? {
              overrides: {
                agent: {
                  prompt: { prompt: session.overrides.prompt },
                  firstMessage: session.overrides.firstMessage,
                  language: session.overrides.language as Lang,
                },
              },
              dynamicVariables: session.dynamicVariables,
            }
          : { dynamicVariables: { cergo_test: "1" } }),
        onConnect: () => setPhase("live"),
        onDisconnect: () => {
          conv.current = null;
          setPhase("ended");
        },
        onError: (message: string) => setError(message || "Se cortó la conexión con el agente."),
        onModeChange: ({ mode: m }: { mode: "speaking" | "listening" }) => setMode(m),
        onMessage: ({ message, role }: { message: string; role: "user" | "agent" }) => setLines((l) => [...l, { role, text: message }]),
      });
    } catch (err) {
      setPhase("idle");
      setError(errorMessage(err));
    }
  }

  async function hangUp() {
    await conv.current?.endSession().catch(() => undefined);
    conv.current = null;
    setPhase("ended");
  }

  function close() {
    void hangUp();
    setPhase("idle");
    onClose();
  }

  function toggleMute() {
    conv.current?.setMicMuted(!muted);
    setMuted(!muted);
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Probar el agente por voz"
      description="Habla con la configuración que tenés en pantalla, aunque no la hayas guardado. Las reservas y pendientes de la prueba no se guardan."
      className="w-[min(640px,calc(100vw-32px))]"
      footer={
        phase === "live" ? (
          <>
            <Button variant="ghost" size="sm" onClick={toggleMute}>
              {muted ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />} {muted ? "Activar micrófono" : "Silenciar"}
            </Button>
            <Button variant="danger" size="sm" onClick={hangUp}>
              <PhoneOff className="size-4" aria-hidden /> Cortar
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={start} loading={phase === "connecting"}>
            <Mic className="size-4" aria-hidden /> {phase === "ended" ? "Llamar de nuevo" : "Empezar la prueba"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex items-center gap-3" aria-live="polite">
          <span
            className={cn(
              "size-3 rounded-full",
              phase === "live" ? (mode === "speaking" ? "bg-series-1 animate-pulse" : "bg-lime-ink") : phase === "connecting" ? "bg-warn-ink animate-pulse" : "bg-line-strong",
            )}
            aria-hidden
          />
          <span className="text-[0.92rem] font-semibold">
            {phase === "idle" && "Listo para llamar. Usá auriculares para que el agente no se escuche a sí mismo."}
            {phase === "connecting" && "Conectando…"}
            {phase === "live" && (mode === "speaking" ? "El agente está hablando" : "Te escucha")}
            {phase === "ended" && "Llamada terminada"}
          </span>
        </div>
        <ol className="flex flex-col gap-2.5 max-h-[340px] overflow-y-auto rounded-tile border border-line bg-surface-soft p-3.5 min-h-[120px]">
          {lines.length === 0 && <li className="text-soft text-[0.88rem] m-auto">Acá va a aparecer lo que digan.</li>}
          {lines.map((l, i) => (
            <li key={i} className={cn("flex gap-2 max-w-[90%]", l.role === "user" ? "self-end flex-row-reverse" : "self-start")}>
              <span className={cn("size-7 shrink-0 rounded-full grid place-items-center", l.role === "user" ? "bg-lime text-lime-ink" : "bg-brand text-brand-ink")}>
                {l.role === "user" ? <UserRound className="size-3.5" aria-hidden /> : <Bot className="size-3.5" aria-hidden />}
              </span>
              <p className={cn("rounded-tile px-3 py-2 text-[0.9rem] leading-relaxed border", l.role === "user" ? "bg-lime/35 border-lime" : "bg-surface border-line")}>{l.text}</p>
            </li>
          ))}
          <li ref={bottom} aria-hidden />
        </ol>
      </div>
    </Dialog>
  );
}
