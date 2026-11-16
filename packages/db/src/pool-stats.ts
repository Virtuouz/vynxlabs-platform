import type pg from "pg";

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
}

export function statsOf(pool: pg.Pool): PoolStats {
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
}

/**
 * Whether an error is a pool's wait for a connection running out: the database is
 * busy, not broken, and the request can be tried again shortly.
 */
export function isPoolTimeout(error: unknown): boolean {
  const message = (error as { message?: unknown })?.message;
  return (
    typeof message === "string" &&
    (message.includes("timeout exceeded when trying to connect") ||
      message.includes("Connection terminated due to connection timeout"))
  );
}
