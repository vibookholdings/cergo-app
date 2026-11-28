"use client";

import type { Paginated } from "@cergo/contracts";
import { useState } from "react";
import { api, errorMessage } from "./api";
import { useApi } from "./use-api";

/**
 * Lista paginada por cursor. La primera página se refresca sola (al volver a la pestaña); las
 * siguientes se suman con "Cargar más" y se deduplican por id por si entraron registros nuevos.
 */
export function usePaged<T extends { id: string }>(path: string | null) {
  const first = useApi<Paginated<T>>(path);
  const [more, setMore] = useState<{ path: string; items: T[]; cursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const extra = more && more.path === path ? more : null;

  const seen = new Set<string>();
  const items: T[] = [];
  for (const item of [...(first.data?.items ?? []), ...(extra?.items ?? [])]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  const nextCursor = extra ? extra.cursor : (first.data?.nextCursor ?? null);

  async function loadMore() {
    if (!path || !nextCursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const sep = path.includes("?") ? "&" : "?";
      const page = await api<Paginated<T>>(`${path}${sep}cursor=${encodeURIComponent(nextCursor)}`);
      setMore({ path, items: [...(extra?.items ?? []), ...page.items], cursor: page.nextCursor });
    } catch (err) {
      setMoreError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    items,
    ready: first.data !== undefined,
    loading: first.loading,
    error: first.error,
    nextCursor,
    loadMore,
    loadingMore,
    moreError,
    reload: first.reload,
  };
}

/** Arma un query string ignorando los vacíos. */
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
