export type TimelineSegmentKind = "wait" | "run" | "hold";

export interface TimelineRow {
  id: string;
  label: string;
  /** When the row began, in milliseconds since the epoch. */
  start: number;
  /** When it ended. Leave it out for a row still in progress: it then runs to `now`. */
  end?: number | undefined;
  /**
   * The row cut into parts, each ending at a time. A part left out is not drawn:
   * a row with no parts is all "run".
   */
  segments?: { kind: TimelineSegmentKind; until: number }[];
  tone?: "plain" | "danger" | "muted";
}

export interface TimelineProps {
  rows: readonly TimelineRow[];
  /** The right-hand end for rows in progress, in milliseconds since the epoch. */
  now?: number;
  selected?: string | undefined;
  onSelect?: (id: string) => void;
  /** What each kind of part is called in the legend. */
  legend?: Partial<Record<TimelineSegmentKind, string>>;
}

const FILL: Record<TimelineSegmentKind, string> = {
  wait: "bg-ink-muted/50",
  run: "bg-action",
  hold: "bg-attention",
};

/** A length of time for a person: "400 ms", "13.8 s", "2 m 5 s". */
export function duration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} m ${Math.round((ms % 60_000) / 1000)} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}

/** Things that took time, on one axis: what ran side by side, what waited, and for how long. */
export function Timeline({ rows, now = Date.now(), selected, onSelect, legend }: TimelineProps) {
  if (rows.length === 0) return null;
  const from = Math.min(...rows.map((row) => row.start));
  const to = Math.max(...rows.map((row) => row.end ?? now), from + 1);
  const span = to - from;
  const at = (time: number) => `${(Math.min(Math.max(time - from, 0), span) / span) * 100}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const names = { wait: "Waiting", run: "Running", hold: "On hold", ...legend };
  const used = new Set<TimelineSegmentKind>(
    rows.flatMap((row) => row.segments?.map((segment) => segment.kind) ?? ["run"]),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-ink-muted">
        <span className="flex flex-wrap gap-3">
          {(["wait", "run", "hold"] as const)
            .filter((kind) => used.has(kind))
            .map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={`size-2.5 rounded-[2px] ${FILL[kind]}`} />
                {names[kind]}
              </span>
            ))}
        </span>
        <span className="font-mono text-ink">{duration(span)}</span>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {rows.map((row) => {
          const end = row.end ?? now;
          const parts = row.segments?.length
            ? row.segments
            : [{ kind: "run" as const, until: end }];
          let cursor = row.start;
          const chosen = selected === row.id;
          const bar = (
            <span className="relative block h-5 flex-1">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  aria-hidden="true"
                  className="absolute inset-y-[-4px] w-px bg-line"
                  style={{ left: `${tick * 100}%` }}
                />
              ))}
              {parts.map((part) => {
                const left = cursor;
                cursor = Math.max(cursor, part.until);
                if (part.until <= left) return null;
                return (
                  <span
                    key={`${part.kind}-${part.until}`}
                    className={`absolute inset-y-0 min-w-[3px] first-of-type:rounded-l-[3px] last-of-type:rounded-r-[3px] ${
                      row.tone === "danger" && part.kind === "run" ? "bg-danger" : FILL[part.kind]
                    } ${row.tone === "muted" ? "opacity-50" : ""}`}
                    style={{ left: at(left), width: `calc(${at(part.until)} - ${at(left)})` }}
                  />
                );
              })}
              <span
                className="absolute top-0 pl-1.5 font-mono text-[12px] leading-5 whitespace-nowrap text-ink-muted"
                style={{ left: at(end) }}
              >
                {duration(end - row.start)}
                {row.end === undefined ? "…" : ""}
              </span>
            </span>
          );
          const inner = (
            <>
              <span className="w-40 shrink-0 truncate text-left font-mono text-[12.5px]">
                {row.label}
              </span>
              {bar}
              {/* Room for the duration printed after the longest bar. */}
              <span aria-hidden="true" className="w-16 shrink-0" />
            </>
          );
          const shape = `flex w-full items-center gap-3 rounded-control px-2 py-1.5 ${
            chosen ? "bg-action-soft" : ""
          }`;
          return (
            <li key={row.id}>
              {onSelect ? (
                <button
                  type="button"
                  aria-pressed={chosen}
                  className={`${shape} hover:bg-sunken`}
                  onClick={() => onSelect(row.id)}
                >
                  {inner}
                </button>
              ) : (
                <div className={shape}>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
      <div aria-hidden="true" className="flex gap-3 px-2 text-[11.5px] text-ink-muted">
        <span className="w-40 shrink-0" />
        <span className="relative block h-4 flex-1">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
              style={{ left: `${tick * 100}%` }}
            >
              {duration(span * tick)}
            </span>
          ))}
        </span>
        <span className="w-16 shrink-0" />
      </div>
    </div>
  );
}
