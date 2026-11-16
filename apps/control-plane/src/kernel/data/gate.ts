import { busy } from "../errors.js";

/** How long a row request waits for its tenant's turn before it is told to try again. */
export const GATE_WAIT_MS = 5_000;

/**
 * How many row requests each tenant may have open at once on a shared pool. Past
 * it, a tenant's requests wait their turn, first come first served, and after a
 * few seconds are told the database is busy. One tenant's slow searches then hold
 * at most its share of the connections, and the others' requests go on. Per replica.
 */
export class TenantGate {
  readonly #limit: number;
  readonly #waitMs: number;
  readonly #open = new Map<string, number>();
  readonly #waiting = new Map<string, (() => void)[]>();

  constructor(limit: number, waitMs = GATE_WAIT_MS) {
    this.#limit = Math.max(1, limit);
    this.#waitMs = waitMs;
  }

  get limit(): number {
    return this.#limit;
  }

  /** Requests open for a tenant now. */
  open(tenantId: string): number {
    return this.#open.get(tenantId) ?? 0;
  }

  /** Runs `work` once the tenant has a free turn. */
  async run<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
    await this.#enter(tenantId);
    try {
      return await work();
    } finally {
      this.#leave(tenantId);
    }
  }

  async #enter(tenantId: string): Promise<void> {
    const open = this.#open.get(tenantId) ?? 0;
    if (open < this.#limit) {
      this.#open.set(tenantId, open + 1);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const queue = this.#waiting.get(tenantId) ?? [];
      this.#waiting.set(tenantId, queue);
      const timer = setTimeout(() => {
        const at = queue.indexOf(admit);
        if (at !== -1) queue.splice(at, 1);
        if (queue.length === 0) this.#waiting.delete(tenantId);
        reject(busy());
      }, this.#waitMs);
      // Handed its turn by a request that finished: the count passes to it unchanged.
      const admit = () => {
        clearTimeout(timer);
        resolve();
      };
      queue.push(admit);
    });
  }

  #leave(tenantId: string): void {
    const queue = this.#waiting.get(tenantId);
    const next = queue?.shift();
    if (queue && queue.length === 0) this.#waiting.delete(tenantId);
    if (next) {
      next();
      return;
    }
    const open = (this.#open.get(tenantId) ?? 1) - 1;
    if (open <= 0) this.#open.delete(tenantId);
    else this.#open.set(tenantId, open);
  }
}
