import type { Page, PageWidget } from "@volvel/manifest";
// The action model by its own entry: nothing that compiles a validator, which a served app's
// content security policy (no eval) would refuse.
import {
  type ActingUser,
  type Action,
  type AskedField,
  type Condition,
  conditionsHold,
  type Step,
} from "@volvel/manifest/action";
import {
  Button,
  Closing,
  Dialog,
  Notice,
  SchemaForm,
  SideSheet,
  Skeleton,
  useToast,
} from "@volvel/ui";
import type { ActOutcome, EventPayload } from "@volvel/widgets";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  ActionError,
  type FilterValues,
  type PageDataClient,
  type ViewRegistry,
  type WireData,
} from "./types.ts";
import { toWidgetData } from "./wire.ts";

/** Where a page may be taken to by an action, as the host is asked. */
export type NavigateTo =
  | {
      page: string;
      record?: string;
      as: "page" | "sheet" | "modal";
      /** For a sheet opened from a list of rows: the ids of that list, in order, so the sheet can step through it. */
      among?: readonly string[];
    }
  | { close: true };

type Row = Readonly<Record<string, unknown>>;

/** The action a widget holds at a place: `on/<event>`, `config/<property>`, or `config/<property>/<index>/action`. */
export function actionAt(widget: PageWidget, at: string): Action | undefined {
  const parts = at.split("/");
  if (parts[0] === "on" && parts.length === 2) return widget.on?.[parts[1] as string];
  if (parts[0] !== "config") return undefined;
  const property = widget.config?.[parts[1] as string];
  if (parts.length === 2) return isAction(property) ? property : undefined;
  if (parts.length === 4 && parts[3] === "action" && Array.isArray(property)) {
    const item = property[Number(parts[2])] as { action?: unknown } | undefined;
    return isAction(item?.action) ? item.action : undefined;
  }
  return undefined;
}

const isAction = (value: unknown): value is Action =>
  typeof value === "object" && value !== null && Array.isArray((value as Action).steps);

/**
 * Whether conditions hold, as far as the browser can know. A record that has not been
 * read (`undefined`) is not known: what is asked of it is left to the server, whose
 * answer is the one that counts. `null` is a record known not to be there.
 */
export function holds(
  conditions: readonly Condition[] | undefined,
  records: { this?: Row | null | undefined; event?: Row | null | undefined },
  user: ActingUser | undefined,
): boolean {
  const known = (conditions ?? []).filter(
    (one) => "user" in one || records[one.of ?? "this"] !== undefined,
  );
  return conditionsHold(known, { this: records.this ?? null, event: records.event ?? null }, user);
}

/** A confirmation's text, with `{column}` filled from the record it is about. */
export function fillText(text: string, row: Row | undefined, label: (column: string) => string) {
  return text.replace(/\{([a-z][a-z0-9_]*)\}/g, (_all, column: string) => {
    const value = row?.[column];
    if (value === undefined || value === null || value === "") return row ? "" : "this record";
    return label(String(value));
  });
}

/** What asked fields are, as a form's schema: typed, with the ones that must be given listed. */
export function askedSchema(ask: readonly AskedField[]) {
  const properties: Record<string, unknown> = {};
  for (const field of ask) {
    const base = { title: field.label };
    properties[field.name] =
      field.type === "number"
        ? { ...base, type: "number" }
        : field.type === "date"
          ? { ...base, type: "string", format: "date" }
          : field.type === "long_text"
            ? { ...base, type: "string", format: "textarea" }
            : field.type === "choice"
              ? { ...base, type: "string", enum: field.choices ?? [] }
              : { ...base, type: "string" };
  }
  return {
    type: "object",
    properties,
    required: ask.filter((field) => field.required).map((field) => field.name),
    additionalProperties: false,
  };
}

/** A toast, or where there is no toast to show, nothing: the host that has none shows nothing, and a failure is still returned. */
function useSay() {
  let toast: ReturnType<typeof useToast> | undefined;
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: whether a provider is above never changes for a mounted page
    toast = useToast();
  } catch {
    toast = undefined;
  }
  return toast;
}

export interface Request {
  widget: PageWidget;
  at: string;
  /** The record the event gave, by id. */
  record?: string | undefined;
  /** Its row, when it is among what the widget read: for `{column}` in the text. */
  row?: Row | undefined;
  /** The group a point or cell stands for. */
  group?: Readonly<Record<string, unknown>> | undefined;
  /** The summary input it came from, for the rows behind it. */
  input?: string | undefined;
  inputs?: Readonly<Record<string, unknown>> | undefined;
  /** The ids of the list a row was clicked in. */
  among?: readonly string[] | undefined;
}

interface Asking {
  request: Request;
  action: Action;
  resolve(outcome: ActOutcome): void;
}

export interface ActionsHost {
  client: PageDataClient;
  registry: ViewRegistry;
  /** The page's record id. */
  record: string | undefined;
  pages: readonly Page[] | undefined;
  filterValues: FilterValues;
  onFilterValues(values: FilterValues): void;
  onNavigate: ((to: NavigateTo) => void) | undefined;
  /** Makes every widget read again. */
  refresh(): void;
  /** What a column is called, for the text. */
  label(column: string): string;
}

/**
 * Runs the actions of a page: asks first when the action says to, calls the server, then
 * does the browser's steps in order and has every widget read again. `node` is what it
 * draws on top of the page: the confirmation, and the rows behind a number.
 */
export function useActions(host: ActionsHost): {
  run(request: Request): Promise<ActOutcome>;
  node: ReactNode;
} {
  const toast = useSay();
  const [asking, setAsking] = useState<Asking>();
  const [rows, setRows] = useState<{ widget: string; input: string; group: Row }>();
  const latest = useRef(host);
  latest.current = host;
  const toasted = useRef(toast);
  toasted.current = toast;

  const say = useCallback((text: string, tone: "success" | "info" | "danger" = "success") => {
    toasted.current?.[tone](text);
  }, []);

  /** The call, and what follows it. Throws an `ActionError` when it did not run. */
  const call = useCallback(
    async (request: Request, action: Action, inputs?: Record<string, unknown>) => {
      const now = latest.current;
      if (!now.client.act) throw new ActionError("Actions can't be run here.");
      const response = await now.client.act(request.widget.id, request.at, {
        records: {
          ...(now.record ? { this: now.record } : {}),
          ...(request.record ? { event: request.record } : {}),
        },
        ...(inputs && Object.keys(inputs).length > 0 ? { inputs } : {}),
      });
      let said = false;
      let values = now.filterValues;
      for (const step of response.client as Step[]) {
        if (step.do === "open") {
          const kind = now.pages?.find((one) => one.id === step.page)?.kind;
          const record = step.record as string | undefined;
          now.onNavigate?.({
            page: step.page,
            ...(record ? { record } : {}),
            as: kind === "sheet" || kind === "modal" ? kind : "page",
            ...(request.among ? { among: request.among } : {}),
          });
        } else if (step.do === "close") {
          now.onNavigate?.({ close: true });
        } else if (step.do === "message") {
          said = true;
          say(step.text, step.tone ?? "success");
        } else if (step.do === "narrow") {
          const value = request.group?.[step.from];
          values = { ...values, [step.filter]: value ?? null };
          now.onFilterValues(values);
        } else if (step.do === "rows") {
          // A clicked point gives its group; a number that isn't broken down (a stat) gives
          // none, and every row behind it is shown.
          const input = request.input;
          if (input) setRows({ widget: request.widget.id, input, group: request.group ?? {} });
        }
      }
      const closing = response.message ?? action.done;
      if (!said && closing) say(closing);
      now.refresh();
    },
    [say],
  );

  const run = useCallback(
    (request: Request): Promise<ActOutcome> => {
      const action = actionAt(request.widget, request.at);
      if (!action) return Promise.resolve({ ok: false, message: "That can't be done here." });
      if (action.confirm) {
        return new Promise((resolve) => setAsking({ request, action, resolve }));
      }
      return call(request, action, request.inputs ? { ...request.inputs } : undefined).then(
        (): ActOutcome => ({ ok: true }),
        (error: unknown): ActOutcome => {
          const message = errorWords(error);
          // What was typed (a form's) is answered beside it by the view that asked; a press of a
          // button with nothing typed is answered in a toast.
          if (!request.inputs) say(message, "danger");
          const fields = error instanceof ActionError ? error.fields : undefined;
          return { ok: false, message, ...(fields ? { fields } : {}) };
        },
      );
    },
    [call, say],
  );

  const node = (
    <>
      <Closing subject={asking}>
        {(held, open) => (
          <Confirmation
            asking={held}
            open={open}
            label={host.label}
            onDone={() => {
              held.resolve({ ok: true });
              setAsking(undefined);
            }}
            onCancel={() => {
              held.resolve({ ok: false, cancelled: true });
              setAsking(undefined);
            }}
            submit={(inputs) => call(held.request, held.action, inputs)}
          />
        )}
      </Closing>
      <Closing subject={rows}>
        {(held, open) => (
          <RowsBehind
            client={host.client}
            registry={host.registry}
            filterValues={host.filterValues}
            held={held}
            open={open}
            onClose={() => setRows(undefined)}
          />
        )}
      </Closing>
    </>
  );
  return { run, node };
}

const errorWords = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "That didn't work. Nothing was changed. Try again.";

/**
 * The confirmation: its title, its text with the record's words in it, what it asks for (a
 * form from the kit), and its button. Pending, a refusal and Cancel are all drawn.
 */
function Confirmation({
  asking,
  open,
  label,
  submit,
  onDone,
  onCancel,
}: {
  asking: Asking;
  open: boolean;
  label: (value: string) => string;
  submit(inputs: Record<string, unknown>): Promise<void>;
  onDone(): void;
  onCancel(): void;
}) {
  const confirm = asking.action.confirm;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ActionError | Error>();
  const text = confirm?.text ? fillText(confirm.text, asking.request.row, label) : undefined;
  const ask = confirm?.ask ?? [];
  const go = async (inputs: Record<string, unknown>) => {
    setBusy(true);
    setFailure(undefined);
    try {
      await submit(inputs);
      onDone();
    } catch (error) {
      setFailure(error instanceof Error ? error : new Error(errorWords(error)));
    } finally {
      setBusy(false);
    }
  };
  const fields: Record<string, string> = {};
  if (failure instanceof ActionError)
    for (const [name, message] of Object.entries(failure.fields ?? {}))
      fields[`/${name}`] = message;
  const button = confirm?.button ?? "Confirm";
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onCancel()}
      title={confirm?.title ?? "Are you sure?"}
      {...(text ? { description: text } : {})}
    >
      {failure && Object.keys(fields).length === 0 ? (
        <div className="mb-3">
          <Notice tone="danger">{errorWords(failure)}</Notice>
        </div>
      ) : null}
      {ask.length > 0 ? (
        <SchemaForm
          schema={askedSchema(ask)}
          submitLabel={button}
          onCancel={onCancel}
          errors={fields}
          disabled={busy}
          onSubmit={(value) => go((value ?? {}) as Record<string, unknown>)}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => go({})}>
            {button}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

/** What a group stands for, in words: "Status: Unpaid, Month: Nov 2026". */
const groupWords = (group: Row) =>
  Object.entries(group)
    .map(([, value]) => String(value ?? "none"))
    .join(", ");

/** The rows behind one number or point, in a side sheet, drawn by the registry's table. */
function RowsBehind({
  client,
  registry,
  filterValues,
  held,
  open,
  onClose,
}: {
  client: PageDataClient;
  registry: ViewRegistry;
  filterValues: FilterValues;
  held: { widget: string; input: string; group: Row };
  open: boolean;
  onClose(): void;
}) {
  const [wire, setWire] = useState<WireData>();
  const [failure, setFailure] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const filters = useRef(filterValues);
  filters.current = filterValues;
  // biome-ignore lint/correctness/useExhaustiveDependencies: what is read is decided by the group and the attempt
  useEffect(() => {
    setWire(undefined);
    setFailure(undefined);
    let live = true;
    if (!client.behind) {
      setFailure("The rows can't be shown here.");
      return;
    }
    client.behind(held.widget, held.input, held.group, filters.current).then(
      (read) => live && setWire(read),
      (error: unknown) => live && setFailure(errorWords(error)),
    );
    return () => {
      live = false;
    };
  }, [client, held.widget, held.input, JSON.stringify(held.group), attempt]);
  const table = registry.get("core/table");
  const View = table?.View;
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      size="wide"
      title="The rows behind it"
      description={groupWords(held.group)}
    >
      {failure ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="danger">{failure}</Notice>
          <Button size="small" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </Button>
        </div>
      ) : !wire || !View || !table ? (
        <Skeleton lines={4} label="Loading the rows" />
      ) : (
        <View
          config={{ ...table.definition.defaults }}
          data={{ rows: toWidgetData(wire) }}
          size={{ w: 12, h: 8, narrow: false }}
          emit={() => undefined}
          building={false}
        />
      )}
    </SideSheet>
  );
}

/** The record an event gave, from what it carries. */
export const recordOf = (payload: EventPayload): string | undefined =>
  "record" in payload && typeof payload.record === "string" ? payload.record : undefined;

/** The group an event gave. */
export const groupOf = (payload: EventPayload): Row | undefined =>
  "group" in payload && payload.group ? payload.group : undefined;
