import { Button } from "@vynxlabs/ui";
import { useEffect } from "react";
import { useNavigationGuard } from "../router.tsx";
import { useShortcut } from "./keys.ts";

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
  if (!dirty) return null;
  return (
    <section
      aria-label="Unsaved changes"
      className="sticky bottom-0 layer-sticky -mx-4 mt-2 flex flex-wrap items-center justify-between gap-3 border-line border-t bg-raised px-4 py-3 shadow-overlay md:-mx-6 md:px-6"
    >
      <span className="text-body-sm">
        <span className="font-medium">Unsaved changes</span>
        <span className="text-ink-muted"> to {what}.</span>
      </span>
      <span className="flex items-center gap-2">
        <Button disabled={saving} onClick={onDiscard}>
          Discard
        </Button>
        <Button variant="primary" loading={saving} onClick={onSave}>
          Save
        </Button>
      </span>
    </section>
  );
}
