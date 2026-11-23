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
import { type ConfirmFacts, confirmWords, isDefaultTitle } from "./confirmWords.ts";
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
      /** How many rows that list has in all, when the server said. */
      amongTotal?: number;
      /** Reads the ids that follow the list, once: for stepping past the rows loaded. Absent when there are no more. */
      amongMore?: () => Promise<readonly string[]>;
    }
  | { close: true };

type Row = Readonly<Record<string, unknown>>;

/** What saving a field edited in place is, to the host. */
const EDIT_IN_PLACE: Action = { steps: [], done: "Saved" };

/** The action a widget holds at a place: `on/<event>`, `config/<property>`, or `config/<property>/<index>/action`. */
export function actionAt(widget: PageWidget, at: string): Action | undefined {
  const parts = at.split("/");
  if (parts[0] === "on" && parts.length === 2) return widget.on?.[parts[1] as string];
  if (parts[0] !== "config") return undefined;
  // A record detail that lets people edit in place: the edit is an action of its own, with no
  // steps to run here. The server checks the fields as it does an action's.
  if (at === "config/edit") {
    if (widget.config?.edit !== true) return undefined;
    // Who may edit in place is named as who may run an action is (`editBy`), and the server checks it.
    const by = widget.config.editBy as { groups?: string[] } | undefined;
    return by?.groups?.length ? { ...EDIT_IN_PLACE, runBy: { groups: by.groups } } : EDIT_IN_PLACE;
  }
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

/** A group's title from its path or key: the last segment, hyphens and underscores as spaces, first letter capital. */
export function groupTitle(path: string, names?: Readonly<Record<string, string>>): string {
  // What the group is called now: a group renamed keeps its key, so the key is only a fallback.
  const named = names?.[path];
  if (named) return named;
  const last = path.split("/").filter(Boolean).at(-1) ?? path;
  const words = last.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Practice managers and Billing" / "A, B and C". */
function listOf(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * A group path's key: `groups/<key>` (member group), `end-user-groups/<key>` (end-user group) or a
 * bare key. The same rule as `parseGroupPath` in `@volvel/manifest`, copied because the served
 * runtime may not import the manifest's main entry.
 */
export function groupKey(path: string): string {
  if (path.startsWith("groups/")) return path.slice("groups/".length);
  if (path.startsWith("end-user-groups/")) return path.slice("end-user-groups/".length);
  return path;
}

/** Whether the person is in one of `groups`: one has a key among the user's group keys. */
export function inGroups(groups: readonly string[], user: ActingUser | undefined): boolean {
  const mine = user?.groups ?? [];
  return groups.some((path) => mine.includes(groupKey(path)));
}

/** Whether the person may run the action by its `runBy`; no groups named means anyone. The server decides again. */
export function mayRun(action: Action | undefined, user: ActingUser | undefined): boolean {
  const groups = action?.runBy?.groups;
  return !groups || groups.length === 0 || inGroups(groups, user);
}

/** "Only Practice managers and Billing can do this", when the person is outside the action's groups. */
export function whyNotRun(
  action: Action | undefined,
  user: ActingUser | undefined,
  names?: Readonly<Record<string, string>>,
  /** What the groups can do: "do this", or "edit this" for a record edited in place. */
  what = "do this",
): string | undefined {
  if (mayRun(action, user)) return undefined;
  return `Only ${listOf((action?.runBy?.groups ?? []).map((path) => groupTitle(path, names)))} can ${what}.`;
}

/** Whether a widget is drawn to this person by `rules.seenBy`; drawing only, never security. */
export function seenByUser(
  rules: { seenBy?: { groups: string[] } } | undefined,
  user: ActingUser | undefined,
): boolean {
  const groups = rules?.seenBy?.groups;
  return !groups || groups.length === 0 || inGroups(groups, user);
}

/** The small tag a widget carries while building: "Only for Practice managers". */
export function seenByTag(
  rules: { seenBy?: { groups: string[] } } | undefined,
  names?: Readonly<Record<string, string>>,
): string | undefined {
  const groups = rules?.seenBy?.groups;
  return groups && groups.length > 0
    ? `Only for ${listOf(groups.map((path) => groupTitle(path, names)))}`
    : undefined;
}

/** A confirmation's text, with `{column}` filled from the record it is about. */
export function fillText(
  text: string,
  row: Row | undefined,
  label: (column: string) => string,
  /** Several records: no one of them stands for the rest, so what is said of "its" column is left out. */
  several = false,
) {
  const filled = text.replace(/\{([a-z][a-z0-9_]*)\}/g, (_all, column: string) => {
    if (several) return "";
    const value = row?.[column];
    if (value === undefined || value === null || value === "") return row ? "" : "this record";
    return label(String(value));
  });
  return several
    ? filled
        .replace(/ {2,}/g, " ")
        .replace(/ +([?.,!:;])/g, "$1")
        .trim()
    : filled;
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
  /** Several rows an action runs on (rows chosen in a table), by id; sent as `records.events`. */
  records?: readonly string[] | undefined;
  /** Its row, when it is among what the widget read: for `{column}` in the text. */
  row?: Row | undefined;
  /** The table of the record, when the widget does not read one of its own (a sheet's detail). */
  table?: string | undefined;
  /** What the widget read of its columns and the names references point at: for the confirmation's words. */
  facts?: ConfirmFacts | undefined;
  /** The group a point or cell stands for. */
  group?: Readonly<Record<string, unknown>> | undefined;
  /** The summary input it came from, for the rows behind it. */
  input?: string | undefined;
  inputs?: Readonly<Record<string, unknown>> | undefined;
  /** The ids of the list a row was clicked in. */
  among?: readonly string[] | undefined;
  amongTotal?: number | undefined;
  amongMore?: (() => Promise<readonly string[]>) | undefined;
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
  /** The question the address names (`widget|at|record`), when it names one: it is asked again on a reload or a link. */
  asked?: string | undefined;
  /** The address is told when a question is asked (its reference) and when it is answered (`undefined`). */
  onAsk?: ((ref: string | undefined) => void) | undefined;
  /** The request a reference names, read again: its widget and its row. */
  find?: ((ref: string) => Promise<Request | undefined>) | undefined;
}

/** The address's name for the question an action asks. */
const refOf = (request: Request): string =>
  `${request.widget.id}|${request.at}|${request.record ?? ""}`;

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
  // Whether the address has been told of the question that is open: the address leaving it
  // (Back) then closes it, as a sheet is closed.
  const told = useRef<string | undefined>(undefined);
  const later = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const timer of later.current) clearTimeout(timer);
    },
    [],
  );
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
        records:
          request.at === "config/edit" && request.record
            ? // A field edited in place changes the record the detail shows, whichever way the detail
              // came by it (the page's, a row selected, the user's own, the one a sheet was opened on).
              { this: request.record }
            : {
                ...(now.record ? { this: now.record } : {}),
                ...(request.record ? { event: request.record } : {}),
                ...(request.records && request.records.length > 0
                  ? { events: [...request.records] }
                  : {}),
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
            ...(request.amongTotal !== undefined ? { amongTotal: request.amongTotal } : {}),
            ...(request.amongMore ? { amongMore: request.amongMore } : {}),
          });
        } else if (step.do === "close") {
          now.onNavigate?.({ close: true });
        } else if (step.do === "message") {
          said = true;
          say(step.text, step.tone ?? "success");
        } else if (step.do === "narrow") {
          const value = request.group?.[step.from];
          // A group with no value (rows with none set) gives nothing to narrow by: the page is
          // left as it is, and it is said, rather than widened.
          if (value === undefined || value === null) {
            say("Those rows have no value to narrow the page by.", "info");
            continue;
          }
          values = { ...values, [step.filter]: value };
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
      // Saved, but what it was to start did not start: said apart, in the words of an error.
      for (const one of response.notStarted ?? [])
        say(`Saved. The ${one.do} ${one.path} could not be started.`, "danger");
      now.refresh();
      // A script or a workflow is started and not waited for: what it changes is read as it lands.
      if (response.started) {
        for (const wait of AFTER_A_START)
          later.current.push(setTimeout(() => latest.current.refresh(), wait));
      }
    },
    [say],
  );

  const run = useCallback(
    (request: Request): Promise<ActOutcome> => {
      const action = actionAt(request.widget, request.at);
      if (!action) return Promise.resolve({ ok: false, message: "That can't be done here." });
      if (action.confirm) {
        // A widget on a sheet or record page has no table of its own: the page's says what its record is.
        const held = latest.current.pages?.filter(
          (page) =>
            page.widgets.includes(request.widget) ||
            page.widgets.some(
              (one) => one.id === request.widget.id && one.type === request.widget.type,
            ),
        );
        const table =
          tableOfWidget(request.widget) ?? held?.find((page) => page.record)?.record?.table;
        return new Promise((resolve) =>
          setAsking({ request: { ...request, table }, action, resolve }),
        );
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

  // The question that is open is in the address. Asked: the address is told. The address leaving
  // it (Back): it is answered with no. Answered: the address is told. A page loaded on an address
  // that names one asks it again (once, as the page opens).
  const asked = host.asked;
  useEffect(() => {
    if (!asking) {
      if (told.current !== undefined) {
        told.current = undefined;
        if (latest.current.asked !== undefined) latest.current.onAsk?.(undefined);
      }
      return;
    }
    const ref = refOf(asking.request);
    if (asked === ref) {
      told.current = ref;
    } else if (told.current === ref) {
      told.current = undefined;
      asking.resolve({ ok: false, cancelled: true });
      setAsking(undefined);
    } else if (latest.current.onAsk) {
      told.current = ref;
      latest.current.onAsk(ref);
    }
  }, [asking, asked]);
  const booted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked again once, as the page opens
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const ref = latest.current.asked;
    if (!ref || !latest.current.find) return;
    void latest.current.find(ref).then((request) => {
      if (request) void run(request);
    });
  }, []);

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
            submit={async (inputs) => {
              // What the form typed goes with what the confirmation asked for.
              const given = { ...held.request.inputs, ...inputs };
              try {
                await call(held.request, held.action, given);
              } catch (error) {
                // A refusal of what the form holds is the form's to draw, beside the field.
                const asked = new Set((held.action.confirm?.ask ?? []).map((one) => one.name));
                const fields = error instanceof ActionError ? error.fields : undefined;
                if (
                  held.request.inputs &&
                  fields &&
                  Object.keys(fields).some((name) => !asked.has(name))
                ) {
                  held.resolve({ ok: false, message: errorWords(error), fields });
                  setAsking(undefined);
                  return;
                }
                throw error;
              }
            }}
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

/** What the button that runs the action at `at` says: a row action's or group action's label, a button's. */
export function labelAt(widget: PageWidget, at: string): string | undefined {
  const parts = at.split("/");
  if (parts[0] === "on" && widget.type === "core/button") {
    const label = widget.config?.label;
    return typeof label === "string" ? label : widget.title;
  }
  if (parts[0] === "config" && parts.length === 4 && parts[3] === "action") {
    const list = widget.config?.[parts[1] as string];
    const item = Array.isArray(list) ? (list[Number(parts[2])] as { label?: unknown }) : undefined;
    return typeof item?.label === "string" ? item.label : undefined;
  }
  return undefined;
}

/** The table a widget reads its first rows from, to call a record by what it is. */
export function tableOfWidget(widget: PageWidget): string | undefined {
  for (const input of Object.values(widget.data ?? {})) {
    const source = input.source;
    if ("visual" in source) return source.visual.table;
  }
  return undefined;
}

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
  const several = (asking.request.records?.length ?? 0) > 1;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ActionError | Error>();
  const words = confirmWords({
    label: labelAt(asking.request.widget, asking.request.at),
    confirm: confirm
      ? {
          title: isDefaultTitle(confirm.title) ? undefined : confirm.title,
          text: confirm.text,
          button: confirm.button,
        }
      : undefined,
    table: tableOfWidget(asking.request.widget) ?? asking.request.table,
    row: several ? undefined : asking.request.row,
    facts: asking.request.facts,
    count: several ? asking.request.records?.length : undefined,
  });
  const text = words.text ? fillText(words.text, asking.request.row, label, several) : undefined;
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
  const button = words.button;
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onCancel()}
      title={fillText(words.title, asking.request.row, label, several)}
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
          json={false}
          submitLabel={button}
          onCancel={onCancel}
          errors={fields}
          disabled={busy}
          onSubmit={(value) => go((value ?? {}) as Record<string, unknown>)}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {words.dismiss}
          </Button>
          <Button variant="primary" loading={busy} data-autofocus="" onClick={() => go({})}>
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

/** When the page reads again after an action started something, in milliseconds. */
const AFTER_A_START = [1_000, 3_000, 8_000];

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
  // Opened again it reads again: the page's filters may have changed while it was closing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: what is read is decided by the group, the filters and the attempt
  useEffect(() => {
    if (!open) return;
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
  }, [
    client,
    open,
    held.widget,
    held.input,
    JSON.stringify(held.group),
    JSON.stringify(filterValues),
    attempt,
  ]);
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
