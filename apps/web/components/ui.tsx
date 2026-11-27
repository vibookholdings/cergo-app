"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, X } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

const button = cva(
  "inline-flex items-center justify-center gap-2.5 font-semibold transition-colors duration-200 active:translate-y-px disabled:opacity-60 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-ink hover:bg-brand-deep",
        ghost: "border-[1.5px] border-line-strong text-ink hover:border-ink bg-transparent",
        lime: "bg-lime text-lime-ink hover:bg-lime-hover",
        quiet: "text-muted hover:text-ink hover:bg-brand/6",
        danger: "border-[1.5px] border-error/40 text-error-ink hover:bg-error-bg",
      },
      size: {
        md: "h-[46px] px-5 rounded-field text-[0.95rem]",
        sm: "h-[38px] px-3.5 rounded-[10px] text-[0.88rem]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof button> & { loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, className, variant, size, children }: { href: string; className?: string; children: ReactNode } & VariantProps<typeof button>) {
  return (
    <Link href={href} className={cn(button({ variant, size }), className)}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------

const fieldBase =
  "w-full bg-surface border-[1.5px] border-line-strong rounded-field px-3.5 text-[0.95rem] text-ink placeholder:text-placeholder transition-colors hover:border-line-hover focus:outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/16 disabled:bg-bg-deep disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input"> & { invalid?: boolean }>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, "h-[46px]", invalid && "border-error", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea"> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldBase, "py-3 leading-relaxed min-h-[96px]", invalid && "border-error", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(function Select({ className, children, ...props }, ref) {
  // El ancho que se pase (w-*, max-w-*) va al contenedor; el chevron es propio para que se vea igual en todos lados.
  return (
    <div className={cn("relative", className)}>
      <select ref={ref} className={cn(fieldBase, "h-[46px] pr-9 appearance-none cursor-pointer")} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted" aria-hidden />
    </div>
  );
});

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[0.9rem] font-bold text-ink">
        {label}
        {optional && <span className="font-medium text-soft"> (opcional)</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="text-[0.82rem] text-soft leading-snug">{hint}</p>}
      {error && <p className="text-[0.84rem] font-semibold text-error">{error}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("mt-0.5 relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-brand" : "bg-line-strong", disabled && "opacity-60")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-surface shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block font-semibold text-[0.92rem]">{label}</span>
        {description && <span className="block text-[0.84rem] text-muted">{description}</span>}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contenedores
// ---------------------------------------------------------------------------

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("bg-surface border border-line rounded-card shadow-card overflow-hidden", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-surface-soft border-b border-line", className)}>
      <div className="min-w-0">
        <h2 className="font-bold text-[1rem] leading-tight">{title}</h2>
        {description && <p className="text-[0.84rem] text-muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && <p className="text-[0.74rem] font-bold uppercase tracking-[0.1em] text-soft mb-1.5">{eyebrow}</p>}
        <h1 className="font-serif text-[clamp(2rem,1.6rem+1.6vw,2.75rem)] leading-[1.05] text-ink">{title}</h1>
        {description && <p className="text-muted mt-2 max-w-[62ch] leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

const pill = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[0.78rem] font-bold whitespace-nowrap", {
  variants: {
    tone: {
      lime: "bg-lime text-lime-ink",
      warn: "bg-warn-bg text-warn-ink",
      soft: "bg-bg-deep text-muted",
      brand: "bg-brand/10 text-brand",
      error: "bg-error-bg text-error-ink",
    },
  },
  defaultVariants: { tone: "soft" },
});

export function Pill({ tone, children, className }: { children: ReactNode; className?: string } & VariantProps<typeof pill>) {
  return <span className={cn(pill({ tone }), className)}>{children}</span>;
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "error" | "success"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const styles = {
    info: "bg-brand/6 border-brand/20 text-ink",
    warn: "bg-warn-bg border-warn-ink/20 text-warn-ink",
    error: "bg-error-bg border-error/30 text-error-ink",
    success: "bg-lime/50 border-lime-ink/20 text-lime-ink",
  }[tone];
  const Icon = tone === "error" || tone === "warn" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-tile border px-4 py-3 text-[0.9rem]", styles, className)}>
      <Icon className="size-[18px] mt-0.5 shrink-0" strokeWidth={1.8} aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      {icon && <div className="size-11 rounded-field bg-bg-deep border border-line flex items-center justify-center text-brand mb-4">{icon}</div>}
      <p className="font-serif text-[1.6rem] leading-tight">{title}</p>
      {children && <div className="text-muted mt-2 max-w-[46ch] leading-relaxed">{children}</div>}
    </div>
  );
}

export function Loading({ label = "Cargando" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex flex-wrap gap-1 rounded-field bg-surface border border-line p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 px-3 rounded-chip text-[0.85rem] font-semibold transition-colors",
            value === o.value ? "bg-bg-deep text-ink" : "text-soft hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-soft">{label}</dt>
      <dd className="mt-1 text-[0.95rem]">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diálogo (nativo: foco atrapado, Escape y fondo los resuelve el navegador)
// ---------------------------------------------------------------------------

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "m-auto p-0 rounded-card border border-line bg-surface text-ink shadow-card w-[min(560px,calc(100vw-32px))] max-h-[calc(100dvh-48px)] backdrop:bg-ink/45",
        className,
      )}
    >
      {open && (
        <div className="flex flex-col max-h-[calc(100dvh-48px)]">
          <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
            <div className="min-w-0">
              <h2 id={titleId} className="font-bold text-[1.05rem] leading-tight">{title}</h2>
              {description && <p className="text-[0.86rem] text-muted mt-1">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="size-9 -mr-2 -mt-1 grid place-items-center rounded-chip hover:bg-brand/6" aria-label="Cerrar">
              <X className="size-[18px]" aria-hidden />
            </button>
          </header>
          <div className="px-5 py-4 overflow-y-auto">{children}</div>
          {footer && <footer className="px-5 py-3.5 border-t border-line bg-surface-soft flex flex-wrap justify-end gap-2">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Counter({ value, max }: { value: string; max: number }) {
  const near = value.length > max * 0.9;
  return (
    <span className={cn("text-[0.78rem] tabular", near ? "text-warn-ink font-semibold" : "text-soft")}>
      {value.length.toLocaleString("es-AR")} / {max.toLocaleString("es-AR")}
    </span>
  );
}
