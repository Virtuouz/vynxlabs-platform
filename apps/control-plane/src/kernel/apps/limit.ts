/**
 * A small limit on how often one caller may do one thing, kept in this
 * process. It is for pages and files served outside the API's routes, where the
 * route-level limiter does not reach. With several replicas each keeps its
 * own count, so the real limit is this one times the replicas.
 */
export class Limiter {
  readonly #max: number;
  readonly #windowMs: number;
  readonly #seen = new Map<string, { count: number; resetAt: number }>();

  constructor(max: number, windowSeconds: number) {
    this.#max = max;
    this.#windowMs = windowSeconds * 1000;
  }

  /** Counts one more for `key`. False when that is one too many. */
  allow(key: string): boolean {
    const now = Date.now();
    if (this.#seen.size > 50_000) {
      for (const [seen, entry] of this.#seen) if (entry.resetAt <= now) this.#seen.delete(seen);
    }
    const entry = this.#seen.get(key);
    if (!entry || entry.resetAt <= now) {
      this.#seen.set(key, { count: 1, resetAt: now + this.#windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.#max;
  }
}
