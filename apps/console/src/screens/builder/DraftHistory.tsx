import type { InterfaceBody } from "@volvel/manifest";
import { Button, Dialog } from "@volvel/ui";
import { useState } from "react";
import { useLoad } from "../../api.ts";
import { ago } from "../../kit/format.ts";
import { draftChanges } from "./changes.ts";

interface Kept {
  id: string;
  revision: number;
  deleted: boolean;
  /** `replaced`: a save put this version aside; `set_aside`: the draft was discarded. */
  reason: string;
  savedById: string | null;
  savedAt: string;
  body: InterfaceBody;
}

/**
 * "Restore an earlier draft": the versions each save put aside (the control plane keeps the
 * newest thirty), newest first, who saved each and when, with a preview of what restoring it
 * would change. Restoring makes it the current draft as one step, which Undo takes back.
 */
export function DraftHistory({
  open,
  onClose,
  root,
  path,
  current,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  root: string;
  /** The interface's path. */
  path: string;
  /** The draft as it is now. */
  current: InterfaceBody;
  onRestore: (body: InterfaceBody, savedAt: string) => void;
}) {
  const [base = ""] = root.split("/workspaces/");
  const history = useLoad<{ items: Kept[] }>(open ? `${root}/draft-history/${path}` : null);
  const members = useLoad<{ items: { id: string; name: string }[] }>(
    open ? `${base}/members?limit=200` : null,
  );
  const [chosen, setChosen] = useState<string>();
  const items = (history.data?.items ?? []).filter((one) => !one.deleted && one.body?.pages);
  const picked = items.find((one) => one.id === chosen) ?? items[0];
  const who = (id: string | null) =>
    id ? (members.data?.items.find((one) => one.id === id)?.name ?? "Someone") : "The system";
  const changes = picked ? draftChanges(current, picked.body) : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title="Restore an earlier draft"
      description="Each save keeps what it replaced. Restoring one makes it the draft; Undo takes it back."
    >
      {history.error ? (
        <p className="m-0 text-danger">{history.error.message}</p>
      ) : !history.data ? (
        <p role="status" className="m-0 text-ink-muted">
          Reading the earlier drafts…
        </p>
      ) : items.length === 0 ? (
        <p className="m-0 text-ink-muted">
          No earlier drafts yet. Each change you save keeps the draft it replaced.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ul
            aria-label="Earlier drafts"
            className="m-0 flex max-h-96 list-none flex-col gap-1 overflow-y-auto p-0"
          >
            {items.map((one) => (
              <li key={one.id}>
                <button
                  type="button"
                  aria-pressed={one.id === picked?.id}
                  onClick={() => setChosen(one.id)}
                  className={`flex w-full cursor-pointer flex-col items-start rounded-control border px-3 py-2 text-left ${
                    one.id === picked?.id
                      ? "border-action bg-action-soft"
                      : "border-line bg-surface hover:bg-sunken"
                  }`}
                >
                  <span className="text-body-sm font-medium text-ink">
                    {ago(one.savedAt)}
                    {one.reason === "set_aside" ? " · set aside" : ""}
                  </span>
                  <span className="text-meta text-ink-muted">
                    Saved by {who(one.savedById)} · {one.body.pages.length}{" "}
                    {one.body.pages.length === 1 ? "page" : "pages"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {picked ? (
            <section aria-label="Preview" className="flex min-w-0 flex-col gap-3">
              <h3 className="m-0 text-title">{picked.body.title}</h3>
              <p className="m-0 text-body-sm text-ink-muted">
                Pages:{" "}
                {picked.body.pages
                  .map((page) => `${page.title} (${page.widgets.length})`)
                  .join(", ")}
              </p>
              <div className="flex flex-col gap-1">
                <span className="text-label text-ink-subtle uppercase">
                  Restoring it changes the draft
                </span>
                {changes.length === 0 ? (
                  <p className="m-0 text-body-sm text-ink-muted">
                    It is the same as the draft now.
                  </p>
                ) : (
                  <ul className="m-0 flex max-h-48 list-none flex-col gap-1 overflow-y-auto p-0 text-body-sm">
                    {changes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={onClose}>Not now</Button>
                <Button
                  variant="primary"
                  disabled={changes.length === 0}
                  onClick={() => onRestore(picked.body, picked.savedAt)}
                >
                  Restore
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
