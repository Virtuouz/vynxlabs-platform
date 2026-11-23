import { COLUMN_WIDENINGS } from "@volvel/manifest";
import {
  Button,
  ComboboxField,
  DateField,
  Dialog,
  localWall,
  MultiSelectField,
  Notice,
  parseValue,
  SelectField,
  TextField,
} from "@volvel/ui";
import { useState } from "react";
import { useLoad } from "../api.ts";
import { failureText } from "../ask.tsx";

/** What a column can hold, as people read it. */
export const COLUMN_TYPES: { value: string; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "integer", label: "Whole number" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes or no" },
  { value: "timestamp", label: "Date and time" },
  { value: "date", label: "Date" },
  { value: "json", label: "JSON" },
  { value: "uuid", label: "ID" },
  { value: "reference", label: "Row of another table" },
  { value: "file", label: "File" },
  { value: "enum", label: "One of a list" },
  { value: "enum_list", label: "Several of a list" },
];

/** A comma-separated list as its words. */
export const wordsOf = (text: string) =>
  text
    .split(",")
    .map((one) => one.trim())
    .filter(Boolean);

/** What a column's value is called in a list of values, in the shapes a definition may write one. */
type ValueEntry = string | { value: string; label?: string };
const valueName = (one: ValueEntry) => (typeof one === "string" ? one : one.value);

/** Types that cannot be given a value for rows that have none. */
export const hasNoDefault = (type: string) => type === "reference" || type === "file";

/** A default as the text its control holds. */
export function defaultText(type: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (type === "enum_list" && Array.isArray(value)) return value.join(", ");
  if (type === "json" || typeof value === "object") return JSON.stringify(value);
  if (type === "timestamp" && typeof value === "string") return localWall(value, "T");
  return String(value);
}

/**
 * The value a column takes when a row gives none, in the column's own control: a choice for a
 * yes/no or a list, a date for a day or a moment, a box otherwise. The text it holds is read with
 * `parseValue`, so what is refused there is said under the field.
 */
export function DefaultField({
  type,
  values,
  value,
  error,
  onChange,
  label = "Value when none is given",
  hint,
}: {
  type: string;
  values?: ValueEntry[] | undefined;
  value: string;
  error?: string | undefined;
  onChange: (text: string) => void;
  label?: string;
  hint?: string;
}) {
  const offered = (values ?? []).map((one) => ({
    value: valueName(one),
    label: typeof one === "string" ? one : (one.label ?? one.value),
  }));
  if (hasNoDefault(type)) return null;
  if (type === "boolean") {
    return (
      <SelectField
        name="fallback"
        label={label}
        value={value}
        options={[
          { value: "", label: "None" },
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
        error={error}
        onChange={onChange}
        {...(hint ? { hint } : {})}
      />
    );
  }
  if (type === "enum") {
    return (
      <SelectField
        name="fallback"
        label={label}
        value={value}
        options={[{ value: "", label: "None" }, ...offered]}
        error={error}
        onChange={onChange}
        {...(hint ? { hint } : {})}
      />
    );
  }
  if (type === "enum_list") {
    return (
      <MultiSelectField
        label={label}
        value={wordsOf(value)}
        options={offered}
        error={error}
        onChange={(next) => onChange(next.join(","))}
        {...(hint ? { hint } : {})}
      />
    );
  }
  if (type === "date" || type === "timestamp") {
    return (
      <DateField
        name="fallback"
        label={label}
        value={value}
        required={false}
        {...(type === "timestamp" ? { withTime: true } : {})}
        error={error}
        onChange={onChange}
        {...(hint ? { hint } : {})}
      />
    );
  }
  return (
    <TextField
      name="fallback"
      label={label}
      value={value}
      required={false}
      error={error}
      onChange={onChange}
      {...(hint ? { hint } : { hint: "Optional." })}
    />
  );
}

/** What of a column the dialogs below read. */
export interface ColumnShape {
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
  default: unknown;
  references: string | null;
  values?: ValueEntry[] | undefined;
}

/** The body of a column in a table's definition, which a dialog changes in place. */
export type ColumnBody = Record<string, unknown>;

function useSaving(onSave: () => Promise<void>, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  // Why the save was refused: said here, with what was entered kept, until saved or canceled.
  const [error, setError] = useState<string>();
  return {
    busy,
    error,
    setError,
    save: async () => {
      setBusy(true);
      setError(undefined);
      try {
        await onSave();
        onClose();
      } catch (caught) {
        setError(failureText(caught));
      } finally {
        setBusy(false);
      }
    },
  };
}

const Buttons = ({
  busy,
  onClose,
  onSave,
  action = "Save",
}: {
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  action?: string;
}) => (
  <div className="flex justify-end gap-2">
    <Button onClick={onClose}>Cancel</Button>
    <Button variant="primary" loading={busy} onClick={onSave}>
      {action}
    </Button>
  </div>
);

/**
 * What every row must have for a column: whether it must have one, whether two rows may share
 * one, and what stands in for one that is not given. Saved together, since each depends on the
 * others: a column made required needs a value for the rows that have none.
 */
export function ColumnRulesDialog({
  column,
  open,
  onClose,
  onSave,
}: {
  column: ColumnShape;
  open: boolean;
  onClose: () => void;
  onSave: (edit: (body: ColumnBody) => void) => Promise<void>;
}) {
  const [required, setRequired] = useState(column.required ? "yes" : "no");
  const [unique, setUnique] = useState(column.unique ? "yes" : "no");
  const [fallback, setFallback] = useState(defaultText(column.type, column.default));
  const [problem, setProblem] = useState<string>();
  const canBeUnique = !["json", "file", "enum_list"].includes(column.type);
  const saving = useSaving(async () => {
    setProblem(undefined);
    let given: unknown = null;
    try {
      given = hasNoDefault(column.type) ? null : parseValue(column.type, fallback);
    } catch (caught) {
      setProblem((caught as Error).message);
      throw new Error("Fix the value for rows that give none, then save.");
    }
    await onSave((body) => {
      if (required === "yes") body.required = true;
      else delete body.required;
      if (canBeUnique && unique === "yes") body.unique = true;
      else delete body.unique;
      if (given === null || given === undefined) delete body.default;
      else body.default = given;
    });
  }, onClose);
  return (
    <Dialog open={open} onClose={onClose} title={`Rules for ${column.name}`}>
      <div className="flex flex-col gap-4">
        <SelectField
          name="required"
          label="Must every row have one?"
          value={required}
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
          {...(required === "yes" && !column.required
            ? {
                hint: "Rows that have none now are given the value below. Without one, the change is refused.",
              }
            : {})}
          onChange={setRequired}
        />
        {canBeUnique ? (
          <SelectField
            name="unique"
            label="Must every row's value be different?"
            value={unique}
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes: no two rows alike" },
            ]}
            {...(unique === "yes" && !column.unique
              ? {
                  hint: "If some rows already share a value, the change is refused and names them.",
                }
              : {})}
            onChange={setUnique}
          />
        ) : null}
        <DefaultField
          type={column.type}
          values={column.values}
          value={fallback}
          error={problem}
          onChange={setFallback}
        />
        {saving.error ? <Notice tone="danger">{saving.error}</Notice> : null}
        <Buttons busy={saving.busy} onClose={onClose} onSave={() => void saving.save()} />
      </div>
    </Dialog>
  );
}

/** The types a column of this type may become without risking what it holds. */
export function typesFrom(type: string): string[] {
  return [
    type,
    ...(COLUMN_WIDENINGS[type] ?? []),
    // A text column becomes a list when its rows hold nothing else: the rows are asked.
    ...(type === "text" ? ["enum"] : []),
  ];
}

/** A table's name for a reference to choose among. */
function TableChoice({
  root,
  value,
  onChange,
  label,
  error,
}: {
  root: string;
  value: string;
  onChange: (name: string) => void;
  label: string;
  error?: string | undefined;
}) {
  const tables = useLoad<{ items: { name: string; status: string }[] }>(`${root}/tables`);
  const names = (tables.data?.items ?? [])
    .filter((table) => table.status === "active")
    .map((table) => table.name);
  return (
    <ComboboxField
      label={label}
      options={[...new Set([...(value ? [value] : []), ...names])].map((name) => ({
        value: name,
        label: name,
      }))}
      value={value || undefined}
      placeholder={tables.data ? "Choose a table" : "Loading…"}
      empty={tables.data ? "No table to choose." : "Loading…"}
      error={error ?? (tables.error ? tables.error.message : undefined)}
      onChange={(next) => onChange(next ?? "")}
    />
  );
}

/**
 * Changes what a column holds, offering only what cannot lose its rows' data, or for a column
 * that points to another table, which table. The platform checks the rows.
 */
export function ChangeTypeDialog({
  root,
  column,
  open,
  onClose,
  onSave,
}: {
  root: string;
  column: ColumnShape;
  open: boolean;
  onClose: () => void;
  onSave: (edit: (body: ColumnBody) => void) => Promise<void>;
}) {
  const reference = column.type === "reference";
  const [type, setType] = useState(column.type);
  const [values, setValues] = useState("");
  const [table, setTable] = useState(column.references ?? "");
  const [problem, setProblem] = useState<string>();
  const options = typesFrom(column.type);
  const saving = useSaving(async () => {
    setProblem(undefined);
    if (reference && !table) {
      setProblem("Choose the table it points to.");
      throw new Error("Choose a table, then save.");
    }
    if (type === "enum" && column.type !== "enum" && wordsOf(values).length === 0) {
      setProblem("Enter the values it may hold, separated by commas.");
      throw new Error("A list needs at least one value.");
    }
    await onSave((body) => {
      if (reference) {
        body.references = table;
        return;
      }
      if (type === column.type) return;
      body.type = type;
      if (type === "enum") body.values = wordsOf(values);
      else delete body.values;
      // A default is the column's own kind of value: as text, it is the same value written out.
      if (type === "text" && body.default !== undefined && body.default !== null) {
        body.default = defaultText(column.type, body.default);
      }
    });
  }, onClose);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={reference ? `Which table ${column.name} points to` : `What ${column.name} holds`}
    >
      <div className="flex flex-col gap-4">
        {reference ? (
          <TableChoice
            root={root}
            label="The table it points to"
            value={table}
            error={problem}
            onChange={setTable}
          />
        ) : options.length > 1 ? (
          <>
            <SelectField
              name="type"
              label="It holds"
              value={type}
              options={options.map((one) => ({
                value: one,
                label: COLUMN_TYPES.find((entry) => entry.value === one)?.label ?? one,
              }))}
              hint="Only changes that keep every value are offered. For any other, add a new column and copy the values across in a script."
              onChange={setType}
            />
            {type === "enum" && column.type !== "enum" ? (
              <TextField
                name="values"
                label="Values"
                value={values}
                required={false}
                placeholder="new, paid, shipped"
                hint="Separated by commas. Allowed when every row already holds one of them."
                error={problem}
                onChange={setValues}
              />
            ) : null}
          </>
        ) : (
          <p className="m-0 max-w-measure text-ink-muted">
            A column of this kind cannot become another without risking what it holds. Add a new
            column, copy the values across in a script, then retire this one.
          </p>
        )}
        {saving.error ? <Notice tone="danger">{saving.error}</Notice> : null}
        {reference || options.length > 1 ? (
          <Buttons busy={saving.busy} onClose={onClose} onSave={() => void saving.save()} />
        ) : (
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** The most indexes a table may have, and the most columns in one: what a definition allows. */
export const MAX_INDEXES = 20;
export const MAX_INDEX_COLUMNS = 5;

/**
 * An index on columns that rows are filtered or sorted by, so that a read of a large table is
 * not stopped for taking too long. The order the columns are chosen in is the order of the index.
 * The columns the platform fills in may be named too.
 */
export function IndexDialog({
  columns,
  existing,
  open,
  onClose,
  onSave,
}: {
  columns: string[];
  existing: string[][];
  open: boolean;
  onClose: () => void;
  onSave: (columns: string[]) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [problem, setProblem] = useState<string>();
  const saving = useSaving(async () => {
    setProblem(undefined);
    if (chosen.length === 0) {
      setProblem("Choose at least one column.");
      throw new Error("Choose the columns to index, then save.");
    }
    if (existing.some((one) => one.join("\u0000") === chosen.join("\u0000"))) {
      setProblem("There is already an index on these columns, in this order.");
      throw new Error("Choose other columns, or another order.");
    }
    await onSave(chosen);
  }, onClose);
  return (
    <Dialog open={open} onClose={onClose} title="Add an index">
      <div className="flex flex-col gap-4">
        <MultiSelectField
          label="Columns"
          inline
          value={chosen}
          options={columns.map((name) => ({ value: name, label: name }))}
          error={chosen.length > MAX_INDEX_COLUMNS ? `At most ${MAX_INDEX_COLUMNS}.` : problem}
          hint={`Up to ${MAX_INDEX_COLUMNS}, in the order they are filtered or sorted by. Put the column rows are filtered by first.`}
          onChange={setChosen}
        />
        {saving.error ? <Notice tone="danger">{saving.error}</Notice> : null}
        <Buttons
          busy={saving.busy}
          onClose={onClose}
          onSave={() => {
            if (chosen.length > MAX_INDEX_COLUMNS) return;
            void saving.save();
          }}
          action="Add index"
        />
      </div>
    </Dialog>
  );
}
