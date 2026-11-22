import type { InterfaceBody } from "@volvel/manifest";
import { Button, Dialog } from "@volvel/ui";
import { useRef, useState } from "react";
import { useLoad } from "../../api.ts";
import { ago, day, hm } from "../../kit/format.ts";
import { draftChanges, savedWords } from "./changes.ts";

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

/** When a save was made: the clock time when it is under a day ago, else the date and the time. */
function when(value: string): string {
  if (Date.now() - new Date(value).getTime() < 86_400_000) return `${hm(value)} (${ago(value)})`;
  return `${day(value)} ${hm(value)}`;
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
  const changes = picked ? draftChanges(current, picked.body, true) : [];
  /** What each save did: the version it put aside against what came after it (the newest, against the draft now). */
  const did = (at: number) =>
    savedWords(items[at]?.body ?? current, at === 0 ? current : (items[at - 1]?.body ?? current));
  // The list is one stop for the keyboard: the arrows move in it, and choose as they go.
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const walk = (event: React.KeyboardEvent, at: number) => {
    const to =
      event.key === "ArrowDown"
        ? Math.min(items.length - 1, at + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, at - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : undefined;
    if (to === undefined) return;
    event.preventDefault();
    const next = items[to];
    if (next) setChosen(next.id);
    rows.current[to]?.focus();
  };

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
            aria-label="Earlier drafts, newest first"
            className="m-0 flex max-h-96 list-none flex-col gap-1 overflow-y-auto p-0"
          >
            {items.map((one, at) => (
              <li key={one.id}>
                <button
                  type="button"
                  ref={(node) => {
                    rows.current[at] = node;
                  }}
                  aria-pressed={one.id === picked?.id}
                  tabIndex={one.id === picked?.id ? 0 : -1}
                  onKeyDown={(event) => walk(event, at)}
                  onClick={() => setChosen(one.id)}
                  className={`flex w-full cursor-pointer flex-col items-start rounded-control border px-3 py-2 text-left ${
                    one.id === picked?.id
                      ? "border-action bg-action-soft"
                      : "border-line bg-surface hover:bg-sunken"
                  }`}
                >
                  <span className="text-body-sm font-medium text-ink">
                    {when(one.savedAt)}
                    {one.reason === "set_aside" ? " · set aside" : ""}
                    <span className="font-normal text-ink-muted"> · {who(one.savedById)}</span>
                  </span>
                  <span className="text-meta text-ink-muted">
                    {one.reason === "set_aside" ? "The draft was set aside" : did(at)}
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
              {/* Restore comes right after the list for the keyboard; "Not now" is drawn before it. */}
              <div className="flex flex-row-reverse justify-start gap-2">
                <Button
                  variant="primary"
                  disabled={changes.length === 0}
                  onClick={() => onRestore(picked.body, picked.savedAt)}
                >
                  Restore
                </Button>
                <Button onClick={onClose}>Not now</Button>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
