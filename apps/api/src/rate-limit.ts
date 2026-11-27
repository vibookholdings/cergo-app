/**
 * Límite de pedidos por ventana fija. La interfaz permite cambiar el almacenamiento: en memoria
 * alcanza con una réplica; con varias réplicas se usa uno compartido (Redis) sin tocar las rutas.
 */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  async hit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    if (now - this.lastSweep > 60_000) this.sweep(now);
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count++;
    return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
  }

  private sweep(now: number) {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
    this.lastSweep = now;
  }
}
