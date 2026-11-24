import { Button } from "@volvel/ui";
import { useEffect, useRef } from "react";
import { useNavigationGuard } from "../router.tsx";
import { useShortcut } from "./keys.ts";
import { READ_ONLY_WORDS, useReadOnly } from "./ReadOnly.tsx";

/**
 * How a page of settings is saved (08 §3.32): changes are made, then saved
 * together, from a bar that appears at the foot of the page as soon as
 * something differs. Leaving asks first while it does. ⌘S or Ctrl+S saves.
 *
 * A page has one way of saving. Settings use this bar; editors save by
 * themselves and say "Saved" where they are.
 */
export function SaveBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  what = "these settings",
  guard = true,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** What is unsaved, for the question asked before leaving. */
  what?: string;
  /** Asks before leaving, and saves with ⌘S. Off only where the bar is shown as an example. */
  guard?: boolean;
}) {
  useNavigationGuard(dirty && guard, `Your changes to ${what} are not saved.`);
  useShortcut(
    "save",
    () => {
      if (!saving) onSave();
    },
    { enabled: dirty && guard },
  );
  const readOnly = useReadOnly();
  const bar = useRef<HTMLElement>(null);
  // Where the person was before the bar took the focus; the bar leaves when it is used, and the
  // focus goes back there rather than to the page.
  const before = useRef<HTMLElement | null>(null);
  const leaving = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const note = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && !bar.current?.contains(target)) before.current = target;
    };
    document.addEventListener("focusin", note);
    return () => document.removeEventListener("focusin", note);
  }, [dirty]);
  useEffect(() => {
    const back = leaving.current;
    if (dirty || !back) return;
    leaving.current = null;
    if (back.isConnected) back.focus();
  }, [dirty]);
  const use = (action: () => void) => () => {
    const home = before.current?.isConnected
      ? before.current
      : (bar.current?.parentElement?.querySelector<HTMLElement>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
        ) ?? null);
    leaving.current = home;
    action();
  };
  if (!dirty) return null;
  return (
    <section
      ref={bar}
      aria-label="Unsaved changes"
      className="sticky bottom-0 layer-sticky -mx-4 mb-[calc(var(--page-pad-b,0px)*-1)] mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-line border-t bg-raised px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:py-3 shadow-overlay md:-mx-6 md:px-6"
    >
      <span className="text-body-sm">
        <span className="font-medium">Unsaved changes</span>
        <span className="text-ink-muted"> to {what}.</span>
      </span>
      <span className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-end">
        {readOnly ? (
          <span className="text-meta text-ink-muted">
            It cannot be saved now: the instance takes no changes.
          </span>
        ) : null}
        <Button disabled={saving} onClick={use(onDiscard)}>
          Discard
        </Button>
        <Button
          variant="primary"
          loading={saving}
          disabled={readOnly}
          {...(readOnly ? { tooltip: READ_ONLY_WORDS } : {})}
          onClick={use(onSave)}
        >
          Save
        </Button>
      </span>
    </section>
  );
}
