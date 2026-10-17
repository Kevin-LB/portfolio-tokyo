/**
 * Limitation de fréquence en mémoire (un seul conteneur : la mémoire du
 * processus suffit). Les fenêtres expirées sont oubliées : aucune adresse
 * ne reste en mémoire au-delà de sa fenêtre.
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  private limit: number;
  private windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
    const timer = setInterval(() => this.prune(Date.now()), 60_000);
    timer.unref?.();
  }

  /** Vrai si la clé a atteint la limite. */
  blocked(key: string, now = Date.now()) {
    const b = this.buckets.get(key);
    return !!b && b.resetAt > now && b.count >= this.limit;
  }

  hit(key: string, now = Date.now()) {
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
    else b.count++;
  }

  retryAfter(key: string, now = Date.now()) {
    const b = this.buckets.get(key);
    return b ? Math.max(0, Math.ceil((b.resetAt - now) / 1000)) : 0;
  }

  reset(key: string) {
    this.buckets.delete(key);
  }

  private prune(now: number) {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}
