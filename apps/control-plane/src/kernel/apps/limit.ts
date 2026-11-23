import type { Db } from "../audit.js";
import { countHit } from "../ratelimit.js";

/**
 * A limit on how often one caller may do one thing, for pages, forms and sign-in redirects
 * served outside the API's routes, where the route-level limiter does not reach. It is counted
 * in the `rate_limit` table beside the routes' own, so every replica shares one count and a
 * restart does not clear it. `name` keeps one limit's counts from another's.
 */
export class Limiter {
  readonly #db: Db;
  readonly #name: string;
  readonly #max: number;
  readonly #windowMs: number;

  constructor(db: Db, name: string, max: number, windowSeconds: number) {
    this.#db = db;
    this.#name = name;
    this.#max = max;
    this.#windowMs = windowSeconds * 1000;
  }

  /** Counts one more for `key`. False when that is one too many. */
  async allow(key: string): Promise<boolean> {
    try {
      const { hits } = await countHit(this.#db, `front:${this.#name}:${key}`, this.#windowMs);
      return hits <= this.#max;
    } catch {
      // A database that cannot count cannot serve the page either: the request fails by itself.
      return true;
    }
  }
}

/**
 * The same limit kept in this process, for what costs nothing to serve: a file named in a
 * bundle by its hash, an icon, a font. Counting each of them in the database would make a
 * page's every image a write. With several replicas each keeps its own count.
 */
export class MemoryLimiter {
  readonly #max: number;
  readonly #windowMs: number;
  readonly #seen = new Map<string, { count: number; resetAt: number }>();

  constructor(max: number, windowSeconds: number) {
    this.#max = max;
    this.#windowMs = windowSeconds * 1000;
  }

  async allow(key: string): Promise<boolean> {
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

/** Whether a path asks for a file that is only sent (a script, a picture, a font), not a page. */
export function isStaticFile(file: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(file) && !/\.html?$/i.test(file);
}
