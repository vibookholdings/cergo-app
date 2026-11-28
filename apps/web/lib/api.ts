"use client";

/** Cliente de la API del panel (vía el proxy /api del mismo dominio). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function redirectFor(code: string): string | null {
  if (typeof window === "undefined") return null;
  const here = window.location.pathname + window.location.search;
  if (code === "unauthorized" && !here.startsWith("/entrar")) return `/entrar?next=${encodeURIComponent(here)}`;
  if (code === "mfa_required" && !here.startsWith("/entrar/2fa")) return `/entrar/2fa?next=${encodeURIComponent(here)}`;
  if (code === "mfa_setup_required" && !here.startsWith("/cuenta")) return "/cuenta?activar2fa=1";
  return null;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; redirectOnAuth?: boolean } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" ? { "x-cergo-csrf": "1" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Sin conexión. Revisá internet y probá de nuevo.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text().catch(() => "");
  let data: ({ error?: { code: string; message: string; details?: unknown } } & Record<string, unknown>) | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error?.code ?? "internal", data?.error?.message ?? "Algo salió mal", data?.error?.details);
    if (init.redirectOnAuth !== false) {
      const to = redirectFor(err.code);
      if (to) window.location.assign(to);
    }
    throw err;
  }
  return (data ?? undefined) as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Algo salió mal";
