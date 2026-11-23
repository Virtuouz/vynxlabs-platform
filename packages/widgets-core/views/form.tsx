import {
  Button,
  CheckboxField,
  ComboboxField,
  checkValue,
  DateField,
  EmptyState,
  FieldMarks,
  type JsonSchema,
  MoneyField,
  MultiSelectField,
  Notice,
  NumberField,
  type Option,
  SelectField,
  TextAreaField,
  TextField,
} from "@volvel/ui";
import type { ColumnInfo, RecordData, WidgetViewProps } from "@volvel/widgets";
import { moneyFormatOf, mustGive } from "@volvel/widgets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** One field of the form, as `config.fields` lists it. */
interface FieldConfig {
  column: string;
  label?: string;
  help?: string;
  section?: string;
  required?: boolean;
  /** How the value is typed in: money kept in cents is typed as dollars. */
  format?: { style?: string; minorUnits?: boolean; currency?: string };
  /** What the field starts with in a new record: today, the person filling it in, or a fixed value. */
  initial?: { kind: "today" | "me" | "value"; as?: "email" | "name" | "id"; value?: unknown };
}

export interface FormConfig {
  mode: "create" | "edit";
  fields: readonly FieldConfig[];
  submitLabel?: string;
}

/**
 * What a column may say beyond `ColumnInfo` today: the table it points to and
 * whether it must be given (the data server's), and how its number is shown.
 */
type FormColumn = ColumnInfo & {
  references?: string;
  required?: boolean;
  /** A number's format, as the table's widgets give it. `currency` is money. */
  format?: { style?: string; minorUnits?: boolean; currency?: string };
  /** The column holds a list of values. */
  multiple?: boolean;
  maxLength?: number;
};

/**
 * `onClose` is the one thing a form needs that the view props lack: a way to close the
 * modal or sheet it is in. When the host gives it, the form draws Cancel.
 */
export type FormViewProps = WidgetViewProps<FormConfig>;

type Values = Record<string, unknown>;

const words = (name: string) => {
  const text = name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

type Kind =
  | "text"
  | "longtext"
  | "integer"
  | "number"
  | "money"
  | "date"
  | "timestamp"
  | "boolean"
  | "enum"
  | "reference"
  | "file"
  | "json";

/** A column that holds a list of values: marked so, or a several-choice column. */
const holdsList = (column: FormColumn) =>
  column.multiple === true || column.type.toLowerCase() === "enum_list";

function kindOf(column: FormColumn): Kind {
  const type = column.type.toLowerCase();
  if (type === "reference") return "reference";
  if (type === "file") return "file";
  if (type === "enum" || type === "enum_list") return "enum";
  if (type === "boolean") return "boolean";
  if (type === "date") return "date";
  if (type === "timestamp") return "timestamp";
  if (type === "json") return "json";
  if (type === "money" || (column.format ?? moneyFormatOf(column))?.style === "currency") {
    return "money";
  }
  if (type === "integer") return "integer";
  if (type === "number") return "number";
  if (typeof column.maxLength === "number" && column.maxLength > 1000) return "longtext";
  if (column.format && (column.format as { style?: string }).style === "textarea")
    return "longtext";
  return "text";
}

/**
 * The money a field is typed in: its own format, else what the table says the column holds. It is
 * kept as minor units (cents) when that says so, and typed as dollars; a column of type `money`
 * is cents.
 */
export function moneyOf(column: FormColumn): { currency: string; minorUnits: boolean } {
  const known = column.format?.style === "currency" ? column.format : moneyFormatOf(column);
  return {
    currency: known?.currency ?? "USD",
    minorUnits: known?.minorUnits ?? column.type.toLowerCase() === "money",
  };
}

/** The schema of one column, so the checks are the kit's own (`checkValue`). */
function schemaOf(column: FormColumn, kind: Kind): JsonSchema {
  let one: JsonSchema;
  switch (kind) {
    case "integer":
    case "money":
      one = { type: "integer" };
      break;
    case "number":
      one = { type: "number" };
      break;
    case "boolean":
      one = { type: "boolean" };
      break;
    case "date":
      one = { type: "string", format: "date" };
      break;
    case "timestamp":
      one = { type: "string", format: "date-time" };
      break;
    case "enum":
      one = { enum: (column.values ?? []).map((value) => value.value) };
      break;
    case "json":
    case "file":
      return {};
    default:
      one = { type: "string" };
  }
  return holdsList(column) ? { type: "array", items: one } : one;
}

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

const same = (a: unknown, b: unknown) =>
  (isEmpty(a) && isEmpty(b)) || JSON.stringify(a) === JSON.stringify(b);

/** A json column is typed as text and sent as the value it spells. */
const jsonText = (value: unknown) =>
  value === undefined || value === null
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);

/** A moment as the reader's clock writes it, `2026-03-09T14:30`: what a time field is given. */
export function localTime(instant: string): string {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return instant;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}T${two(at.getHours())}:${two(at.getMinutes())}`;
}

/** What the reader typed on their clock, as the moment it is: ISO 8601 in UTC, which the rows take. */
export function instantOf(typed: string): string {
  const at = new Date(typed);
  return Number.isNaN(at.getTime()) ? typed : at.toISOString();
}

/** Today as the page reads it: the day on the clock of the browser, as its date filters do. */
export function today(now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/**
 * What a field of a new record starts with, by what its `initial` says: today (a date, or
 * the moment for a timestamp), the person filling it in, or a fixed value. Nothing when it
 * says none, or the host doesn't know who is looking.
 */
export function initialValue(
  field: FieldConfig,
  kind: Kind,
  viewer: FormViewProps["viewer"],
  now = new Date(),
): unknown {
  const initial = field.initial;
  if (!initial) return undefined;
  if (initial.kind === "value") return initial.value;
  if (initial.kind === "today") {
    if (kind === "date") return today(now);
    if (kind === "timestamp") return now.toISOString();
    return undefined;
  }
  if (!viewer) return undefined;
  return viewer[initial.as ?? "email"];
}

/**
 * What the form starts with: the open record's values for the fields. A new record starts
 * with each field's own start (`initial`), else what the table gives a row that gives none
 * (the column's default); an open record's own value always wins.
 */
function startValues(
  fields: readonly FieldConfig[],
  record: Values | null,
  kinds: (field: FieldConfig) => Kind,
  viewer: FormViewProps["viewer"],
  defaults?: ReadonlyMap<string, unknown>,
): Values {
  const out: Values = {};
  for (const field of fields) {
    if (!record) {
      const value = initialValue(field, kinds(field), viewer) ?? defaults?.get(field.column);
      if (!isEmpty(value)) out[field.column] = value;
      continue;
    }
    const held = record[field.column];
    if (held !== undefined && held !== null) out[field.column] = held;
  }
  return out;
}

/** The server's `/inputs/total` or `total`, as a column name. */
const columnOf = (path: string) => path.replace(/^\/?inputs\//, "").replace(/^\//, "");

/** A json column's text, read: nothing when empty, not ok when it is not JSON. */
function readJson(text: string): { ok: boolean; value?: unknown } {
  if (text.trim() === "") return { ok: true };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

const PAUSE = 200;

/**
 * Create or edit a record. Its fields come from the table's columns, each drawn
 * with the kit's control for its type, checked here with the kit's `checkValue`
 * and again by the server, whose answers for a field are drawn at that field.
 * An edit sends only what was changed.
 */
export function FormView(props: FormViewProps) {
  const { config, data, building } = props;
  const input = data.record as RecordData | undefined;
  if (!input) return null;
  const edit = config.mode === "edit";
  if (edit && !input.record && !building) {
    return <EmptyState title="No record is open">Open a record to change it.</EmptyState>;
  }
  // Another record starts the fields again. The same record read again does not: what was typed
  // stays, and only what was not touched takes the new value (see `FormBody`).
  const key = `${edit ? "edit" : "create"}:${edit ? String((input.record as Values | null)?.id ?? "") : ""}`;
  return <FormBody key={key} {...props} record={input} />;
}

function FormBody({
  config,
  record: data,
  building,
  act,
  choices,
  viewer,
  close: onClose,
}: FormViewProps & { record: RecordData }) {
  const edit = config.mode === "edit";
  const columns = data.columns as readonly FormColumn[];
  // A field's own format (money kept in cents, say) is how its column is typed into here.
  const byName = useMemo(
    () =>
      new Map(
        columns.map((column) => {
          const format = config.fields.find((field) => field.column === column.name)?.format;
          return [column.name, format ? { ...column, format } : column];
        }),
      ),
    [columns, config.fields],
  );
  const fields = useMemo(
    () => config.fields.filter((field) => byName.has(field.column)),
    [config.fields, byName],
  );
  const original = data.record as Values | null;
  const begin = useCallback(
    () =>
      startValues(
        fields,
        edit ? original : null,
        (field) => kindOf(byName.get(field.column) as FormColumn),
        viewer,
        new Map(columns.map((column) => [column.name, column.default])),
      ),
    [fields, original, edit, byName, viewer, columns],
  );

  const [values, setValues] = useState<Values>(begin);
  // The record as it was last read: a field still equal to it is untouched.
  const seen = useRef<Values | null>(original);
  const live = useRef(values);
  live.current = values;
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // What is typed in a money field and is not an amount: it blocks sending, in words.
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [note, setNote] = useState<string>();
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const off = building || pending;

  // The record read again with another value for a column: a field nobody touched takes it, and
  // one that was touched keeps what was typed, said so.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new read of the record matters here
  useEffect(() => {
    const before = seen.current;
    seen.current = original;
    if (!edit || !before || !original) return;
    const changed = fields.filter((field) => !same(before[field.column], original[field.column]));
    if (changed.length === 0) return;
    const now = live.current;
    const next = { ...now };
    const kept: string[] = [];
    for (const field of changed) {
      const name = field.column;
      if (same(now[name], before[name]) || (isEmpty(now[name]) && isEmpty(before[name]))) {
        if (isEmpty(original[name])) delete next[name];
        else next[name] = original[name];
      } else if (!same(now[name], original[name])) {
        kept.push(field.label?.trim() || byName.get(name)?.label || words(name));
      }
    }
    setValues(next);
    setTyped((held) => {
      const rest = { ...held };
      for (const field of changed) if (!kept.includes(field.column)) delete rest[field.column];
      return rest;
    });
    if (kept.length > 0)
      setNote(
        `${kept.join(", ")} ${kept.length === 1 ? "was" : "were"} changed by someone else. What you typed is kept.`,
      );
  }, [original]);

  const info = (field: FieldConfig) => {
    const column = byName.get(field.column) as FormColumn;
    const kind = kindOf(column);
    return {
      column,
      kind,
      // The server's own rule: asked for when the column is required and has no default.
      required: field.required ?? (edit ? column.required === true : mustGive(column)),
      label: field.label?.trim() || column.label || words(column.name),
    };
  };

  const set = (name: string, value: unknown) => {
    setValues((now) => {
      const next = { ...now };
      if (isEmpty(value)) delete next[name];
      else next[name] = value;
      return next;
    });
    setErrors((now) => {
      if (!(name in now)) return now;
      const { [name]: _gone, ...rest } = now;
      return rest;
    });
    setFailure(undefined);
    setNote(undefined);
  };

  /** Problems with the values, before anything is sent, by column. */
  const check = (): Record<string, string> => {
    const found: Record<string, string> = {};
    const properties: Record<string, JsonSchema> = {};
    const subject: Values = {};
    for (const field of fields) {
      const { column, kind, required } = info(field);
      if (kind === "json") {
        const text = typed[column.name] ?? jsonText(values[column.name]);
        if (readJson(text).ok === false) found[column.name] = "This is not valid JSON.";
        else if (required && text.trim() === "") found[column.name] = "This is required.";
        continue;
      }
      const value = values[column.name];
      const typedWrong = problems[column.name];
      if (typedWrong) {
        found[column.name] = typedWrong;
        continue;
      }
      if (required && isEmpty(value)) {
        found[column.name] = "This is required.";
        continue;
      }
      properties[column.name] = schemaOf(column, kind);
      if (!isEmpty(value)) subject[column.name] = value;
    }
    const checked = checkValue({ type: "object", properties }, subject);
    for (const [pointer, message] of Object.entries(checked)) {
      const name = pointer.replace(/^\//, "").split("/")[0] ?? "";
      if (name && !found[name]) found[name] = message;
    }
    return found;
  };

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (off || !act) return;
    setFailure(undefined);
    setNote(undefined);
    const found = check();
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first !== undefined) {
      const control = form.current?.querySelector(`[name="${CSS.escape(first)}"]`);
      if (control instanceof HTMLElement) control.focus();
      return;
    }

    const inputs: Values = {};
    for (const field of fields) {
      const { column, kind } = info(field);
      let value: unknown = values[column.name];
      if (kind === "json") {
        const text = typed[column.name] ?? jsonText(value);
        value = readJson(text).value;
      }
      if (edit) {
        const before = original?.[column.name];
        if (same(before, value)) continue;
        inputs[column.name] = isEmpty(value) ? null : value;
      } else if (!isEmpty(value)) {
        inputs[column.name] = value;
      }
    }
    if (edit && Object.keys(inputs).length === 0) {
      setNote("Nothing has changed yet.");
      return;
    }

    const id = original?.id;
    setPending(true);
    let outcome: Awaited<ReturnType<typeof act>>;
    try {
      outcome = await act("config/submit", {
        ...(edit && id !== undefined ? { record: String(id) } : {}),
        inputs,
      });
    } catch (caught) {
      setPending(false);
      setFailure(caught instanceof Error ? caught.message : "It could not be sent. Try again.");
      return;
    }
    setPending(false);
    if (outcome.ok) {
      if (!edit) {
        setValues(begin());
        setTyped({});
        setProblems({});
        setErrors({});
      }
      return;
    }
    if ("cancelled" in outcome) return;
    const fromServer: Record<string, string> = {};
    for (const [path, message] of Object.entries(outcome.fields ?? {})) {
      fromServer[columnOf(path)] = message;
    }
    setErrors(fromServer);
    setFailure(outcome.message);
  };

  const sections: { title: string | undefined; fields: FieldConfig[] }[] = [];
  for (const field of fields) {
    const last = sections[sections.length - 1];
    const title = field.section?.trim() || undefined;
    if (last && last.title === title) last.fields.push(field);
    else sections.push({ title, fields: [field] });
  }

  if (fields.length === 0) {
    return building ? (
      <p className="m-0 text-ink-muted">Choose the fields in the Display tab.</p>
    ) : null;
  }

  const draw = (field: FieldConfig) => {
    const { column, kind, required, label } = info(field);
    const name = column.name;
    const common = {
      name,
      label,
      required,
      disabled: off,
      // A field shown in another unit than it is kept in (dollars, kept as cents) doesn't
      // borrow the column's description, which speaks of how it is kept.
      ...(field.help
        ? { hint: field.help }
        : column.description && !field.format
          ? { hint: column.description }
          : {}),
      error: errors[name],
    };
    const held = values[name];

    if (kind === "reference") {
      return (
        <ReferenceField
          key={name}
          column={column}
          label={label}
          hint={common.hint}
          error={errors[name]}
          required={required}
          disabled={off}
          value={held}
          choices={building ? undefined : choices}
          onChange={(next) => set(name, next)}
        />
      );
    }
    if (holdsList(column) && kind === "enum") {
      const options: Option[] = (column.values ?? []).map((one) => ({
        value: one.value,
        label: one.label ?? one.value,
      }));
      return (
        <MultiSelectField
          key={name}
          label={label}
          {...(common.hint ? { hint: common.hint } : {})}
          error={errors[name]}
          required={required}
          options={options}
          value={Array.isArray(held) ? (held as string[]) : []}
          disabled={off}
          onChange={(next) => set(name, next)}
        />
      );
    }
    switch (kind) {
      case "file":
        // A form cannot take a file to a row yet: said at the field, never a box to type an id in.
        return (
          <div key={name} data-form-file={name} className="flex min-w-0 flex-col gap-1">
            <span className="text-label font-medium text-ink">{label}</span>
            <p className="m-0 text-body-sm text-ink-muted">
              A file cannot be added in a form. Add it to the row in the table.
            </p>
          </div>
        );
      case "boolean":
        return (
          <CheckboxField
            key={name}
            {...common}
            checked={held === true}
            onChange={(checked) => set(name, checked)}
          />
        );
      case "enum": {
        const options = [
          { value: "", label: required ? "Choose one" : "None" },
          ...(column.values ?? []).map((one) => ({
            value: one.value,
            label: one.label ?? one.value,
          })),
        ];
        return (
          <SelectField
            key={name}
            {...common}
            options={options}
            value={typeof held === "string" ? held : ""}
            onChange={(next) => set(name, next === "" ? undefined : next)}
          />
        );
      }
      case "integer":
      case "number":
        return (
          <NumberField
            key={name}
            {...common}
            step={kind === "integer" ? 1 : 0.01}
            value={typeof held === "number" ? held : undefined}
            onChange={(next) => set(name, next)}
          />
        );
      case "money": {
        const money = moneyOf(column);
        // The column's own words speak of how it is kept ("in cents"); this field says the currency.
        const { hint: _kept, ...rest } = common;
        return (
          <MoneyField
            key={name}
            {...rest}
            {...(field.help ? { hint: field.help } : {})}
            currency={money.currency}
            minorUnits={money.minorUnits}
            value={typeof held === "number" ? held : undefined}
            onChange={(next, problem) => {
              set(name, next);
              setProblems((now) => {
                if (problem === undefined) {
                  if (!(name in now)) return now;
                  const { [name]: _dropped, ...kept } = now;
                  return kept;
                }
                return { ...now, [name]: problem };
              });
            }}
          />
        );
      }
      case "date":
        return (
          <DateField
            key={name}
            {...common}
            value={typeof held === "string" ? held.slice(0, 10) : ""}
            onChange={(next) => set(name, next === "" ? undefined : next)}
          />
        );
      case "timestamp":
        return (
          <DateField
            key={name}
            {...common}
            withTime
            // Typed on the reader's clock and kept as the moment it is, with its zone (D21).
            value={typeof held === "string" ? localTime(held) : ""}
            onChange={(next) => set(name, next === "" ? undefined : instantOf(next))}
          />
        );
      case "longtext":
      case "json":
        return (
          <TextAreaField
            key={name}
            {...common}
            rows={kind === "json" ? 5 : 4}
            value={
              kind === "json"
                ? (typed[name] ?? jsonText(held))
                : typeof held === "string"
                  ? held
                  : ""
            }
            onChange={(next) => {
              if (kind === "json") {
                setTyped((now) => ({ ...now, [name]: next }));
                setErrors((now) => {
                  const { [name]: _gone, ...rest } = now;
                  return rest;
                });
              } else set(name, next);
            }}
          />
        );
      default:
        return (
          <TextField
            key={name}
            {...common}
            value={typeof held === "string" ? held : held === undefined ? "" : String(held)}
            onChange={(next) => set(name, next)}
          />
        );
    }
  };

  return (
    <FieldMarks value="required">
      <form
        ref={form}
        noValidate
        aria-busy={pending}
        onSubmit={submit}
        className="flex min-w-0 flex-col gap-4"
      >
        {failure ? <Notice tone="danger">{failure}</Notice> : null}
        {note ? <Notice tone="plain">{note}</Notice> : null}
        {sections.map((section, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: sections have no id; their order is their identity
            key={index}
            className="flex min-w-0 flex-col gap-4"
          >
            {section.title ? (
              <h3 className="m-0 border-line border-b pb-1 text-body-sm font-semibold text-ink">
                {section.title}
              </h3>
            ) : null}
            {/* Two across once the form has the room (a large modal, a wide page); long text takes the row. */}
            <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-4 @[34rem]/cell:grid-cols-2">
              {section.fields.map((field) => {
                const { kind, column } = info(field);
                const whole = kind === "longtext" || kind === "json" || holdsList(column);
                return (
                  <div
                    key={field.column}
                    className={`min-w-0 ${whole ? "@[34rem]/cell:col-span-2" : ""}`}
                  >
                    {draw(field)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {/* The buttons as people will see them. While building they are drawn and do nothing. */}
        <div
          // In a modal or sheet the buttons stay at the foot of what is seen, over the fields that
          // scroll under them, so that Create is always there to press.
          className={
            onClose && !building
              ? "sticky -bottom-4 z-[1] -mx-5 -mb-4 flex flex-wrap justify-end gap-2 border-line border-t bg-surface px-5 py-3"
              : "flex flex-wrap justify-end gap-2"
          }
          {...(building ? { inert: true } : {})}
        >
          {onClose ? (
            <Button disabled={pending} onClick={onClose}>
              Cancel
            </Button>
          ) : null}
          <Button
            type={building ? "button" : "submit"}
            variant="primary"
            loading={pending}
            disabled={pending || (!building && !act)}
          >
            {config.submitLabel ?? "Save"}
          </Button>
        </div>
        {building ? (
          <p className="m-0 text-body-sm text-ink-muted">
            Sends with: {fields.map((field) => info(field).label).join(", ")}
          </p>
        ) : null}
      </form>
    </FieldMarks>
  );
}

/**
 * A reference: the rows it may point to, searched on the server as the person
 * types. The names of what was read are kept, so a chosen row keeps its name
 * when the list changes.
 */
function ReferenceField({
  column,
  label,
  hint,
  error,
  required,
  disabled,
  value,
  choices,
  onChange,
}: {
  column: FormColumn;
  label: string;
  hint: string | undefined;
  error: string | undefined;
  required: boolean;
  disabled: boolean;
  value: unknown;
  choices: FormViewProps["choices"] | undefined;
  onChange: (value: unknown) => void;
}) {
  const [found, setFound] = useState<Option[]>([]);
  const [failed, setFailed] = useState(false);
  const known = useRef(new Map<string, string>());
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(
    (typed: string) => {
      if (!choices) return;
      const mine = ++latest.current;
      choices("record", column.name, typed).then(
        (list) => {
          if (mine !== latest.current) return;
          for (const one of list) known.current.set(one.value, one.label);
          setFailed(false);
          setFound(list.map((one) => ({ value: one.value, label: one.label })));
        },
        () => {
          if (mine === latest.current) setFailed(true);
        },
      );
    },
    [choices, column.name],
  );

  useEffect(() => {
    search("");
    return () => clearTimeout(timer.current);
  }, [search]);

  const many = column.multiple === true;
  const chosen = many
    ? Array.isArray(value)
      ? (value as string[])
      : []
    : typeof value === "string"
      ? [value]
      : [];
  // Whatever is chosen stays in the list, under the name it was read with.
  const options: Option[] = [...found];
  for (const one of chosen) {
    if (!options.some((option) => option.value === one)) {
      options.push({ value: one, label: known.current.get(one) ?? one });
    }
  }
  const problem = failed ? "The list could not be read. Try typing again." : error;
  const shared = {
    label,
    ...(hint ? { hint } : {}),
    error: problem,
    required,
    options,
    disabled,
    placeholder: `Search ${label.toLowerCase()}`,
  };
  return many ? (
    <MultiSelectField {...shared} value={chosen} onChange={(next) => onChange(next)} />
  ) : (
    <ComboboxField
      {...shared}
      value={chosen[0]}
      onChange={(next) => onChange(next)}
      onSearch={(typed) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => search(typed), PAUSE);
      }}
    />
  );
}
