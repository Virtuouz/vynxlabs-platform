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
