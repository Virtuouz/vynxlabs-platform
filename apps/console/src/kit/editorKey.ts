import { useState } from "react";

/**
 * The key for an editor at `at`, an address such as `scripts/new` or
 * `extensions/connector/edit/billing/stripe`.
 *
 * A new address means a new editor, except for one step: a new thing's first
 * save replaces `…new` with `…edit/<path>`. The editor that saved it stays, with
 * its undo history and the run it may have just started.
 */
export function useEditorKey(at: string): string {
  const [seen, setSeen] = useState({ at, key: at });
  if (seen.at === at) return seen.key;
  const next = { at, key: nextEditorKey(seen, at) };
  setSeen(next);
  return next.key;
}

export function nextEditorKey(last: { at: string; key: string }, at: string): string {
  const fresh = /^(.*?)new$/.exec(last.at);
  return fresh && at.startsWith(`${fresh[1]}edit/`) ? last.key : at;
}
