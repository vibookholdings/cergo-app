"use client";

import {
  languageLabels,
  weekdayLabels,
  weekdays,
  type AgentConfig,
  type FaqItem,
  type Language,
  type Room,
  type TimeRange,
  type WeeklySchedule,
} from "@cergo/contracts";
import { ArrowDown, ArrowUp, Copy, Plus, Search, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/ui";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function move<T>(list: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(i, 1);
  next.splice(j, 0, item as T);
  return next;
}

const numberOrNull = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function RowActions({ index, total, onMove, onRemove, what }: { index: number; total: number; onMove: (d: number) => void; onRemove: () => void; what: string }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="quiet" size="sm" className="px-2" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Subir ${what}`}>
        <ArrowUp className="size-4" aria-hidden />
      </Button>
      <Button variant="quiet" size="sm" className="px-2" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Bajar ${what}`}>
        <ArrowDown className="size-4" aria-hidden />
      </Button>
      <Button variant="quiet" size="sm" className="px-2 hover:text-error" onClick={onRemove} aria-label={`Quitar ${what}`}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Habitaciones
// ---------------------------------------------------------------------------

export function RoomsEditor({ rooms, onChange }: { rooms: Room[]; onChange: (rooms: Room[]) => void }) {
  const set = (i: number, patch: Partial<Room>) => onChange(rooms.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-4">
      {rooms.length === 0 && <p className="text-soft text-[0.92rem]">Todavía no cargaste habitaciones. Sin habitaciones, el agente no puede cotizar.</p>}
      {rooms.map((r, i) => (
        <fieldset key={i} className="rounded-tile border border-line bg-surface-soft p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <legend className="font-bold text-[0.95rem]">{r.name || `Habitación ${i + 1}`}</legend>
            <RowActions index={i} total={rooms.length} what={r.name || "habitación"} onMove={(d) => onChange(move(rooms, i, d))} onRemove={() => onChange(rooms.filter((_, j) => j !== i))} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nombre">{(id) => <Input id={id} value={r.name} maxLength={80} onChange={(e) => set(i, { name: e.target.value })} placeholder="Doble superior" />}</Field>
            <Field label="Capacidad" optional>{(id) => <Input id={id} value={r.capacity} maxLength={120} onChange={(e) => set(i, { capacity: e.target.value })} placeholder="2 adultos y 1 menor" />}</Field>
            <Field label="Tarifa por noche (USD)" optional hint="Vacío: el agente no cotiza esta habitación y la deriva.">
              {(id) => <Input id={id} inputMode="decimal" value={r.rateUsd ?? ""} onChange={(e) => set(i, { rateUsd: numberOrNull(e.target.value) })} placeholder="90" />}
            </Field>
            <Field label="Tarifa en temporada alta (USD)" optional>
              {(id) => <Input id={id} inputMode="decimal" value={r.highSeasonRateUsd ?? ""} onChange={(e) => set(i, { highSeasonRateUsd: numberOrNull(e.target.value) })} placeholder="120" />}
            </Field>
          </div>
          <Field label="Descripción" optional hint="Lo que el agente cuenta si preguntan: vista, camas, baño, metros.">
            {(id) => <Textarea id={id} value={r.description} maxLength={600} className="min-h-[72px]" onChange={(e) => set(i, { description: e.target.value })} />}
          </Field>
        </fieldset>
      ))}
      {rooms.length < 60 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange([...rooms, { name: "", capacity: "", rateUsd: null, highSeasonRateUsd: null, description: "" }])}>
          <Plus className="size-4" aria-hidden /> Agregar habitación
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Temporada alta
// ---------------------------------------------------------------------------

function MonthDayInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const [mm, dd] = value.split("-");
  const month = Number(mm) || 1;
  const day = Number(dd) || 1;
  const emit = (m: number, d: number) => onChange(`${String(m).padStart(2, "0")}-${String(Math.min(d, DAYS_IN_MONTH[m - 1] ?? 31)).padStart(2, "0")}`);
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[0.9rem] font-bold">{label}</span>
      <div className="flex gap-2" role="group" aria-labelledby={id}>
        <Select aria-label={`${label}: día`} value={day} onChange={(e) => emit(month, Number(e.target.value))} className="w-[84px]">
          {Array.from({ length: DAYS_IN_MONTH[month - 1] ?? 31 }, (_, k) => k + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
        <Select aria-label={`${label}: mes`} value={month} onChange={(e) => emit(Number(e.target.value), day)} className="w-[150px]">
          {MONTHS.map((m, k) => (
            <option key={m} value={k + 1}>{m}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export function SeasonEditor({ ranges, onChange }: { ranges: AgentConfig["highSeason"]; onChange: (v: AgentConfig["highSeason"]) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {ranges.length === 0 && <p className="text-soft text-[0.92rem]">Sin temporada alta: el agente usa siempre la tarifa normal.</p>}
      {ranges.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-4 rounded-tile border border-line bg-surface-soft p-4">
          <MonthDayInput label="Desde" value={r.from} onChange={(from) => onChange(ranges.map((x, j) => (j === i ? { ...x, from } : x)))} />
          <MonthDayInput label="Hasta" value={r.to} onChange={(to) => onChange(ranges.map((x, j) => (j === i ? { ...x, to } : x)))} />
          <Button variant="quiet" size="sm" className="hover:text-error" onClick={() => onChange(ranges.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" aria-hidden /> Quitar
          </Button>
        </div>
      ))}
      {ranges.length < 12 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange([...ranges, { from: "12-20", to: "02-28" }])}>
          <Plus className="size-4" aria-hidden /> Agregar período
        </Button>
      )}
      <p className="text-[0.84rem] text-soft">Los períodos se repiten todos los años. Si cruzan el año nuevo (por ejemplo, del 20 de diciembre al 28 de febrero) se toman bien.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preguntas frecuentes
// ---------------------------------------------------------------------------

export function FaqEditor({ faq, onChange }: { faq: FaqItem[]; onChange: (v: FaqItem[]) => void }) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const visible = faq.map((item, i) => ({ item, i })).filter(({ item }) => !f || `${item.question} ${item.answer}`.toLowerCase().includes(f));
  const set = (i: number, patch: Partial<FaqItem>) => onChange(faq.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="flex flex-col gap-4">
      {faq.length > 6 && (
        <div className="relative max-w-[360px]">
          <Search className="size-4 text-soft absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
          <Input type="search" aria-label="Buscar en las preguntas" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar pregunta" className="pl-10" />
        </div>
      )}
      {faq.length === 0 && <p className="text-soft text-[0.92rem]">Sumá las preguntas que más les hacen por teléfono: estacionamiento, mascotas, desayuno, cómo llegar.</p>}
      {visible.map(({ item, i }) => (
        <fieldset key={i} className="rounded-tile border border-line bg-surface-soft p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <legend className="font-bold text-[0.9rem] text-soft">Pregunta {i + 1}</legend>
            <RowActions index={i} total={faq.length} what={`la pregunta ${i + 1}`} onMove={(d) => onChange(move(faq, i, d))} onRemove={() => onChange(faq.filter((_, j) => j !== i))} />
          </div>
          <Field label="Pregunta">{(id) => <Input id={id} value={item.question} maxLength={300} onChange={(e) => set(i, { question: e.target.value })} placeholder="¿Aceptan mascotas?" />}</Field>
          <Field label="Respuesta">{(id) => <Textarea id={id} value={item.answer} maxLength={2000} className="min-h-[72px]" onChange={(e) => set(i, { answer: e.target.value })} placeholder="Sí, perros pequeños, con aviso previo y un cargo de USD 10 por noche." />}</Field>
        </fieldset>
      ))}
      {f && visible.length === 0 && <p className="text-soft text-[0.92rem]">Ninguna pregunta coincide con “{filter}”.</p>}
      {faq.length < 300 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            setFilter("");
            onChange([...faq, { question: "", answer: "" }]);
          }}
        >
          <Plus className="size-4" aria-hidden /> Agregar pregunta
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horario de recepción
// ---------------------------------------------------------------------------

type Day = (typeof weekdays)[number];
const ALL_DAY: TimeRange = { from: "00:00", to: "23:59" };

export function ScheduleEditor({ schedule, onChange }: { schedule: WeeklySchedule; onChange: (v: WeeklySchedule) => void }) {
  const setDay = (d: Day, ranges: TimeRange[]) => onChange({ ...schedule, [d]: ranges });
  const copyMonday = () => onChange(Object.fromEntries(weekdays.map((d) => [d, schedule["1"].map((r) => ({ ...r }))])) as WeeklySchedule);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.88rem] text-muted">
        Fuera de este horario el agente sabe que no hay nadie en recepción: toma el pedido y avisa que lo llaman cuando abran (las urgencias se avisan igual).
      </p>
      <div className="rounded-tile border border-line divide-y divide-line">
        {weekdays.map((d) => {
          const ranges = schedule[d];
          const open = ranges.length > 0;
          const allDay = ranges.length === 1 && ranges[0]?.from === "00:00" && ranges[0]?.to === "23:59";
          return (
            <div key={d} className="p-3.5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="w-[150px]">
                <Toggle checked={open} onChange={(v) => setDay(d, v ? [{ from: "08:00", to: "20:00" }] : [])} label={weekdayLabels[d]} />
              </div>
              {!open && <span className="text-[0.88rem] text-soft">Cerrado</span>}
              {open && allDay && <span className="text-[0.88rem] font-semibold">Las 24 horas</span>}
              {open && !allDay && (
                <div className="flex flex-wrap items-center gap-2">
                  {ranges.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-field bg-surface-soft border border-line pl-2 pr-1 py-1">
                      <Input type="time" aria-label={`${weekdayLabels[d]}: desde`} value={r.from} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} className="h-9 w-[112px] px-2" />
                      <span className="text-soft">a</span>
                      <Input type="time" aria-label={`${weekdayLabels[d]}: hasta`} value={r.to} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} className="h-9 w-[112px] px-2" />
                      {ranges.length > 1 && (
                        <Button variant="quiet" size="sm" className="px-1.5 h-8" onClick={() => setDay(d, ranges.filter((_, j) => j !== i))} aria-label="Quitar franja">
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  ))}
                  {ranges.length < 4 && (
                    <Button variant="quiet" size="sm" onClick={() => setDay(d, [...ranges, { from: "16:00", to: "20:00" }])}>
                      <Plus className="size-4" aria-hidden /> Franja
                    </Button>
                  )}
                </div>
              )}
              {open && (
                <Button variant="quiet" size="sm" className="ml-auto" onClick={() => setDay(d, allDay ? [{ from: "08:00", to: "20:00" }] : [ALL_DAY])}>
                  {allDay ? "Poner horario" : "24 horas"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <Button variant="ghost" size="sm" className="self-start" onClick={copyMonday}>
        <Copy className="size-4" aria-hidden /> Copiar el lunes a todos los días
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idiomas
// ---------------------------------------------------------------------------

const LANGS: Language[] = ["es", "en", "pt"];

export function LanguagesEditor({ languages, onChange }: { languages: Language[]; onChange: (v: Language[]) => void }) {
  const primary = languages[0] ?? "es";
  const others = languages.slice(1);
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Idioma con el que atiende" hint="Saluda en este idioma y cambia si el huésped habla otro de los habilitados.">
        {(id) => (
          <Select id={id} value={primary} onChange={(e) => {
            const p = e.target.value as Language;
            onChange([p, ...languages.filter((l) => l !== p)]);
          }}>
            {LANGS.map((l) => (
              <option key={l} value={l}>{languageLabels[l]}</option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[0.9rem] font-bold mb-1.5">También atiende en</legend>
        {LANGS.filter((l) => l !== primary).map((l) => (
          <label key={l} className="flex items-center gap-2.5 text-[0.93rem]">
            <input
              type="checkbox"
              className="size-[18px] accent-[var(--color-brand)]"
              checked={others.includes(l)}
              onChange={(e) => onChange(e.target.checked ? [primary, ...others, l] : [primary, ...others.filter((x) => x !== l)])}
            />
            {languageLabels[l]}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
