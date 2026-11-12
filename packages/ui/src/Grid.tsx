import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

export interface GridColumn {
  name: string;
  /** What the column holds: text, integer, number, boolean, timestamp, date, json and so on. */
  type: string;
  /** Lets a cell be changed in place. */
  editable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
}

export interface GridSort {
  column: string;
  descending: boolean;
}

export interface GridProps<Row extends Record<string, unknown>> {
  /** Names the grid for screen readers: "Rows of orders". */
  label: string;
  columns: GridColumn[];
  rows: Row[];
  rowKey: (row: Row) => string;
  sort?: GridSort | undefined;
  /** Called with the column whose header was pressed. */
  onSort?: (column: string) => void;
  /** What is typed in the filter row, by column. */
  filters?: Record<string, string>;
  onFilter?: (column: string, text: string) => void;
  /** Saves one changed cell. A rejection's message is shown in the cell. */
  onEdit?: (row: Row, column: string, value: unknown) => Promise<unknown>;
  /** Replaces how a cell is shown. Return undefined to keep the grid's own rendering. */
  cell?: (row: Row, column: GridColumn) => ComponentChildren | undefined;
  rowActions?: (row: Row) => ComponentChildren;
  /** Shown in place of the rows when there are none. */
  empty: ComponentChildren;
}

const NUMERIC = new Set(["integer", "number"]);

/** A stored value as text a person can read and edit. */
export function showValue(type: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (type === "json" || typeof value === "object") return JSON.stringify(value);
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "timestamp" && typeof value === "string") {
    const at = new Date(value);
    if (!Number.isNaN(at.getTime())) {
      return at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }
  }
  return String(value);
}

/** The text a cell is edited as: the stored value, not its friendly form. */
function editText(type: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (type === "json" || typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Turns typed text into a value of the column's type. Empty text means no value.
 * Throws with a message for text that cannot be that type.
 */
export function parseValue(type: string, text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (NUMERIC.has(type)) {
    const number = Number(trimmed);
    if (Number.isNaN(number)) throw new Error("Enter a number.");
    if (type === "integer" && !Number.isInteger(number)) throw new Error("Enter a whole number.");
    return number;
  }
  if (type === "boolean") {
    if (/^(true|yes|y|1)$/i.test(trimmed)) return true;
    if (/^(false|no|n|0)$/i.test(trimmed)) return false;
    throw new Error("Enter yes or no.");
  }
  if (type === "json") {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error("Enter valid JSON.");
    }
  }
  return type === "text" ? text : trimmed;
}

function EditableCell<Row extends Record<string, unknown>>({
  row,
  column,
  shown,
  onEdit,
}: {
  row: Row;
  column: GridColumn;
  shown: ComponentChildren;
  onEdit: NonNullable<GridProps<Row>["onEdit"]>;
}) {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const value = row[column.name];

  const save = async (next: unknown) => {
    setBusy(true);
    setError(undefined);
    try {
      await onEdit(row, column.name, next);
      setText(undefined);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (column.type === "boolean") {
    return (
      <span class="flex flex-col gap-0.5">
        <input
          type="checkbox"
          class="size-4 accent-(--vx-action)"
          checked={value === true}
          disabled={busy}
          aria-label={column.name}
          onChange={(event) => save(event.currentTarget.checked)}
        />
        {error ? (
          <span role="alert" class="text-xs text-danger">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  if (text === undefined) {
    return (
      <button
        type="button"
        title="Change this value"
        class={`-mx-1.5 block min-h-6 w-[calc(100%+0.75rem)] cursor-text rounded-[4px] px-1.5 text-inherit hover:bg-sunken ${
          NUMERIC.has(column.type) ? "text-right" : "text-left"
        }`}
        onClick={() => setText(editText(column.type, value))}
      >
        {shown}
      </button>
    );
  }

  const commit = () => {
    if (text === editText(column.type, value)) return setText(undefined);
    try {
      return save(parseValue(column.type, text));
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  return (
    <span class="flex flex-col gap-0.5">
      <input
        // biome-ignore lint/a11y/noAutofocus: the person just asked to edit this cell
        autoFocus
        aria-label={column.name}
        aria-invalid={error !== undefined}
        value={text}
        disabled={busy}
        class="-mx-1.5 h-7 w-[calc(100%+0.75rem)] min-w-24 rounded-[4px] border border-action bg-surface px-1.5 text-ink"
        onInput={(event) => setText(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setError(undefined);
            setText(undefined);
          }
        }}
      />
      {error ? (
        <span role="alert" class="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Rows and columns of data, with sorting, a filter under each heading and editing in place. */
export function Grid<Row extends Record<string, unknown>>(props: GridProps<Row>) {
  const { columns, rows, sort, filters, onFilter, onEdit } = props;
  const filterable = onFilter !== undefined && columns.some((column) => column.filterable);
  const width = columns.length + (props.rowActions ? 1 : 0);
  const head = "border-b border-line bg-sunken/50 px-3 text-[13px] font-medium text-ink-muted";

  return (
    <div class="overflow-x-auto rounded-panel border border-line bg-surface">
      <table class="w-full border-collapse text-left" aria-label={props.label}>
        <thead>
          <tr>
            {columns.map((column) => {
              const sorted = sort?.column === column.name ? sort : undefined;
              const end = NUMERIC.has(column.type) ? "text-right" : "";
              return (
                <th
                  key={column.name}
                  scope="col"
                  aria-sort={sorted ? (sorted.descending ? "descending" : "ascending") : undefined}
                  class={`${head} py-2 whitespace-nowrap ${end}`}
                >
                  {column.sortable && props.onSort ? (
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 font-medium text-inherit hover:text-ink"
                      onClick={() => props.onSort?.(column.name)}
                    >
                      {column.name}
                      <span aria-hidden="true" class={sorted ? "text-action" : "opacity-0"}>
                        {sorted?.descending ? "▼" : "▲"}
                      </span>
                    </button>
                  ) : (
                    column.name
                  )}
                </th>
              );
            })}
            {props.rowActions ? <th class={`${head} py-2`} /> : null}
          </tr>
          {filterable ? (
            <tr>
              {columns.map((column) => (
                <th key={column.name} class={`${head} pb-2 font-normal`}>
                  {column.filterable ? (
                    <input
                      aria-label={`Filter by ${column.name}`}
                      placeholder="Filter"
                      value={filters?.[column.name] ?? ""}
                      class="h-7 w-full min-w-20 rounded-[4px] border border-line bg-surface px-1.5 text-ink placeholder:text-ink-muted/60"
                      onChange={(event) => onFilter?.(column.name, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                  ) : null}
                </th>
              ))}
              {props.rowActions ? <th class={`${head} pb-2`} /> : null}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={width} class="px-3 py-6 text-ink-muted">
                {props.empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={props.rowKey(row)} class="border-b border-line last:border-b-0">
                {columns.map((column) => {
                  const value = row[column.name];
                  const custom = props.cell?.(row, column);
                  const shown =
                    custom !== undefined ? (
                      custom
                    ) : value === null || value === undefined ? (
                      <span class="text-ink-muted/60">empty</span>
                    ) : (
                      showValue(column.type, value)
                    );
                  return (
                    <td
                      key={column.name}
                      class={`max-w-80 truncate px-3 py-1.5 align-middle ${
                        NUMERIC.has(column.type) ? "text-right tabular-nums" : ""
                      }`}
                    >
                      {column.editable && onEdit && custom === undefined ? (
                        <EditableCell row={row} column={column} shown={shown} onEdit={onEdit} />
                      ) : (
                        shown
                      )}
                    </td>
                  );
                })}
                {props.rowActions ? (
                  <td class="px-3 py-1.5 text-right align-middle whitespace-nowrap">
                    {props.rowActions(row)}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
