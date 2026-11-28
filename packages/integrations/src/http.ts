export class IntegrationError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
    public readonly retryable = true,
  ) {
    super(`[${provider}] ${message}`);
  }
}

/** fetch con timeout corto: ninguna integración puede colgar una llamada en curso. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 10_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureOk(provider: string, res: Response): Promise<Response> {
  if (res.ok) return res;
  let body = "";
  try {
    body = (await res.text()).slice(0, 500);
  } catch {
    // sin cuerpo
  }
  // 4xx (salvo 408/429) no se reintenta: el pedido está mal y reintentar no lo arregla.
  const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
  throw new IntegrationError(provider, `HTTP ${res.status}: ${body}`, res.status, retryable);
}
