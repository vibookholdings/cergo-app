"use client";

/**
 * Gráficos del panel, en SVG propio (sin librerías). Siguen las reglas de datos de CERGO:
 * marcas finas (columnas de hasta 24 px con punta redondeada de 4 px), 2 px de aire entre
 * segmentos, grilla tenue, leyenda cuando hay más de una serie, tooltip al pasar el mouse o
 * con el teclado, y siempre una tabla con los mismos datos.
 */
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export const SERIES = ["var(--color-series-1)", "var(--color-series-2)", "var(--color-series-3)"] as const;

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const nice = Math.max(1, Number.isInteger(step) ? step : Math.ceil(step));
  return { top: Math.ceil(max / nice) * nice, step: nice };
}

/** Rectángulo con las dos esquinas de arriba redondeadas (la punta del dato) y la base recta. */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

// ---------------------------------------------------------------------------
// Tarjeta de métrica
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  delta,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Cambio contra el período anterior, con signo. `goodWhenUp` decide el color. */
  delta?: { value: number; text: string; goodWhenUp?: boolean; vs: string } | null;
  hint?: ReactNode;
  className?: string;
}) {
  const up = delta && delta.value > 0;
  const flat = !delta || delta.value === 0;
  const good = delta ? (delta.goodWhenUp === false ? !up : up) : false;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("bg-surface border border-line rounded-tile px-4 py-4 flex flex-col gap-1 min-w-0", className)}>
      <p className="text-[0.84rem] font-semibold text-muted">{label}</p>
      <p className="font-serif text-[2.4rem] leading-none text-brand mt-1">{value}</p>
      {delta && (
        <p className={cn("flex flex-wrap items-center gap-x-1 text-[0.8rem] font-semibold mt-1.5", flat ? "text-soft" : good ? "text-[#1e6b3f]" : "text-error")}>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Icon className="size-3.5" aria-hidden />
            {delta.text}
          </span>
          <span className="font-medium text-soft">{delta.vs}</span>
        </p>
      )}
      {hint && <p className="text-[0.8rem] text-soft mt-1">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Medidor (uso del plan)
// ---------------------------------------------------------------------------

export function Meter({ value, max, label, valueText }: { value: number; max: number; label: string; valueText: string }) {
  const ratio = max > 0 ? value / max : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const color = ratio >= 1 ? "var(--color-error)" : ratio >= 0.8 ? "#c98a1d" : "var(--color-series-1)";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[0.84rem] font-semibold text-muted">{label}</p>
        <p className="text-[0.88rem] font-semibold tabular">{valueText}</p>
      </div>
      <div
        className="h-2 rounded-full bg-series-1-track overflow-hidden"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      {ratio >= 0.8 && (
        <p className="text-[0.8rem] mt-1.5 text-warn-ink font-semibold">
          {ratio >= 1 ? "Superaste los minutos del plan este mes." : "Usaste más del 80 % de los minutos del plan."}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columnas (apiladas o simples) con tooltip
// ---------------------------------------------------------------------------

export type ColumnDatum = { key: string; label: string; longLabel: string; values: number[] };

export function ColumnChart({
  data,
  series,
  height = 220,
  labelEvery,
  ariaLabel,
}: {
  data: ColumnDatum[];
  series: { name: string; color: string }[];
  height?: number;
  /** Mostrar una etiqueta del eje X cada N columnas. */
  labelEvery?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const { top, step } = niceMax(Math.max(0, ...totals));
  const pad = { left: 34, right: 8, top: 10, bottom: 26 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.62));
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 64))));
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);

  const tooltip =
    active !== null && data[active] ? (
      <div
        className="pointer-events-none absolute z-10 min-w-[170px] rounded-tile border border-line bg-surface shadow-card px-3 py-2.5 text-[0.84rem]"
        style={{
          left: Math.min(Math.max(pad.left + band * active + band / 2 - 85, 0), Math.max(0, width - 180)),
          top: 0,
        }}
      >
        <p className="text-[0.76rem] font-semibold text-soft mb-1.5">{data[active].longLabel}</p>
        {series.length > 1 && (
          <p className="flex items-center justify-between gap-4 mb-1">
            <span className="text-muted">Total</span>
            <strong className="tabular">{totals[active]}</strong>
          </p>
        )}
        {series.map((s, i) => (
          <p key={s.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted">
              <span className="inline-block w-3 h-[3px] rounded-full" style={{ background: s.color }} aria-hidden />
              {s.name}
            </span>
            <strong className="tabular">{data[active]?.values[i] ?? 0}</strong>
          </p>
        ))}
      </div>
    ) : null;

  return (
    <div>
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-[0.84rem] text-muted">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-axis)" : "var(--color-grid)"} strokeWidth={1} />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-soft tabular" fontSize={11}>
                  {t}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.left + band * i + band / 2;
              const x = cx - barW / 2;
              let acc = 0;
              const visible = d.values.map((v, si) => ({ v, si })).filter((s) => s.v > 0);
              const lastIdx = visible.length - 1;
              return (
                <g key={d.key} opacity={active === null || active === i ? 1 : 0.55}>
                  {visible.map(({ v, si }, n) => {
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    // 2 px de aire entre segmentos apilados (el de abajo arranca en la base).
                    const gap = n > 0 ? 2 : 0;
                    const h = Math.max(0, y0 - y1 - gap);
                    if (h <= 0) return null;
                    return n === lastIdx ? (
                      <path key={si} d={topRoundedRect(x, y1, barW, h, 4)} fill={series[si]?.color} />
                    ) : (
                      <rect key={si} x={x} y={y1 + 0} width={barW} height={h} fill={series[si]?.color} />
                    );
                  })}
                  {(i % every === 0 || data.length <= 8) && (
                    <text x={cx} y={height - 8} textAnchor="middle" className="fill-soft" fontSize={11}>
                      {d.label}
                    </text>
                  )}
                  <rect
                    x={pad.left + band * i}
                    y={pad.top}
                    width={band}
                    height={innerH}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${d.longLabel}: ${series.map((s, si) => `${s.name} ${d.values[si] ?? 0}`).join(", ")}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerMove={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="outline-none focus-visible:stroke-brand"
                  />
                </g>
              );
            })}
          </svg>
        )}
        {tooltip}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barras horizontales ordenadas (parte de un todo)
// ---------------------------------------------------------------------------

export function RankedBars({ rows, color = SERIES[0] }: { rows: { label: string; value: number }[]; color?: string }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((r) => {
        const share = total ? Math.round((r.value / total) * 100) : 0;
        return (
          <li key={r.label} className="grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-3 text-[0.88rem]" title={`${r.label}: ${r.value} (${share} %)`}>
            <span className="text-muted truncate">{r.label}</span>
            <span className="h-3 relative">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px]"
                style={{ width: r.value ? `max(4px, ${(r.value / max) * 100}%)` : 0, background: color }}
              />
            </span>
            <span className="tabular font-semibold text-right min-w-[64px]">
              {r.value} <span className="text-soft font-medium">· {share} %</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Tabla con los mismos datos del gráfico (accesible y para quien prefiere números). */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [caption]);
  return (
    <details className="mt-3 group" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-[0.84rem] font-semibold text-brand select-none">Ver tabla</summary>
      <div className="mt-2 max-h-[280px] overflow-auto rounded-tile border border-line">
        <table className="w-full text-[0.84rem]">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-soft sticky top-0">
            <tr>
              {head.map((h) => (
                <th key={h} className="text-left font-semibold text-muted px-3 py-2 border-b border-line">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {r.map((c, j) => (
                  <td key={j} className={cn("px-3 py-1.5", typeof c === "number" && "tabular")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
