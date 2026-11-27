"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Alert, Button } from "./ui";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[0.88rem] font-semibold text-muted hover:text-ink mb-4">
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </Link>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-end gap-3 mb-5", className)}>{children}</div>;
}

export function LoadMore({
  nextCursor,
  loadMore,
  loadingMore,
  moreError,
}: {
  nextCursor: string | null;
  loadMore: () => void;
  loadingMore: boolean;
  moreError: string | null;
}) {
  if (!nextCursor && !moreError) return null;
  return (
    <div className="flex flex-col items-center gap-3 pt-5">
      {moreError && <Alert tone="error">{moreError}</Alert>}
      {nextCursor && (
        <Button variant="ghost" size="sm" loading={loadingMore} onClick={loadMore}>
          Cargar más
        </Button>
      )}
    </div>
  );
}

/** Fila de lista que lleva al detalle: grilla en escritorio, apilada en el teléfono. */
export function RowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <li>
      <Link href={href} className={cn("block px-5 py-3.5 hover:bg-brand/4 focus-visible:bg-brand/4 transition-colors", className)}>
        {children}
      </Link>
    </li>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>;
}
