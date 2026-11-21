import {
  Button,
  CheckboxField,
  ComboboxField,
  checkValue,
  DateField,
  EmptyState,
  type JsonSchema,
  MultiSelectField,
  Notice,
  NumberField,
  type Option,
  SelectField,
  TextAreaField,
  TextField,
} from "@volvel/ui";
import type { ColumnInfo, RecordData, WidgetViewProps } from "@volvel/widgets";
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
  | "json";

function kindOf(column: FormColumn): Kind {
  const type = column.type.toLowerCase();
  if (type === "reference") return "reference";
  if (type === "enum") return "enum";
  if (type === "boolean") return "boolean";
  if (type === "date") return "date";
  if (type === "timestamp") return "timestamp";
  if (type === "json") return "json";
  if (type === "money" || column.format?.style === "currency") return "money";
  if (type === "integer") return "integer";
  if (type === "number") return "number";
  if (typeof column.maxLength === "number" && column.maxLength > 1000) return "longtext";
  if (column.format && (column.format as { style?: string }).style === "textarea")
    return "longtext";
  return "text";
}

/** Money is held as minor units, and drawn and typed as dollars unless the format says whole units. */
const perUnit = (column: FormColumn) => (column.format?.minorUnits === false ? 1 : 100);

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
      return {};
    default:
      one = { type: "string" };
  }
  return column.multiple ? { type: "array", items: one } : one;
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

/** What the form starts with: the record's values for the fields, or nothing. */
function startValues(fields: readonly FieldConfig[], record: Values | null): Values {
  const out: Values = {};
  if (!record) return out;
  for (const field of fields) {
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
  // A record read again, or another one, starts the fields again.
  const key = `${edit ? "edit" : "create"}:${JSON.stringify(input.record ?? null)}`;
  return <FormBody key={key} {...props} record={input} />;
}

function FormBody({
  config,
  record: data,
  building,
  act,
  choices,
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
  const begin = useCallback(() => startValues(fields, original), [fields, original]);

  const [values, setValues] = useState<Values>(begin);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [note, setNote] = useState<string>();
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const off = building || pending;

  const info = (field: FieldConfig) => {
    const column = byName.get(field.column) as FormColumn;
    const kind = kindOf(column);
    return {
      column,
      kind,
      required: field.required ?? column.required ?? false,
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
      if (required && isEmpty(value)) {
        found[column.name] = "This is required.";
        continue;
      }
      properties[column.name] = schemaOf(column, kind);
      if (!isEmpty(value)) subject[column.name] = value;
    }
    const problems = checkValue({ type: "object", properties }, subject);
    for (const [pointer, message] of Object.entries(problems)) {
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
        setValues({});
        setTyped({});
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
      ...(field.help
        ? { hint: field.help }
        : column.description
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
          disabled={off}
          value={held}
          choices={building ? undefined : choices}
          onChange={(next) => set(name, next)}
        />
      );
    }
    if (column.multiple && kind === "enum") {
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
          options={options}
          value={Array.isArray(held) ? (held as string[]) : []}
          disabled={off}
          onChange={(next) => set(name, next)}
        />
      );
    }
    switch (kind) {
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
        const divide = perUnit(column);
        const hint = common.hint
          ? common.hint
          : column.format?.currency && column.format.currency !== "USD"
            ? `In ${column.format.currency}.`
            : "In dollars.";
        return (
          <NumberField
            key={name}
            {...common}
            hint={hint}
            step={divide === 1 ? 1 : 0.01}
            value={typeof held === "number" ? held / divide : undefined}
            onChange={(next) =>
              set(name, next === undefined ? undefined : Math.round(next * divide))
            }
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
            timeZone="UTC"
            value={typeof held === "string" ? held : ""}
            onChange={(next) => set(name, next === "" ? undefined : next)}
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
    <form
      ref={form}
      noValidate
      aria-busy={pending}
      onSubmit={submit}
      className="flex min-w-0 max-w-xl flex-col gap-4"
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
          {section.fields.map(draw)}
        </div>
      ))}
      {building ? (
        <p className="m-0 text-body-sm text-ink-muted">
          Sends with: {fields.map((field) => info(field).label).join(", ")}
        </p>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {onClose ? (
            <Button disabled={pending} onClick={onClose}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" variant="primary" loading={pending} disabled={pending || !act}>
            {config.submitLabel ?? "Save"}
          </Button>
        </div>
      )}
    </form>
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
  disabled,
  value,
  choices,
  onChange,
}: {
  column: FormColumn;
  label: string;
  hint: string | undefined;
  error: string | undefined;
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
