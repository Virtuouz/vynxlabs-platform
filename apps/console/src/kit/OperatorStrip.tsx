import { Button, Menu } from "@vynxlabs/ui";
import { ShieldAlert } from "lucide-react";
import { useSyncExternalStore } from "react";
import { usePreference } from "../prefs.ts";
import { ago } from "./format.ts";
import { Time } from "./Time.tsx";
import { Truncate } from "./Truncate.tsx";

/**
 * An operator's access to a tenant, said on every screen while it lasts
 * (phase 16, P4-1). A one-line strip under the shell's header names the role,
 * when it ends and why, with a way to end it. It may be hidden; then an
 * "Operator" mark stays in the header, from which the strip comes back and
 * access ends. A new grant shows the strip again.
 */

export interface OperatorGrant {
  id: string;
  roleName: string;
  expiresAt: string;
  reason: string;
}

interface Current {
  grant: OperatorGrant;
  end: () => Promise<void>;
}

let current: Current | null = null;
const listeners = new Set<() => void>();

/** Called by the tenant's screen with the operator's live grant, and with null when it goes. */
export function setOperatorAccess(next: Current | null) {
  if (current?.grant.id === next?.grant.id && current?.end === next?.end) return;
  current = next;
  for (const listener of listeners) listener();
}

function useOperatorAccess(): Current | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}

/** Which grant's strip the member hid. */
function useHidden(): [string | undefined, (grantId: string | undefined) => void] {
  const [value, setValue] = usePreference<{ hidden?: string } | undefined>(
    "operator.strip",
    undefined,
  );
  return [value?.hidden, (grantId) => setValue(grantId ? { hidden: grantId } : undefined)];
}

/** The strip, under the shell's header. Nothing while there is no grant, or it is hidden. */
export function OperatorStrip() {
  const access = useOperatorAccess();
  const [hidden, setHidden] = useHidden();
  if (!access || hidden === access.grant.id) return null;
  const { grant, end } = access;
  return (
    <section
      aria-label="Operator access"
      className="flex min-h-8 shrink-0 items-center gap-2 border-attention/40 border-b bg-attention-soft px-3 text-meta md:px-4"
    >
      <ShieldAlert aria-hidden="true" size={14} className="shrink-0 text-attention" />
      <span className="min-w-0 truncate">
        <strong>Operator access</strong> as {grant.roleName} until <Time value={grant.expiresAt} />
      </span>
      <span className="hidden min-w-0 flex-1 text-ink-muted sm:flex">
        <span className="shrink-0">·&nbsp;</span>
        <Truncate>{`${grant.reason}. Everything you do here is recorded for the tenant.`}</Truncate>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Button size="small" variant="quiet" onClick={() => void end()}>
          End now
        </Button>
        <Button size="small" variant="quiet" onClick={() => setHidden(grant.id)}>
          Hide
        </Button>
      </span>
    </section>
  );
}

/** The mark in the header while the strip is hidden: it brings the strip back, or ends access. */
export function OperatorMark() {
  const access = useOperatorAccess();
  const [hidden, setHidden] = useHidden();
  if (!access || hidden !== access.grant.id) return null;
  const { grant, end } = access;
  return (
    <Menu
      ariaLabel={`Operator access as ${grant.roleName}, ends ${ago(grant.expiresAt)}`}
      align="end"
      triggerClassName="flex h-7 items-center gap-1.5 rounded-control border border-attention/45 bg-attention-soft px-2 text-meta text-ink hover:brightness-95"
      label={
        <>
          <ShieldAlert aria-hidden="true" size={14} className="text-attention" />
          <span className="hidden sm:inline">Operator</span>
          <span className="hidden text-ink-muted md:inline">· ends {ago(grant.expiresAt)}</span>
        </>
      }
      items={[
        { label: "Show the notice", onSelect: () => setHidden(undefined) },
        { label: "End access now", danger: true, onSelect: () => void end() },
      ]}
    />
  );
}
