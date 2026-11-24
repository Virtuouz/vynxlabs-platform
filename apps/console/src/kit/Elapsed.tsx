import { duration } from "@volvel/ui";
import { useEffect, useState } from "react";

/** Now, again every second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * How long something has taken: counting each second while it goes, fixed once
 * it ends. A moving number answers "is it stuck, or just slow?".
 */
export function Elapsed({
  from,
  to,
  className = "",
}: {
  from: string | null | undefined;
  /** When it ended. Without it, it is still going. */
  to?: string | null | undefined;
  className?: string;
}) {
  const going = Boolean(from) && !to;
  const now = useNow(going);
  if (!from) return <span className={className}>—</span>;
  const ms = Math.max(0, (to ? Date.parse(to) : now) - Date.parse(from));
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {duration(ms)}
      {going ? <span className="sr-only"> so far</span> : null}
    </span>
  );
}

/** The time a run waited for a worker and the time it ran, from its timestamps. */
export function waitedAndRan(
  run: {
    createdAt: string;
    scheduledFor?: string | null | undefined;
    startedAt: string | null;
    finishedAt: string | null;
  },
  now = Date.now(),
): { waited: number | null; ran: number | null } {
  const due = Date.parse(run.scheduledFor ?? run.createdAt);
  const started = run.startedAt ? Date.parse(run.startedAt) : null;
  const ended = run.finishedAt ? Date.parse(run.finishedAt) : null;
  return {
    waited:
      started !== null
        ? Math.max(0, started - due)
        : ended === null
          ? // A run held for its time has waited for nothing yet: the page says when it starts.
            due > now
            ? null
            : now - due
          : null,
    ran: started !== null ? Math.max(0, (ended ?? now) - started) : null,
  };
}

/** "waited 2.1 s · ran 3.0 s", ticking while the run goes. */
export function WaitedAndRan({ run }: { run: Parameters<typeof waitedAndRan>[0] }) {
  const now = useNow(!run.finishedAt);
  const { waited, ran } = waitedAndRan(run, now);
  const parts = [
    waited !== null ? `waited ${duration(waited)}` : null,
    ran !== null ? `ran ${duration(ran)}` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span className="font-mono text-code tabular-nums text-ink-muted">{parts.join(" · ")}</span>
  );
}
