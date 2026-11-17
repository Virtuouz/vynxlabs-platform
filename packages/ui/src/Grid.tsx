import { ChevronDown, ChevronUp } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useId, useRef, useState } from "react";

export interface GridColumn {
  name: string;
  /** What the heading says. The name, when left out. */
  label?: string | undefined;
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
  cell?: (row: Row, column: GridColumn) => ReactNode | undefined;
  rowActions?: (row: Row) => ReactNode;
  /** The key of the row that is chosen. */
  selectedKey?: string | undefined;
  /** Lets one row be chosen, and is called with it. Each row gets a button to choose it by. */
  onSelect?: ((row: Row) => void) | undefined;
  /** Shown in place of the rows when there are none. */
  empty: ReactNode;
  /**
   * `grid` follows the WAI-ARIA grid pattern: the grid is one tab stop, arrow
   * keys move between cells, Enter or F2 edits a cell and Escape puts it back,
   * the header stays in view and the first column stays put. Left out, each
   * value to change is a button of its own, as tenant apps have it.
   */
  navigation?: "grid";
  /** Row height, with `navigation="grid"`: compact rows are 28 px. */
  density?: "compact" | "standard";
  /** Rows chosen with checkboxes, with `navigation="grid"`, for something done to all of them. */
  checked?: Set<string>;
  onCheck?: (next: Set<string>) => void;
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
  editing,
  onEnd,
}: {
  row: Row;
  column: GridColumn;
  shown: ReactNode;
  onEdit: NonNullable<GridProps<Row>["onEdit"]>;
  /** Set by a navigable grid, which decides when a cell is edited. */
  editing?: boolean;
  /** Called when editing ends; `back` is true when focus should return to the cell. */
  onEnd?: (back: boolean) => void;
}) {
  const [own, setText] = useState<string>();
  // Set by Escape: the blur that follows as the input goes must not save what was typed.
  const cancelled = useRef(false);
  const controlled = editing !== undefined;
  const text = controlled
    ? editing
      ? (own ?? editText(column.type, row[column.name]))
      : undefined
    : own;
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const value = row[column.name];

  const save = async (next: unknown) => {
    setBusy(true);
    setError(undefined);
    try {
      await onEdit(row, column.name, next);
      setText(undefined);
      onEnd?.(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (column.type === "boolean" && !controlled) {
    return (
      <span className="flex flex-col gap-0.5">
        <input
          type="checkbox"
          className="size-4 accent-(--vx-action)"
          checked={value === true}
          disabled={busy}
          aria-label={column.name}
          onChange={(event) => save(event.currentTarget.checked)}
        />
        {error ? (
          <span role="alert" className="text-meta text-danger">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  if (text === undefined && controlled) {
    return (
      <span className="flex flex-col gap-0.5">
        <span>{shown}</span>
        {error ? (
          <span role="alert" className="text-meta text-danger">
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
        className={`-mx-1.5 block min-h-6 w-[calc(100%+0.75rem)] cursor-text rounded-inner px-1.5 text-inherit hover:bg-sunken ${
          NUMERIC.has(column.type) ? "text-right" : "text-left"
        }`}
        onClick={() => setText(editText(column.type, value))}
      >
        {shown}
      </button>
    );
  }

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text === editText(column.type, value)) {
      setText(undefined);
      onEnd?.(false);
      return;
    }
    try {
      return save(parseValue(column.type, text));
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  return (
    <span className="flex flex-col gap-0.5">
      <input
        // biome-ignore lint/a11y/noAutofocus: the person just asked to edit this cell
        autoFocus
        aria-label={column.name}
        aria-invalid={error !== undefined}
        value={text}
        disabled={busy}
        className="-mx-1.5 h-7 w-[calc(100%+0.75rem)] min-w-24 rounded-inner border border-action bg-surface px-1.5 text-ink"
        onChange={(event) => setText(event.currentTarget.value)}
        onFocus={() => {
          cancelled.current = false;
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          // The grid's own keys are not for a cell being edited.
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            // What was there before is put back, and the cell keeps focus.
            cancelled.current = true;
            setError(undefined);
            setText(undefined);
            onEnd?.(true);
          }
        }}
      />
      {error ? (
        <span role="alert" className="text-meta text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The grid of `navigation="grid"`: one tab stop, cells reached by the keys of
 * the WAI-ARIA grid pattern, a header that stays in view and a first column
 * that stays put.
 *
 * | Key | Does |
 * | Arrows | Move one cell |
 * | Home, End | The row's first or last cell; with Ctrl, the grid's |
 * | Page Up, Page Down | Ten rows |
 * | Enter, F2 | Edit the cell; on a heading, sort by it; on a cell that cannot be edited, choose the row |
 * | Escape | Leave an edit and put back what was there |
 * | Space | Check or uncheck the row |
 */
function NavigableGrid<Row extends Record<string, unknown>>(props: GridProps<Row>) {
  const { columns, rows, sort, filters, onFilter, onEdit, checked, onCheck } = props;
  const checking = checked !== undefined && onCheck !== undefined;
  const filterable = onFilter !== undefined && columns.some((column) => column.filterable);
  const offset = checking ? 1 : 0;
  const width = columns.length + offset;
  // Row 0 is the headings; rows 1 to n are the data. Column 0 is the checkbox when there is one.
  const [active, setActive] = useState({ r: 1, c: offset });
  const [editing, setEditing] = useState<string>();
  const table = useRef<HTMLTableElement>(null);
  const last = { r: rows.length, c: width - 1 };
  const at = {
    r: Math.min(active.r, last.r),
    c: Math.min(active.c, last.c),
  };
  const focus = (r: number, c: number) => {
    const next = { r: Math.max(0, Math.min(r, last.r)), c: Math.max(0, Math.min(c, last.c)) };
    setActive(next);
    requestAnimationFrame(() =>
      table.current?.querySelector<HTMLElement>(`[data-cell="${next.r}:${next.c}"]`)?.focus(),
    );
  };
  const pad = props.density === "compact" ? "py-1" : "py-1.5";
  const head = `border-b border-line-strong bg-sunken px-3 text-meta font-medium text-ink-subtle`;
  const all = rows.map((row) => props.rowKey(row));
  const toggle = (key: string) => {
    if (!checking) return;
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onCheck(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (editing !== undefined) return;
    const { r, c } = at;
    const to: [number, number] | undefined = (() => {
      switch (event.key) {
        case "ArrowRight":
          return [r, c + 1];
        case "ArrowLeft":
          return [r, c - 1];
        case "ArrowDown":
          return [r + 1, c];
        case "ArrowUp":
          return [r - 1, c];
        case "Home":
          return [event.ctrlKey || event.metaKey ? 1 : r, 0];
        case "End":
          return [event.ctrlKey || event.metaKey ? last.r : r, last.c];
        case "PageDown":
          return [r + 10, c];
        case "PageUp":
          return [Math.max(1, r - 10), c];
        default:
          return undefined;
      }
    })();
    if (to) {
      event.preventDefault();
      focus(to[0], to[1]);
      return;
    }
    const column = columns[c - offset];
    const row = r > 0 ? rows[r - 1] : undefined;
    if (event.key === " " && row && checking) {
      event.preventDefault();
      toggle(props.rowKey(row));
      return;
    }
    if (event.key !== "Enter" && event.key !== "F2") return;
    event.preventDefault();
    if (r === 0) {
      if (column?.sortable) props.onSort?.(column.name);
      else if (c === 0 && checking) onCheck(checked.size === all.length ? new Set() : new Set(all));
      return;
    }
    if (!row) return;
    if (column?.editable && onEdit && props.cell?.(row, column) === undefined) {
      if (column.type === "boolean") {
        void onEdit(row, column.name, row[column.name] !== true);
        return;
      }
      setEditing(`${r}:${c}`);
      return;
    }
    if (event.key === "Enter") props.onSelect?.(row);
  };

  const cellProps = (r: number, c: number) => ({
    "data-cell": `${r}:${c}`,
    tabIndex: at.r === r && at.c === c ? 0 : -1,
    onFocus: () => {
      if (at.r !== r || at.c !== c) setActive({ r, c });
    },
  });

  return (
    <div className="max-h-[70vh] overflow-auto rounded-panel border border-line bg-surface">
      <table
        ref={table}
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a table navigated cell by cell is a grid (WAI-ARIA grid pattern)
        role="grid"
        aria-label={props.label}
        aria-rowcount={rows.length + 1}
        aria-multiselectable={checking || undefined}
        className="w-full border-separate border-spacing-0 text-left"
        onKeyDown={onKeyDown}
      >
        <thead className="sticky top-0 layer-sticky">
          <tr>
            {checking ? (
              <th scope="col" className={`${head} sticky left-0 w-8 ${pad}`} {...cellProps(0, 0)}>
                <input
                  type="checkbox"
                  tabIndex={-1}
                  aria-label="Check every row on this page"
                  className="size-4 accent-(--vx-action)"
                  checked={all.length > 0 && checked.size === all.length}
                  onChange={() => onCheck(checked.size === all.length ? new Set() : new Set(all))}
                />
              </th>
            ) : null}
            {columns.map((column, index) => {
              const sorted = sort?.column === column.name ? sort : undefined;
              const pinned = index === 0 ? `sticky ${checking ? "left-8" : "left-0"}` : "";
              return (
                <th
                  key={column.name}
                  scope="col"
                  aria-sort={sorted ? (sorted.descending ? "descending" : "ascending") : undefined}
                  className={`${head} ${pad} whitespace-nowrap ${pinned} ${
                    NUMERIC.has(column.type) ? "text-right" : ""
                  } ${column.sortable && props.onSort ? "cursor-pointer hover:text-ink" : ""}`}
                  onClick={() => column.sortable && props.onSort?.(column.name)}
                  {...cellProps(0, index + offset)}
                >
                  {column.label ?? column.name}
                  {sorted ? (
                    <span aria-hidden="true" className="ml-1 inline-flex align-middle text-action">
                      {sorted.descending ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </span>
                  ) : null}
                </th>
              );
            })}
          </tr>
          {filterable ? (
            <tr>
              {checking ? <td className={`${head} sticky left-0 pb-2`} /> : null}
              {columns.map((column, index) => (
                <td
                  key={column.name}
                  className={`${head} pb-2 font-normal ${index === 0 ? `sticky ${checking ? "left-8" : "left-0"}` : ""}`}
                >
                  {column.filterable ? (
                    <input
                      aria-label={`Filter by ${column.label ?? column.name}`}
                      placeholder="Filter"
                      value={filters?.[column.name] ?? ""}
                      className="h-7 w-full min-w-20 rounded-inner border border-line-control bg-surface px-1.5 text-ink placeholder:text-ink-muted/60"
                      onChange={(event) => onFilter?.(column.name, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                  ) : null}
                </td>
              ))}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={width} className="px-3 py-6 text-ink-muted">
                {props.empty}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              const r = rowIndex + 1;
              const key = props.rowKey(row);
              const chosen = props.selectedKey === key;
              const ticked = checking && checked.has(key);
              const ground = chosen ? "bg-selected" : ticked ? "bg-action-soft/40" : "bg-surface";
              return (
                <tr
                  key={key}
                  aria-rowindex={r + 1}
                  aria-selected={checking ? ticked : chosen}
                  className={`${ground} hover:bg-sunken/60`}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("input, a, button")) return;
                    props.onSelect?.(row);
                  }}
                >
                  {checking ? (
                    <td
                      className={`sticky left-0 w-8 border-line border-b px-3 ${pad} ${ground}`}
                      {...cellProps(r, 0)}
                    >
                      <input
                        type="checkbox"
                        tabIndex={-1}
                        aria-label={`Check row ${key}`}
                        className="size-4 accent-(--vx-action)"
                        checked={ticked}
                        onChange={() => toggle(key)}
                      />
                    </td>
                  ) : null}
                  {columns.map((column, index) => {
                    const c = index + offset;
                    const value = row[column.name];
                    const custom = props.cell?.(row, column);
                    const shown =
                      custom !== undefined ? (
                        custom
                      ) : value === null || value === undefined ? (
                        <span className="text-ink-muted/60">empty</span>
                      ) : (
                        showValue(column.type, value)
                      );
                    const here = `${r}:${c}`;
                    return (
                      <td
                        key={column.name}
                        className={`max-w-80 truncate border-line border-b px-3 align-middle ${pad} ${
                          NUMERIC.has(column.type) ? "text-right tabular-nums" : ""
                        } ${index === 0 ? `sticky ${checking ? "left-8" : "left-0"} ${ground}` : ""}`}
                        onDoubleClick={() => {
                          if (column.editable && onEdit && custom === undefined) {
                            setActive({ r, c });
                            setEditing(here);
                          }
                        }}
                        {...cellProps(r, c)}
                      >
                        {column.editable && onEdit && custom === undefined ? (
                          <EditableCell
                            row={row}
                            column={column}
                            shown={shown}
                            onEdit={onEdit}
                            editing={editing === here}
                            onEnd={(back) => {
                              setEditing(undefined);
                              if (back) focus(r, c);
                            }}
                          />
                        ) : (
                          shown
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Rows and columns of data, with sorting, a filter under each heading and editing in place. */
export function Grid<Row extends Record<string, unknown>>(props: GridProps<Row>) {
  return props.navigation === "grid" ? <NavigableGrid {...props} /> : <PlainGrid {...props} />;
}

/** The grid tenant apps have had: each value to change is a button of its own. */
function PlainGrid<Row extends Record<string, unknown>>(props: GridProps<Row>) {
  const { columns, rows, sort, filters, onFilter, onEdit } = props;
  const filterable = onFilter !== undefined && columns.some((column) => column.filterable);
  const choosing = props.onSelect !== undefined;
  const group = useId();
  const width = columns.length + (props.rowActions ? 1 : 0) + (choosing ? 1 : 0);
  const head = "border-b border-line bg-sunken/50 px-3 text-body-sm font-medium text-ink-muted";

  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-surface">
      <table className="w-full border-collapse text-left" aria-label={props.label}>
        <thead>
          <tr>
            {choosing ? <th className={`${head} w-8 py-2`} /> : null}
            {columns.map((column) => {
              const sorted = sort?.column === column.name ? sort : undefined;
              const end = NUMERIC.has(column.type) ? "text-right" : "";
              return (
                <th
                  key={column.name}
                  scope="col"
                  aria-sort={sorted ? (sorted.descending ? "descending" : "ascending") : undefined}
                  className={`${head} py-2 whitespace-nowrap ${end}`}
                >
                  {column.sortable && props.onSort ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium text-inherit hover:text-ink"
                      onClick={() => props.onSort?.(column.name)}
                    >
                      {column.label ?? column.name}
                      <span
                        aria-hidden="true"
                        className={`inline-flex ${sorted ? "text-action" : "opacity-0"}`}
                      >
                        {sorted?.descending ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </span>
                    </button>
                  ) : (
                    (column.label ?? column.name)
                  )}
                </th>
              );
            })}
            {props.rowActions ? <th className={`${head} py-2`} /> : null}
          </tr>
          {filterable ? (
            <tr>
              {choosing ? <th className={`${head} pb-2`} /> : null}
              {columns.map((column) => (
                <th key={column.name} className={`${head} pb-2 font-normal`}>
                  {column.filterable ? (
                    <input
                      aria-label={`Filter by ${column.label ?? column.name}`}
                      placeholder="Filter"
                      value={filters?.[column.name] ?? ""}
                      className="h-7 w-full min-w-20 rounded-inner border border-line-control bg-surface px-1.5 text-ink placeholder:text-ink-muted/60"
                      onChange={(event) => onFilter?.(column.name, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                  ) : null}
                </th>
              ))}
              {props.rowActions ? <th className={`${head} pb-2`} /> : null}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={width} className="px-3 py-6 text-ink-muted">
                {props.empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = props.rowKey(row);
              const chosen = choosing && props.selectedKey === key;
              return (
                <tr
                  key={key}
                  aria-selected={choosing ? chosen : undefined}
                  className={`border-b border-line last:border-b-0 ${chosen ? "bg-action-soft/50" : ""} ${
                    choosing ? "cursor-pointer" : ""
                  }`}
                  onClick={(event) => {
                    // A press on something in the row that does its own thing is not a choice of the row.
                    if (
                      (event.target as HTMLElement).closest("button, input, a, select, textarea")
                    ) {
                      return;
                    }
                    props.onSelect?.(row);
                  }}
                >
                  {choosing ? (
                    <td className="w-8 px-3 py-1.5 align-middle">
                      <input
                        type="radio"
                        name={group}
                        aria-label="Choose this row"
                        checked={chosen}
                        onChange={() => props.onSelect?.(row)}
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => {
                    const value = row[column.name];
                    const custom = props.cell?.(row, column);
                    const shown =
                      custom !== undefined ? (
                        custom
                      ) : value === null || value === undefined ? (
                        <span className="text-ink-muted/60">empty</span>
                      ) : (
                        showValue(column.type, value)
                      );
                    return (
                      <td
                        key={column.name}
                        className={`max-w-80 truncate px-3 py-1.5 align-middle ${
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
                    <td className="px-3 py-1.5 text-right align-middle whitespace-nowrap">
                      {props.rowActions(row)}
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
