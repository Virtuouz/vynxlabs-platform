import { Button } from "@volvel/ui";
import { useState } from "react";
import { ApiError, api } from "../api.ts";
import { ask, notify } from "../ask.tsx";

/** What was done: a draft thrown away, or a draft that removes the resource saved. */
export type RemoveResult = "discarded" | "removed" | "kept";

/** Where the resource stands: a changed draft, a deployed one, one from the repository, or one already drafted for removal. */
export type RemoveState = "draft" | "deployed" | "repository" | "removed";

/** The words a person reads: what it does, said before it is done. */
export function removeWords(state: RemoveState, noun: string, then?: string) {
  const draft = state === "draft";
  if (state === "removed")
    return {
      title: `Keep this ${noun}?`,
      text: `This throws away the draft that removes it. The ${noun} stays as it was last deployed.`,
      action: "Keep",
      button: `Keep this ${noun}`,
    };
  return {
    title: draft ? "Discard this draft?" : `Remove this ${noun}?`,
    text: draft
      ? `The ${noun} goes back to how it was last deployed. One that was never deployed is gone.`
      : `This saves a draft that removes it. Nothing changes until that draft is deployed.${then ? ` ${then}` : ""}`,
    action: draft ? "Discard" : "Remove",
    button: draft ? "Discard draft" : "Remove",
  };
}

/**
 * Removing a resource, or discarding its draft, from where it is shown. It
 * asks first and says what it will do. A draft that was changed goes back to how
 * it was deployed; a deployed resource gets a draft that removes it, which the
 * release screen shows and which can be taken back until it is deployed.
 */
export function RemoveDraftButton({
  root,
  kind,
  path,
  noun,
  state,
  also = [],
  then,
  disabled = false,
  size,
  onDone,
}: {
  root: string;
  kind: string;
  path: string;
  /** What it is called to a person: "script", "flow". */
  noun: string;
  state: RemoveState;
  /** Resources that go with it, removed in the same step. */
  also?: { kind: string; path: string }[];
  /** More that a person should know first, said after the standard text. */
  then?: string;
  disabled?: boolean;
  size?: "small";
  onDone: (result: RemoveResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const words = removeWords(state, noun, then);
  const draft = state === "draft" || state === "removed";
  return (
    <Button
      variant={state === "removed" ? "secondary" : "danger"}
      {...(size ? { size } : {})}
      disabled={disabled || busy}
      onClick={async () => {
        const sure = await ask.confirm({
          title: words.title,
          text: words.text,
          action: words.action,
          danger: state !== "removed",
        });
        if (!sure) return;
        setBusy(true);
        try {
          for (const [at, one] of [{ kind, path }, ...also].entries()) {
            // What goes along may have no draft or no deployed copy to act on: that is not a failure.
            const apart = (error: unknown) => {
              if (at > 0 && error instanceof ApiError && error.status === 404) return;
              throw error;
            };
            if (draft) await api.delete(`${root}/drafts/${one.path}`).catch(apart);
            else
              await api
                .put(`${root}/drafts/${one.path}`, {
                  kind: one.kind,
                  schemaVersion: 1,
                  body: {},
                  deleted: true,
                })
                .catch(apart);
          }
          onDone(state === "removed" ? "kept" : draft ? "discarded" : "removed");
        } catch (error) {
          notify.error(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      {words.button}
    </Button>
  );
}
