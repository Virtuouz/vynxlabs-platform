import type { FastifyRateLimitOptions, FastifyRateLimitStoreCtor } from "@fastify/rate-limit";
import { sql } from "@volvel/db";
import type { Kernel } from "./kernel.js";

type Result = { current: number; ttl: number };
type Callback = (error: Error | null, result?: Result) => void;

/**
 * Rate limits counted in Postgres, so that every replica of the control plane
 * shares one count per caller. A fixed window: the first hit opens it, and the
 * count starts again once it has passed. One upsert per hit.
 */
export function postgresRateLimitStore(kernel: Kernel): FastifyRateLimitStoreCtor {
  class PostgresStore {
    readonly #prefix: string;

    constructor(_options?: FastifyRateLimitOptions, prefix = "") {
      this.#prefix = prefix;
    }

    incr(key: string, callback: Callback, timeWindow: number): void {
      const window = Math.max(1, Math.trunc(timeWindow));
      sql<{ hits: number; ttl: number }>`
        insert into rate_limit (key, hits, window_ends)
        values (${this.#prefix + key}, 1, now() + ${window} * interval '1 millisecond')
        on conflict (key) do update set
          hits = case when rate_limit.window_ends <= now() then 1 else rate_limit.hits + 1 end,
          window_ends = case when rate_limit.window_ends <= now()
            then excluded.window_ends else rate_limit.window_ends end
        returning hits, greatest(0, ceil(extract(epoch from (window_ends - now())) * 1000))::int as ttl
      `
        .execute(kernel.db)
        .then(({ rows }) => {
          const row = rows[0];
          callback(null, { current: row?.hits ?? 1, ttl: row?.ttl ?? window });
        }, callback);
    }

    read(key: string, callback: Callback): void {
      sql<{ hits: number; ttl: number }>`
        select hits, greatest(0, ceil(extract(epoch from (window_ends - now())) * 1000))::int as ttl
        from rate_limit where key = ${this.#prefix + key} and window_ends > now()
      `
        .execute(kernel.db)
        .then(({ rows }) => {
          const row = rows[0];
          callback(null, row ? { current: row.hits, ttl: row.ttl } : { current: 0, ttl: 0 });
        }, callback);
    }

    /** Each limited route counts on its own, as the in-memory store does. */
    // The plugin passes the route's merged options, with the route itself as `routeInfo`.
    child(options: unknown) {
      const routeOptions = options as { routeInfo?: { method?: string | string[]; url?: string } };
      const method = routeOptions.routeInfo?.method;
      const route = `${Array.isArray(method) ? method.join(",") : (method ?? "")}${routeOptions.routeInfo?.url ?? ""}`;
      return new PostgresStore(undefined, `${this.#prefix}${route}-`);
    }
  }
  return PostgresStore as unknown as FastifyRateLimitStoreCtor;
}

/** Removes counters whose window has passed. Run now and then; a stale row is harmless. */
export async function pruneRateLimits(kernel: Kernel): Promise<number> {
  const result = await kernel.db
    .deleteFrom("rate_limit")
    .where("window_ends", "<", sql<Date>`now() - interval '1 minute'`)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}
