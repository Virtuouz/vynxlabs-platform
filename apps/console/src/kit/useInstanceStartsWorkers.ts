import { useLoad } from "../api.ts";

/** What `/managed-workers` answers for a tenant, in the states where the instance starts workers. */
const STARTS = new Set(["host", "isolated", "shared"]);

/**
 * Whether the instance really starts workers for a tenant: the tenant's switch is on and the
 * instance does start them. `undefined` while that is being read. When the viewer may not read the
 * state (no worker:read), the switch alone is all there is to go on. One answer for every screen
 * that says "the instance starts workers" (GOV-23).
 */
export function useInstanceStartsWorkers(
  tenantRoot: string,
  switchOn: boolean | undefined,
): boolean | undefined {
  const state = useLoad<{ state?: string }>(switchOn ? `${tenantRoot}/managed-workers` : null);
  if (switchOn === undefined) return undefined;
  if (!switchOn) return false;
  if (state.data) return STARTS.has(state.data.state ?? "");
  if (state.error) return true;
  return undefined;
}
