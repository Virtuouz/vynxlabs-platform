import { ago } from "./format.ts";
import { StatePill } from "./status.tsx";

/** What a test of a connection or a data source found, kept with the row. */
export interface Health {
  ok: boolean;
  problem: string | null;
  latencyMs: number | null;
  checkedAt: string;
}

/**
 * What the last test found, and how long ago: a "Reached" from weeks back must not read as
 * current. A failure's whole reason is written out under it, for touch and keyboard as well as
 * for a pointer. Connections and data sources both draw their health with this.
 */
export function HealthCell({ health }: { health: Health | null | undefined }) {
  if (!health) return <StatePill state="queued">Not tested</StatePill>;
  const age = `tested ${ago(health.checkedAt)}`;
  return (
    <span data-health="" className="flex min-w-0 max-w-[18rem] flex-col gap-0.5">
      {health.ok ? (
        <StatePill
          state="ok"
          detail={[health.latencyMs !== null ? `${health.latencyMs} ms` : null, age]
            .filter(Boolean)
            .join(" · ")}
        >
          Reached
        </StatePill>
      ) : (
        <>
          <StatePill state="failed" detail={age}>
            Failed
          </StatePill>
          <span className="break-words text-meta text-ink-muted">
            {health.problem ?? "It was not reached."}
          </span>
        </>
      )}
    </span>
  );
}
