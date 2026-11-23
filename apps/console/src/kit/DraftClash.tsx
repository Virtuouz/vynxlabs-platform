import { Button, Notice } from "@volvel/ui";
import { useState } from "react";
import { ask, copyText, notify } from "../ask.tsx";

/**
 * The page's answer when a save was refused because someone else saved the draft first. It says
 * what happened and what can be done; nothing of theirs was overwritten, and what the person
 * changed is still on the screen. Used by every editor that saves a draft, from `useDraftSave`'s
 * `clashed`.
 */
export function DraftClash({
  what = "draft",
  onTake,
  mine,
}: {
  /** What it is called: "draft", "page". */
  what?: string;
  /** Loads what the other person saved, in place of what is on the screen. */
  onTake: () => Promise<void> | void;
  /** The text on the screen, so it can be copied before it is replaced. */
  mine?: () => string | undefined;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Notice
      tone="danger"
      action={
        <div className="flex flex-wrap gap-2">
          {mine ? (
            <Button
              size="small"
              variant="secondary"
              onClick={() => void copyText(mine() ?? "", "Copied what you wrote.")}
            >
              Copy what I wrote
            </Button>
          ) : null}
          <Button
            size="small"
            loading={busy}
            onClick={async () => {
              const sure = await ask.confirm({
                title: "Load their version?",
                text: `What you changed since you opened the ${what} is replaced by what they saved.${mine ? " Copy it first if you want to keep it." : ""}`,
                action: "Load theirs",
                danger: true,
              });
              if (!sure) return;
              setBusy(true);
              try {
                await onTake();
              } catch (error) {
                notify.error(error);
              } finally {
                setBusy(false);
              }
            }}
          >
            Load their version
          </Button>
        </div>
      }
    >
      Someone else saved this {what} after you opened it. Nothing of theirs was overwritten, and
      what you changed is still here, unsaved.
    </Notice>
  );
}
