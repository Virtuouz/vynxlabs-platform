import { Tooltip } from "@volvel/ui";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { middle } from "./format.ts";

/**
 * A quiet copy control beside an identifier. It says what it copied, and falls
 * back to asking for a manual copy when the browser refuses.
 */
export function CopyIcon({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Tooltip
      label={state === "failed" ? "Select it and copy" : state === "copied" ? "Copied" : label}
    >
      <button
        type="button"
        aria-label={label}
        onClick={async (event) => {
          event.stopPropagation();
          try {
            await navigator.clipboard.writeText(value);
            setState("copied");
          } catch {
            setState("failed");
          }
          setTimeout(() => setState("idle"), 1500);
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control align-middle text-ink-subtle hover:bg-surface hover:text-ink"
      >
        {state === "copied" ? (
          <Check aria-hidden="true" size={14} className="text-success" />
        ) : (
          <Copy aria-hidden="true" size={14} />
        )}
      </button>
    </Tooltip>
  );
}

/**
 * An identifier (07 §7.3): in the code face, cut in its middle to 12
 * characters so that both ends show, the whole of it on hover and in its
 * accessible name, with a copy control.
 */
export function Identifier({
  value,
  label,
  copy = true,
  full = false,
}: {
  value: string;
  /** What the copy control says it copies: "Copy the run ID". */
  label: string;
  copy?: boolean;
  /** Show it whole: where it is the subject of the page and there is room. */
  full?: boolean;
}) {
  const shown = full ? value : middle(value);
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      {shown === value ? (
        <span className="min-w-0 truncate font-mono text-code">{value}</span>
      ) : (
        <Tooltip label={value}>
          <span className="min-w-0 whitespace-nowrap font-mono text-code">
            <span aria-hidden="true">{shown}</span>
            <span className="sr-only">{value}</span>
          </span>
        </Tooltip>
      )}
      {copy ? <CopyIcon value={value} label={label} /> : null}
    </span>
  );
}

/** Quotes a value for a POSIX shell. */
const shell = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * The curl command for an API call, with the key left to the environment so it
 * is never pasted anywhere.
 */
export function curlFor(method: string, path: string, body?: unknown): string {
  const url = path.startsWith("http") ? path : `${location.origin}/api/v1${path}`;
  const lines = [`curl -X ${method} ${shell(url)}`, `  -H "authorization: Bearer $VOLVEL_API_KEY"`];
  if (body !== undefined) {
    lines.push(`  -H "content-type: application/json"`, `  -d ${shell(JSON.stringify(body))}`);
  }
  return lines.join(" \\\n");
}
