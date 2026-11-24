import { Button, ComboboxField, Dialog, Notice } from "@volvel/ui";
import { useState } from "react";
import { ApiError, api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { InputForm } from "../InputDialog.tsx";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { Code } from "../kit/status.tsx";

interface DeclaredEvent {
  path: string;
  body: { description?: string; payload?: Record<string, unknown> };
}

/**
 * The server names a payload's faults by `/payload/...`; the form draws its fields from
 * `/input/...`. Said on the field they belong to.
 */
const asInputFault = (error: unknown): unknown => {
  if (!(error instanceof ApiError)) return error;
  const fields = error.fields.map((one) => ({
    ...one,
    path: one.path.replace(/^\/payload/, "/input"),
  }));
  return Object.assign(error, { fields });
};

/**
 * Publishes an event by hand, to try what listens for it: the event is chosen (or already is),
 * its payload is asked for as fields drawn from the event's schema, and in production the
 * person is asked to confirm first, because real triggers start real work. The platform's own
 * events are not offered: only the platform publishes those.
 */
export function PublishEventDialog({
  root,
  production,
  event,
  open,
  onClose,
  onPublished,
}: {
  root: string;
  production: boolean;
  /** The event to publish, when the page is its own. */
  event?: string;
  open: boolean;
  onClose: () => void;
  onPublished?: () => void;
}) {
  const declared = useLoad<{ items: DeclaredEvent[] }>(
    open ? `${root}/resources?kind=event` : null,
  );
  const [chosen, setChosen] = useState<string | undefined>(event);
  const picked = event ?? chosen;
  const one = declared.data?.items.find((item) => item.path === picked);
  const schema = one?.body.payload;

  const send = async (payload: unknown) => {
    if (production) {
      const sure = await ask.confirm({
        title: `Publish ${picked} in production?`,
        text: "Every trigger that listens for it starts its work now, with real data.",
        action: "Publish in production",
        cancel: "Do not publish",
        danger: true,
      });
      if (!sure) return;
    }
    try {
      const made = await api.post<{ id: string; started: number }>(`${root}/events`, {
        name: picked,
        payload,
      });
      notify.success(
        made.started === 0
          ? "Published. Nothing listens for it, so it started nothing."
          : `Published. It started ${made.started} run${made.started === 1 ? "" : "s"}.`,
      );
      onClose();
      onPublished?.();
    } catch (error) {
      throw asInputFault(error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={event ? `Publish ${event}` : "Publish an event"}>
      {open ? (
        <div className="flex flex-col gap-3">
          {declared.loading && !declared.data ? <Loading /> : null}
          {declared.error ? <ErrorState error={declared.error} onRetry={declared.reload} /> : null}
          {declared.data && !event ? (
            declared.data.items.length === 0 ? (
              <Notice tone="plain">
                No event is declared in this workspace yet. Declare one in an{" "}
                <Code>{"<path>.event.yaml"}</Code> file (or with defineEvent in code), or under
                Resources, and it can be published here.
              </Notice>
            ) : (
              <ComboboxField
                label="Event"
                options={declared.data.items.map((item) => ({
                  value: item.path,
                  label: item.path,
                  ...(item.body.description ? { hint: item.body.description } : {}),
                }))}
                value={chosen}
                onChange={setChosen}
              />
            )
          ) : null}
          {declared.data && event && !one ? (
            <Notice tone="attention">
              {event} is not declared in this workspace, so there is no payload to ask for.
            </Notice>
          ) : null}
          {one ? (
            <>
              {production ? (
                <Notice tone="attention">
                  This is production. Publishing starts what listens for the event, with the payload
                  given here.
                </Notice>
              ) : null}
              <InputForm
                key={one.path}
                schema={schema}
                action="Publish"
                onCancel={onClose}
                onSubmit={send}
              />
            </>
          ) : declared.data && declared.data.items.length > 0 && !event ? (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/** The button that opens the dialog, for a screen that offers it. */
export function PublishEventButton({
  root,
  production,
  event,
  label = "Publish an event",
  onPublished,
}: {
  root: string;
  production: boolean;
  event?: string;
  label?: string;
  onPublished?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <PublishEventDialog
        root={root}
        production={production}
        {...(event ? { event } : {})}
        open={open}
        onClose={() => setOpen(false)}
        {...(onPublished ? { onPublished } : {})}
      />
    </>
  );
}
