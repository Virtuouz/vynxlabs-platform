import {
  Button,
  CheckboxField,
  ComboboxField,
  MultiSelectField,
  NumberField,
  type Option,
  SelectField,
  TextAreaField,
  TextField,
} from "@volvel/ui";
import { useEffect, useRef, useState } from "react";
import { useLoad } from "../api.ts";
import {
  FIELD_TYPES,
  type FieldType,
  fieldsOf,
  problemsOf,
  type SchemaRow,
  schemaOf,
} from "./inputSchema.ts";

/**
 * Settings that more than one editor draws: the flow editor's inspector, the
 * editors of the trigger and schedule kinds, and the steps that wait. Each is
 * written once here, so the same setting reads and behaves the same everywhere.
 */

/** A list of options with the values already chosen that it does not offer, so choosing again never drops them. */
export const withCurrent = (options: Option[], value: readonly string[]): Option[] => [
  ...options,
  ...value
    .filter((one) => !options.some((option) => option.value === one))
    .map((one) => ({ value: one, label: one })),
];

// ----- How long -----

const UNITS: { seconds: number; one: string; many: string }[] = [
  { seconds: 1, one: "second", many: "seconds" },
  { seconds: 60, one: "minute", many: "minutes" },
  { seconds: 3600, one: "hour", many: "hours" },
  { seconds: 86400, one: "day", many: "days" },
];

/** The largest unit that a number of seconds is a whole number of. */
export function unitOf(seconds: number | undefined): number {
  if (!seconds) return 1;
  return [...UNITS].reverse().find((unit) => seconds % unit.seconds === 0)?.seconds ?? 1;
}

/**
 * A length of time as a number and a unit, kept as seconds. The unit stays the one
 * chosen while a number is typed; a value set from elsewhere (undo) is shown in the
 * largest unit it is whole in. Shared by Wait and an approval's time limit.
 */
export function DurationField({
  name,
  label,
  value,
  onChange,
  hint,
  required = true,
  max = 2592000,
}: {
  name: string;
  label: string;
  /** Seconds. */
  value: number | undefined;
  onChange: (seconds: number | undefined) => void;
  hint?: string | undefined;
  required?: boolean;
  /** The most it may be, in seconds. */
  max?: number;
}) {
  const [chosen, setChosen] = useState(() => unitOf(value));
  // A value that is not whole in the chosen unit is shown in one it is whole in.
  const unit = value !== undefined && value % chosen !== 0 ? unitOf(value) : chosen;
  const shown = value === undefined ? undefined : value / unit;
  const tooLong = value !== undefined && value > max;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-body-sm font-medium">
        {label}
        {required ? "" : " (optional)"}
      </legend>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <NumberField
            name={name}
            label="Amount"
            value={shown}
            min={1}
            step={1}
            required={required}
            error={
              tooLong
                ? `That is longer than the most allowed, ${Math.floor(max / 86400)} days.`
                : undefined
            }
            onChange={(amount) => onChange(amount === undefined ? undefined : amount * unit)}
          />
        </div>
        <div className="w-32 shrink-0">
          <SelectField
            name={`${name}-unit`}
            label="Unit"
            value={String(unit)}
            options={UNITS.map((one) => ({
              value: String(one.seconds),
              label: shown === 1 ? one.one : one.many,
            }))}
            onChange={(next) => {
              const seconds = Number(next);
              setChosen(seconds);
              if (value !== undefined) onChange((shown as number) * seconds);
            }}
          />
        </div>
      </div>
      {hint ? <p className="m-0 text-meta text-ink-muted">{hint}</p> : null}
    </fieldset>
  );
}

// ----- Expressions, one to a line -----

const lines = (text: string) => text.split("\n").map((line) => line.trim());
const kept = (text: string) => lines(text).filter(Boolean);

/**
 * Several expressions, one to a line. What is typed stays as typed; the list is
 * read from it on each key, and the text is tidied when the field is left or the
 * list is changed from elsewhere (undo).
 */
function ExpressionLines({
  name,
  label,
  hint,
  value,
  readOnly,
  onChange,
  error,
}: {
  name: string;
  label: string;
  hint: string;
  value: string[];
  readOnly?: boolean | undefined;
  onChange: (value: string[]) => void;
  error?: string | undefined;
}) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => {
    setText((now) =>
      JSON.stringify(kept(now)) === JSON.stringify(value) ? now : value.join("\n"),
    );
  }, [value]);
  return (
    <TextAreaField
      name={name}
      label={label}
      rows={3}
      value={text}
      required={false}
      disabled={readOnly === true}
      hint={hint}
      {...(error ? { error } : {})}
      onChange={(next) => {
        setText(next);
        onChange(kept(next));
      }}
      onBlur={() => setText(kept(text).join("\n"))}
    />
  );
}

/** What a start is set to, whatever its kind. */
export type StartSettings = { type: string } & Record<string, unknown>;

/** The kinds of start that give their runs tags. */
const TAGGING_STARTS = ["schedule", "webhook", "event"];

/**
 * Changes what a start is: the settings it had are put on `shelf` under its kind, and when
 * it is changed back they return. A kind not seen before begins as `fresh` says, with the
 * tags carried over where it takes tags. The shelf lives as long as the step is open.
 */
export function switchStart(
  shelf: Map<string, StartSettings>,
  current: StartSettings,
  type: string,
  fresh: () => StartSettings,
): StartSettings {
  shelf.set(current.type, current);
  const back = shelf.get(type);
  if (back) return back;
  const made = fresh();
  const tags = current.tags;
  return Array.isArray(tags) && tags.length > 0 && TAGGING_STARTS.includes(type)
    ? { ...made, tags }
    : made;
}

/** The most tags a start may give a run. */
export const MAX_TAGS = 10;

/**
 * The tags each run of a start carries, worked out from what the start was given.
 * Shared by the starts of a flow (webhook, schedule, event) and the trigger and
 * schedule kinds, which write the same `tags`.
 */
export function TagsField({
  value,
  onChange,
  readOnly,
  given = "what it was given",
}: {
  value: string[] | undefined;
  onChange: (tags: string[] | undefined) => void;
  readOnly?: boolean | undefined;
  /** What `trigger` is for this start, in a few words. */
  given?: string;
}) {
  const tags = value ?? [];
  return (
    <ExpressionLines
      name="tags"
      label="Tags for each run (optional)"
      value={tags}
      readOnly={readOnly}
      hint={`One expression to a line, over trigger, ${given}. Each gives a tag for the run, such as 'order:' + string(trigger.id), and you can search runs by it. A tag is up to 64 characters of a-z, 0-9 and _.:-; one that fails is left out. Up to ${MAX_TAGS}.`}
      error={
        tags.length > MAX_TAGS
          ? `A start may give ${MAX_TAGS} tags at most. Remove ${tags.length - MAX_TAGS}.`
          : undefined
      }
      onChange={(next) => onChange(next.length > 0 ? next : undefined)}
    />
  );
}

// ----- An event as a start -----

/**
 * The event a start listens for, and the filter that picks the events that start
 * it. The filter sees `event` (its `name` and `payload`) and nothing else, so it
 * is not worked out against a run, which would show `trigger` and `steps` it can
 * never read.
 */
export function EventStartFields({
  events,
  event,
  filter,
  readOnly,
  onEvent,
  onFilter,
}: {
  events: Option[];
  event: string | undefined;
  filter: string | undefined;
  readOnly?: boolean | undefined;
  onEvent: (event: string) => void;
  onFilter: (filter: string | undefined) => void;
}) {
  return (
    <>
      <ComboboxField
        label="Event"
        options={events}
        value={event || undefined}
        disabled={readOnly === true}
        empty="This workspace has no events yet."
        onChange={(value) => onEvent(value ?? "")}
      />
      <TextAreaField
        name="filter"
        label="Only when (optional)"
        rows={2}
        value={filter ?? ""}
        required={false}
        disabled={readOnly === true}
        hint="An expression over event: event.name and event.payload, such as event.payload.amount > 100. It starts only when it gives true. Left empty, every event of this name starts it."
        onChange={(value) => onFilter(value === "" ? undefined : value)}
      />
    </>
  );
}

// ----- Who may decide an approval -----

/** The tenant's own address, from a workspace's. */
const tenantOf = (root: string) => root.split("/workspaces/")[0] as string;

/**
 * Who may decide an approval, beyond holding the permission to: members of the
 * groups chosen, or people bound to the roles chosen. A group is named by its key,
 * which never changes. Nothing chosen means anyone who holds `approval:write`.
 */
export function ApproversFields({
  root,
  value,
  onChange,
}: {
  root: string;
  value: { groups?: string[]; roles?: string[] } | undefined;
  onChange: (approvers: { groups?: string[]; roles?: string[] } | undefined) => void;
}) {
  const groups = useLoad<{ items: { key: string; name: string }[] }>(
    `${tenantOf(root)}/groups?limit=200`,
  );
  const roles = useLoad<{ items: { name: string }[] }>(`${tenantOf(root)}/roles?limit=200`);
  const chosen = { groups: value?.groups ?? [], roles: value?.roles ?? [] };
  const put = (next: { groups: string[]; roles: string[] }) =>
    onChange(
      next.groups.length === 0 && next.roles.length === 0
        ? undefined
        : {
            ...(next.groups.length > 0 ? { groups: next.groups } : {}),
            ...(next.roles.length > 0 ? { roles: next.roles } : {}),
          },
    );
  const loading = groups.loading || roles.loading;
  const failed = groups.error || roles.error;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-body-sm font-medium">Who may decide</legend>
      <p className="m-0 text-meta text-ink-muted">
        {chosen.groups.length + chosen.roles.length === 0
          ? "Anyone who holds the approval permission may decide. Choose groups or roles to narrow it."
          : "Only a member of one of these groups, or someone with one of these roles, who also holds the approval permission."}
      </p>
      {failed ? (
        <p role="alert" className="m-0 text-body-sm text-danger">
          The groups and roles could not be loaded. Reload the page, or ask a tenant admin to check
          that you may see them.
        </p>
      ) : null}
      <MultiSelectField
        label="Groups"
        options={withCurrent(
          (groups.data?.items ?? []).map((one) => ({
            value: one.key,
            label: one.key,
            ...(one.name !== one.key ? { hint: one.name } : {}),
          })),
          chosen.groups,
        )}
        value={chosen.groups}
        {...(loading ? { placeholder: "Loading…" } : {})}
        empty="This tenant has no groups yet."
        hint="Named by key, so renaming a group does not change who may decide."
        onChange={(next) => put({ ...chosen, groups: next })}
      />
      <MultiSelectField
        label="Roles"
        options={withCurrent(
          (roles.data?.items ?? []).map((one) => ({ value: one.name, label: one.name })),
          chosen.roles,
        )}
        value={chosen.roles}
        {...(loading ? { placeholder: "Loading…" } : {})}
        empty="This tenant has no roles yet."
        onChange={(next) => put({ ...chosen, roles: next })}
      />
    </fieldset>
  );
}

// ----- What a step hands its script -----

export interface Grants {
  connections?: string[];
  tables?: string[];
  events?: string[];
}

/**
 * What a step hands the script it runs, beyond what the script declares for itself:
 * the connections it may use, the tables it may read and the events it may publish.
 * Picks made in a script's own fields add to these; what is written here stays.
 */
export function GrantsFields({
  value,
  choices,
  onChange,
}: {
  value: Grants | undefined;
  choices: { connections: Option[]; tables: Option[]; events: Option[] };
  onChange: (grants: Grants | undefined) => void;
}) {
  const current = value ?? {};
  const put = (field: keyof Grants, next: string[]) => {
    const merged: Grants = { ...current, [field]: next };
    for (const key of Object.keys(merged) as (keyof Grants)[]) {
      if ((merged[key] ?? []).length === 0) delete merged[key];
    }
    onChange(Object.keys(merged).length > 0 ? merged : undefined);
  };
  const one = (field: keyof Grants, label: string, noun: string, options: Option[]) => (
    <MultiSelectField
      label={label}
      options={withCurrent(options, current[field] ?? [])}
      value={current[field] ?? []}
      empty={`This workspace has no ${noun} yet.`}
      onChange={(next) => put(field, next)}
    />
  );
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-body-sm font-medium">What the script may reach</legend>
      <p className="m-0 text-meta text-ink-muted">
        The script reaches only what it declares or what is listed here. A connection chosen in a
        field above is listed for you.
      </p>
      {one("connections", "Connections", "connections", choices.connections)}
      {one("tables", "Tables", "tables", choices.tables)}
      {one("events", "Events it may publish", "events", choices.events)}
    </fieldset>
  );
}

// ----- What a manual start takes -----

const textOf = (schema: Record<string, unknown> | undefined) =>
  schema === undefined ? "" : JSON.stringify(schema, null, 2);

/** What is wrong with text meant as a schema, or nothing when it is a JSON object. */
function problemOf(text: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return 'A schema is a JSON object, such as { "type": "object" }.';
    return undefined;
  } catch (error) {
    return `This is not JSON yet, so the schema is not saved: ${error instanceof Error ? error.message : "it does not parse"}.`;
  }
}

/**
 * The JSON Schema the input of a manual start must match. It draws the Start form,
 * and the tool an agent is given. What is typed stays as typed; it is saved once it is
 * JSON that is an object, and said not to be until then.
 */
export function InputSchemaField({
  value,
  onChange,
  kept,
}: {
  value: Record<string, unknown> | undefined;
  onChange: (schema: Record<string, unknown> | undefined) => void;
  /**
   * Where the text that is not a schema yet is kept while another step is open, by the host
   * (this field is drawn again when its step is chosen again). Nothing is kept for text that is saved.
   */
  kept?: { get: () => string | undefined; set: (text: string | undefined) => void };
}) {
  const [text, setText] = useState(kept?.get() ?? textOf(value));
  const [problem, setProblem] = useState<string | undefined>(() => {
    const unsaved = kept?.get();
    return unsaved === undefined ? undefined : problemOf(unsaved);
  });
  const shown = fieldsOf(value);
  const [rows, setRows] = useState<SchemaRow[]>(() => ("rows" in shown ? shown.rows : []));
  // A schema changed from elsewhere (undo) is the one shown. Not when drawn: then what was kept is.
  const drawn = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `kept` is the host's, and changes each draw
  useEffect(() => {
    if (!drawn.current) {
      drawn.current = true;
      return;
    }
    // The rows follow the schema, unless they are what made it (or are not a schema yet).
    const next = fieldsOf(value);
    if ("rows" in next) {
      setRows((now) =>
        problemsOf(now).size > 0 || JSON.stringify(schemaOf(now)) === JSON.stringify(value)
          ? now
          : next.rows,
      );
    }
    setText((now) => {
      try {
        const same =
          now.trim() === ""
            ? value === undefined
            : JSON.stringify(JSON.parse(now)) === JSON.stringify(value);
        if (same) return now;
      } catch {
        // What is typed is not JSON yet, and the saved schema is the older one.
      }
      setProblem(undefined);
      kept?.set(undefined);
      return textOf(value);
    });
  }, [value]);
  const read = (next: string) => {
    setText(next);
    const wrong = next.trim() === "" ? undefined : problemOf(next);
    setProblem(wrong);
    kept?.set(wrong === undefined ? undefined : next);
    if (wrong !== undefined) return;
    onChange(next.trim() === "" ? undefined : (JSON.parse(next) as Record<string, unknown>));
  };
  /** The form wrote: the JSON box shows what it made, once the rows make a schema. */
  const write = (next: SchemaRow[]) => {
    setRows(next);
    if (problemsOf(next).size > 0) return;
    const schema = schemaOf(next);
    setText(textOf(schema));
    setProblem(undefined);
    kept?.set(undefined);
    onChange(schema);
  };
  return (
    <div className="flex flex-col gap-3">
      <SchemaFields
        rows={rows}
        why={"why" in shown ? shown.why : undefined}
        unsaved={problem !== undefined}
        onChange={write}
      />
      <JsonBox
        text={text}
        problem={problem}
        onChange={read}
        onBlur={() => {
          if (problem === undefined && text.trim() !== "") setText(textOf(value));
        }}
      />
    </div>
  );
}

const NEW_ROW: SchemaRow = {
  name: "",
  type: "string",
  required: false,
  description: "",
  min: undefined,
  max: undefined,
};

/**
 * The fields of the input, one group each: name, type, whether it is required, a short
 * description, and the limits its type has. A schema the form cannot show says so and why.
 */
function SchemaFields({
  rows,
  why,
  unsaved,
  onChange,
}: {
  rows: SchemaRow[];
  why: string | undefined;
  unsaved: boolean;
  onChange: (rows: SchemaRow[]) => void;
}) {
  // A removed field takes the focus with it: it goes to the field that took its place, else the
  // one before it, else Add a field, and never to the page.
  const group = useRef<HTMLFieldSetElement>(null);
  const after = useRef<number | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after each removal
  useEffect(() => {
    const at = after.current;
    if (at === undefined) return;
    after.current = undefined;
    const names = group.current?.querySelectorAll<HTMLElement>('input[name$="-name"]');
    const target = names?.[Math.min(at, (names?.length ?? 0) - 1)];
    (target ?? group.current?.querySelector<HTMLElement>("[data-add-field]"))?.focus();
  }, [rows]);
  if (why !== undefined) {
    return (
      <p className="m-0 text-body-sm text-ink-muted" role="note">
        The form cannot show this schema. {why} Edit the JSON below.
      </p>
    );
  }
  const problems = problemsOf(rows);
  const change = (at: number, patch: Partial<SchemaRow>) =>
    onChange(rows.map((row, index) => (index === at ? { ...row, ...patch } : row)));
  return (
    <fieldset
      ref={group}
      className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
      disabled={unsaved}
    >
      <legend className="mb-1 p-0 text-body-sm font-medium">What it takes, field by field</legend>
      {unsaved ? (
        <p className="m-0 text-meta text-ink-muted">
          The JSON below is not valid yet. The fields show the schema that is saved, and come back
          to use when the JSON is valid.
        </p>
      ) : rows.length === 0 ? (
        <p className="m-0 text-meta text-ink-muted">
          No fields: any object is accepted. Add a field to say what it must hold.
        </p>
      ) : null}
      {rows.map((row, at) => {
        const n = at + 1;
        const text = row.type === "string";
        return (
          <fieldset
            // biome-ignore lint/suspicious/noArrayIndexKey: a row is known by its place while its name is typed
            key={at}
            className="m-0 flex min-w-0 flex-col gap-2 rounded-control border border-line p-3"
          >
            <legend className="px-1 text-meta text-ink-muted">Field {n}</legend>
            <TextField
              name={`input-field-${n}-name`}
              label={`Name of field ${n}`}
              value={row.name}
              required
              {...(problems.get(at) ? { error: problems.get(at) as string } : {})}
              onChange={(name) => change(at, { name })}
            />
            <SelectField
              name={`input-field-${n}-type`}
              label={`Type of field ${n}`}
              value={row.type}
              options={FIELD_TYPES}
              onChange={(type) =>
                change(at, {
                  type: type as FieldType,
                  ...(type === "boolean" || (type === "string") !== text
                    ? { min: undefined, max: undefined }
                    : {}),
                })
              }
            />
            <CheckboxField
              name={`input-field-${n}-required`}
              label={`Field ${n} is required`}
              checked={row.required}
              onChange={(required) => change(at, { required })}
            />
            <TextField
              name={`input-field-${n}-description`}
              label={`About field ${n}`}
              value={row.description}
              required={false}
              hint="A short description, shown beside the field on the Start form."
              onChange={(description) => change(at, { description })}
            />
            {row.type === "boolean" ? null : (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  name={`input-field-${n}-min`}
                  label={`${text ? "Shortest" : "Smallest"} of field ${n}`}
                  value={row.min}
                  required={false}
                  onChange={(min) => change(at, { min })}
                />
                <NumberField
                  name={`input-field-${n}-max`}
                  label={`${text ? "Longest" : "Largest"} of field ${n}`}
                  value={row.max}
                  required={false}
                  onChange={(max) => change(at, { max })}
                />
              </div>
            )}
            <div>
              <Button
                size="small"
                variant="quiet"
                onClick={() => {
                  after.current = at;
                  onChange(rows.filter((_, index) => index !== at));
                }}
                aria-label={`Remove field ${n}`}
              >
                Remove field
              </Button>
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button size="small" data-add-field="" onClick={() => onChange([...rows, { ...NEW_ROW }])}>
          Add a field
        </Button>
      </div>
    </fieldset>
  );
}

function JsonBox({
  text,
  problem,
  onChange,
  onBlur,
}: {
  text: string;
  problem: string | undefined;
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  return (
    <TextAreaField
      name="input-schema"
      label="What it takes, as JSON Schema (optional)"
      rows={8}
      value={text}
      required={false}
      hint="Input given when the flow is started by hand, from the API, by an agent or as a sub-flow must match it. It draws the Start form and the tool an agent is given. Without one, any object is accepted."
      {...(problem ? { error: problem } : {})}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
}
