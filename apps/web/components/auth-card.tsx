import type { ReactNode } from "react";

/** Marco de las pantallas de ingreso: crema, logo y una tarjeta centrada. */
export function AuthCard({ title, description, children, footer }: { title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-10">
      <a href="/" className="mb-8" aria-label="CERGO">
        <img src="/cergo-logo.svg" alt="CERGO" className="h-9 w-auto" />
      </a>
      <section className="w-full max-w-[440px] bg-surface border border-line rounded-card shadow-card p-7 sm:p-8">
        <h1 className="font-serif text-[2.1rem] leading-[1.05]">{title}</h1>
        {description && <p className="text-muted mt-2 leading-relaxed">{description}</p>}
        <div className="mt-6">{children}</div>
      </section>
      {footer && <div className="mt-5 text-[0.9rem] text-muted text-center">{footer}</div>}
    </main>
  );
}
