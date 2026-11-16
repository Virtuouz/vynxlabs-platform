import type { ApiError } from "../api.ts";

const WAITS = [1500, 3000, 6000, 12_000, 30_000];

/** How long to wait before the next try, after this many failures in a row: 1.5 s, doubling, to 30 s. */
export const retryAfter = (failures: number): number =>
  WAITS[Math.min(Math.max(failures, 1), WAITS.length) - 1] as number;

/**
 * Whether trying the same read again may help: a lost connection or a server
 * error may pass. A refusal, such as not found or not allowed, will not.
 */
export function mayPass(error: unknown): boolean {
  const status = (error as Partial<ApiError>).status;
  return status === undefined || status >= 500 || status === 408 || status === 429;
}
