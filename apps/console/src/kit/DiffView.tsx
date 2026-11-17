import { useMemo } from "react";
import { folded, lineDiff, sortedJson } from "./diff.ts";

/**
 * Two versions of a text, or of a value, line by line: what was removed in
 * red with −, what was added in green with +, and long runs of what stayed
 * folded to a count (08 §3.21). The one diff the console draws, for drift
 * between workspaces, a source between versions, and inputs between runs.
 */
export function DiffView({
  before,
  after,
  beforeLabel,
  afterLabel,
  testId,
  maxHeight = "60vh",
}: {
  /** Text, or any value, which is compared as sorted JSON. */
  before: unknown;
  after: unknown;
  /** What each side is: "Production", "v3, the last success". */
  beforeLabel: string;
  afterLabel: string;
  testId?: string;
  maxHeight?: string;
}) {
  const lines = useMemo(() => {
    const asLines = (value: unknown) =>
      typeof value === "string" ? value.split("\n") : sortedJson(value);
    return folded(lineDiff(asLines(before), asLines(after)));
  }, [before, after]);
  const same = lines.every((line) => line.type === "same" || line.type === "fold");
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 flex flex-wrap gap-3 text-meta">
        <span className="text-danger">− {beforeLabel}</span>
        <span className="text-success">+ {afterLabel}</span>
      </p>
      {same ? (
        <p className="m-0 text-meta text-ink-muted">No difference.</p>
      ) : (
        <pre
          data-testid={testId}
          style={{ maxHeight }}
          className="m-0 overflow-auto rounded-control border border-line bg-sunken p-3 font-mono text-code-sm leading-5"
        >
          {lines.map((line, index) =>
            line.type === "fold" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity but their place
              <div key={index} className="text-ink-subtle">
                {`  ⋯ ${line.count} unchanged line${line.count === 1 ? "" : "s"}`}
              </div>
            ) : (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity but their place
                key={index}
                className={
                  line.type === "added"
                    ? "bg-success/10 text-success"
                    : line.type === "removed"
                      ? "bg-danger/10 text-danger"
                      : "text-ink-muted"
                }
              >
                {`${line.type === "added" ? "+" : line.type === "removed" ? "−" : " "} ${line.text}`}
              </div>
            ),
          )}
        </pre>
      )}
    </div>
  );
}
