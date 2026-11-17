import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * A quiet copy control beside an identifier. It says what it copied, and falls
 * back to asking for a manual copy when the browser refuses.
 */
export function CopyIcon({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      aria-label={label}
      title={state === "failed" ? "Select it and copy" : state === "copied" ? "Copied" : label}
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
  );
}

/** An identifier in mono type with its copy control. */
export function CopyableId({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <span className="min-w-0 truncate font-mono text-code" title={value}>
        {value}
      </span>
      <CopyIcon value={value} label={label} />
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
  const lines = [
    `curl -X ${method} ${shell(url)}`,
    `  -H "authorization: Bearer $PLATFORM_API_KEY"`,
  ];
  if (body !== undefined) {
    lines.push(`  -H "content-type: application/json"`, `  -d ${shell(JSON.stringify(body))}`);
  }
  return lines.join(" \\\n");
}
