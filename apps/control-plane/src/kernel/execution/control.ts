import type { Db, Trx } from "../audit.js";
import type { Kernel } from "../kernel.js";

/** How long the instance's own switches are trusted before they are read again. */
const CONTROL_CACHE_MS = 2000;

const cached = new WeakMap<Kernel, { paused: boolean; at: number }>();

/**
 * Whether every trigger in the instance is paused: by `TRIGGERS_PAUSED`, or by an
 * operator from the console. Read at most every two seconds, as it is asked on
 * every schedule tick, webhook and event.
 */
export async function instanceTriggersPaused(
  kernel: Kernel,
  /** Inside a transaction, that transaction: it already holds a connection, and must not wait for another. */
  db: Db | Trx = kernel.db,
): Promise<boolean> {
  if (kernel.config.limits.triggersPaused) return true;
  const known = cached.get(kernel);
  if (known && Date.now() - known.at < CONTROL_CACHE_MS) return known.paused;
  const row = await db.selectFrom("instance_control").select("triggers_paused").executeTakeFirst();
  const paused = row?.triggers_paused ?? false;
  cached.set(kernel, { paused, at: Date.now() });
  return paused;
}

/** Forgets the switches read, after an operator changed them. */
export function forgetInstanceControl(kernel: Kernel): void {
  cached.delete(kernel);
}
