import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual";
import { Button, Menu, type MenuItem, Skeleton } from "@vynxlabs/ui";
import { MoreHorizontal, Rows3 } from "lucide-react";
import {
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePreference } from "../prefs.ts";
import { useRestoredScroll } from "../router.tsx";
import { isTyping, singleKeysOn } from "./keys.ts";
import { ErrorState, useDelayed } from "./LoadState.tsx";
import { EmptyCanvas } from "./layout.tsx";
import { fullOnHover } from "./Truncate.tsx";

/**
 * The one list: rows of like things, scannable, sortable, selectable, opened by
 * pointer or keyboard alike (08 §3.6). Every collection in the console is drawn
 * by it, so a list is learned once.
 */

export interface DataColumn<Row> {
  /** Unique within the table; the header text when `header` is not a string. */
  key?: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /**
   * Which widths show it: 1 always, 2 from a tablet up, 3 on a wide screen.
   * On a phone a row keeps only what says what it is and its state.
   */
  priority?: 1 | 2 | 3;
  align?: "start" | "end";
  /** A width class, such as `w-40`, for columns whose content has a known size. */
  width?: string;
  /**
   * Long values end in an ellipsis rather than wrapping the row, with the
   * whole value on hover. For a path or a name, put `Truncate mode="middle"`
   * in the cell instead, so its last part stays.
   */
  truncate?: boolean;
  /** The sort key the server or caller understands; the header becomes a sort button. */
  sort?: string;
}

export interface EmptyContent {
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}
const isEmptyContent = (value: unknown): value is EmptyContent =>
  typeof value === "object" &&
  value !== null &&
  !isValidElement(value) &&
  typeof (value as { title?: unknown }).title === "string";

export type SortState = { key: string; dir: "asc" | "desc" } | undefined;
export type Density = "compact" | "standard" | "comfortable";

const SHOWN = { 1: "", 2: "hidden sm:table-cell", 3: "hidden lg:table-cell" } as const;
const PAD: Record<Density, string> = { compact: "py-0.5", standard: "py-2", comfortable: "py-3" };
/** Row heights the virtual list estimates with, matching the paddings above. */
const HEIGHT: Record<Density, number> = { compact: 28, standard: 36, comfortable: 44 };
/** Rows are drawn only near the view once a list holds more than this many. */
const VIRTUAL_AFTER = 200;

export const columnKey = <Row,>(column: DataColumn<Row>) => column.key ?? column.header;

const DENSITIES: Density[] = ["compact", "standard", "comfortable"];

/** A table's density, kept per table with the member's other settings. */
export function useDensity(id: string, fallback: Density = "standard") {
  const [kept, keep] = usePreference<string>(`density:${id}`, fallback);
  const density = DENSITIES.includes(kept as Density) ? (kept as Density) : fallback;
  const change = useCallback((next: Density) => keep(next), [keep]);
  return [density, change] as const;
}

/** The next sort for a header press: ascending, then descending, then none. */
export function nextSort(current: SortState, key: string): SortState {
  if (current?.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return undefined;
}

export interface DataTableProps<Row> {
  /** Names the list for screen readers. */
  label: string;
  columns: DataColumn<Row>[];
  rows: Row[] | undefined;
  rowKey: (row: Row) => string;
  /**
   * `interactive` rows open something and move by arrow keys (the default);
   * `static` is a plain reference table; `inset` sits inside a panel and shows
   * at most ten rows before "Show all".
   */
  variant?: "interactive" | "static" | "inset" | undefined;
  /** Keeps scroll for this table; pass the same id to `useDensity`. */
  id?: string | undefined;
  /** From `useDensity`, shared with the toolbar's `DensityMenu`. */
  density?: Density | undefined;
  /** Fills its container and scrolls on its own, so opening a row never loses the place. */
  fill?: boolean | undefined;
  /** The open row, mirrored in the address by the screen. */
  selected?: string | undefined;
  onOpen?: ((row: Row) => void) | undefined;
  /** Where a row leads, for ⌘↵ and a middle click to open it in a new tab. */
  href?: ((row: Row) => string | undefined) | undefined;
  /** Checked rows, for batch actions. Giving it adds a checkbox column. */
  checked?: ReadonlySet<string> | undefined;
  onCheck?: ((keys: Set<string>) => void) | undefined;
  /** Shown in place of the column header while any row is checked. */
  batch?: ((keys: Set<string>) => ReactNode) | undefined;
  sort?: SortState | undefined;
  onSort?: ((sort: SortState) => void) | undefined;
  /** The columns to show, by key, in order: the first column is always shown. All when absent. */
  columnsShown?: string[] | undefined;
  /** The row's "⋯" menu. */
  actions?: ((row: Row) => MenuItem[]) | undefined;
  /** A second line under a row that needs one, such as a failed run's error. */
  detail?: ((row: Row) => ReactNode) | undefined;
  loading?: boolean | undefined;
  /** Rows stay while newer ones load. */
  refreshing?: boolean | undefined;
  /** What failed: the error itself, so its request ID shows, or a sentence. */
  error?: unknown;
  onRetry?: (() => void) | undefined;
  /** What an empty list says: a title with text and an action, or anything to show instead. */
  empty: EmptyContent | ReactNode;
  /** A bordered panel, for a table set inside a page rather than filling a work area. */
  framed?: boolean | undefined;
  /** Set while filters hide every row: the empty state offers to clear them. */
  filtered?: { onClear: () => void } | undefined;
  /** Load more, or Previous and Next. */
  footer?: ReactNode | undefined;
}

/**
 * The columns to draw: all of them, or those named in `shown`, in its order.
 * The first column says what a row is, so it is always drawn, first.
 */
export function chooseColumns<Row>(columns: DataColumn<Row>[], shown: string[] | undefined) {
  if (!shown || shown.length === 0) return columns;
  const [first, ...rest] = columns;
  if (!first) return columns;
  const byKey = new Map(rest.map((column) => [columnKey(column), column]));
  const picked = shown
    .map((key) => byKey.get(key))
    .filter((column): column is DataColumn<Row> => column !== undefined);
  return [first, ...picked];
}

export function DataTable<Row>(props: DataTableProps<Row>) {
  const {
    label,
    columns: allColumns,
    columnsShown,
    rows,
    rowKey,
    variant = "interactive",
    id,
    fill = false,
    selected,
    onOpen,
    href,
    checked,
    onCheck,
    batch,
    sort,
    onSort,
    actions,
    detail,
    loading,
    refreshing,
    error,
    onRetry,
    empty,
    framed = false,
    filtered,
    footer,
  } = props;
  const columns = useMemo(
    () => chooseColumns(allColumns, columnsShown),
    [allColumns, columnsShown],
  );
  const density = props.density ?? "standard";
  const region = useRef<HTMLDivElement>(null);
  useRestoredScroll(region, `table:${id ?? label}`);
  const [all, setAll] = useState(false);
  const grid = variant !== "static";
  const checking = checked !== undefined && onCheck !== undefined;

  const shown = rows && variant === "inset" && !all ? rows.slice(0, 10) : (rows ?? []);
  const virtual = fill && shown.length > VIRTUAL_AFTER;
  const virtualizer = useVirtualizer({
    count: virtual ? shown.length : 0,
    getScrollElement: () => region.current,
    estimateSize: () => HEIGHT[density] + (detail ? 20 : 0),
    overscan: 12,
    // Draws a first screenful before the list has been measured, or where it measures nothing.
    initialRect: { width: 800, height: 600 },
    observeElementRect: (instance, report) =>
      observeElementRect(instance, (rect) =>
        report(rect.height > 0 ? rect : { width: rect.width || 800, height: 600 }),
      ),
  });

  // Roving focus: one cell of the grid is in the tab order; arrows move it.
  const [focus, setFocus] = useState<{ row: number; column: number }>({ row: 0, column: 0 });
  const [anchor, setAnchor] = useState<number | undefined>();
  const ranged = useRef(false);
  const width = columns.length + (checking ? 1 : 0) + (actions ? 1 : 0);
  const placeFocus = useCallback(
    (row: number, column: number) => {
      const target = { row: Math.max(0, Math.min(row, shown.length - 1)), column };
      setFocus(target);
      if (virtual) virtualizer.scrollToIndex(target.row);
      requestAnimationFrame(() => {
        const cell = region.current?.querySelector<HTMLElement>(
          `[data-cell="${target.row}:${target.column}"]`,
        );
        // A cell holding exactly one control lends it the focus.
        const inner = cell?.querySelectorAll<HTMLElement>("a,button,input");
        (inner?.length === 1 ? inner[0] : cell)?.focus();
      });
    },
    [shown.length, virtual, virtualizer],
  );
  useEffect(() => {
    if (focus.row >= shown.length && shown.length > 0) setFocus({ row: 0, column: 0 });
  }, [focus.row, shown.length]);

  const toggle = (keys: string[], on: boolean) => {
    if (!onCheck) return;
    const next = new Set(checked);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    onCheck(next);
  };

  const open = (row: Row, newTab: boolean) => {
    const to = href?.(row);
    if (newTab && to) {
      window.open(to, "_blank", "noopener");
      return;
    }
    onOpen?.(row);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (!grid || shown.length === 0) return;
    const target = event.target as HTMLElement;
    // Typing in a field inside a cell is the field's business.
    if (isTyping(target) || target.closest("[role=menu]")) return;
    // j, k and x are single-key shortcuts, which a person may turn off (WCAG 2.1.4).
    if (["j", "k", "x", "J", "K"].includes(event.key) && !singleKeysOn()) return;
    const { row, column } = focus;
    const page = Math.max(1, Math.floor((region.current?.clientHeight ?? 360) / HEIGHT[density]));
    const current = shown[row];
    const key = current === undefined ? undefined : rowKey(current);
    const move = (to: number, col = column) => {
      event.preventDefault();
      placeFocus(to, col);
    };
    switch (event.key) {
      case "ArrowDown":
      case "j":
        if (event.shiftKey && checking && key !== undefined) {
          const next = Math.min(row + 1, shown.length - 1);
          const from = anchor ?? row;
          const range = shown.slice(Math.min(from, next), Math.max(from, next) + 1).map(rowKey);
          toggle(range, true);
          setAnchor(from);
        }
        return move(row + 1);
      case "ArrowUp":
      case "k":
        if (event.shiftKey && checking && key !== undefined) {
          const next = Math.max(row - 1, 0);
          const from = anchor ?? row;
          const range = shown.slice(Math.min(from, next), Math.max(from, next) + 1).map(rowKey);
          toggle(range, true);
          setAnchor(from);
        }
        return move(row - 1);
      case "ArrowRight":
        return move(row, Math.min(column + 1, width - 1));
      case "ArrowLeft":
        return move(row, Math.max(column - 1, 0));
      case "Home":
        return event.ctrlKey || event.metaKey ? move(0, column) : move(row, 0);
      case "End":
        return event.ctrlKey || event.metaKey
          ? move(shown.length - 1, column)
          : move(row, width - 1);
      case "PageDown":
        return move(row + page);
      case "PageUp":
        return move(row - page);
      case "Enter":
        if (!current || target.closest("a,button")) return;
        event.preventDefault();
        open(current, event.metaKey || event.ctrlKey);
        return;
      case " ":
      case "x":
        if (!checking || key === undefined || target.closest("a,button")) return;
        event.preventDefault();
        toggle([key], !checked?.has(key));
        setAnchor(row);
        return;
      case "a":
        if (!checking || !(event.metaKey || event.ctrlKey)) return;
        event.preventDefault();
        toggle(shown.map(rowKey), true);
        return;
      case "Escape":
        if (checking && checked && checked.size > 0) {
          event.preventDefault();
          onCheck?.(new Set());
        }
        return;
    }
  };

  const slow = useDelayed(loading === true || rows === undefined);
  const edge = (index: number, count: number) =>
    `${index === 0 ? "pl-4 md:pl-6" : ""} ${index === count - 1 ? "pr-4 md:pr-6" : ""}`;
  const cells = [
    ...(checking ? [{ kind: "check" as const }] : []),
    ...columns.map((column) => ({ kind: "data" as const, column })),
    ...(actions ? [{ kind: "actions" as const }] : []),
  ];

  let body: ReactNode;
  if (error && !rows?.length) {
    body = (
      <div className="p-4 md:px-6">
        <ErrorState error={error} what={label.toLowerCase()} onRetry={onRetry} />
      </div>
    );
  } else if (loading || rows === undefined) {
    // Nothing for the first moments: most lists answer before a skeleton would help.
    body = !slow ? (
      <div aria-busy="true" className="min-h-24" />
    ) : (
      <div className="px-4 py-4 md:px-6">
        <Skeleton lines={6} className="h-6 w-full" label={`Loading ${label.toLowerCase()}`} />
      </div>
    );
  } else if (rows.length === 0) {
    if (!filtered && !isEmptyContent(empty)) return <>{empty}</>;
    body = (
      <div className="p-4 md:p-6">
        {filtered ? (
          <EmptyCanvas
            title="Nothing matches these filters"
            text="Change or clear the filters to see more."
            action={
              <Button size="small" onClick={filtered.onClear}>
                Clear filters
              </Button>
            }
          />
        ) : isEmptyContent(empty) ? (
          <EmptyCanvas title={empty.title} text={empty.text} action={empty.action} />
        ) : (
          empty
        )}
      </div>
    );
  } else {
    const items = virtual
      ? virtualizer.getVirtualItems()
      : shown.map((_, index) => ({ index, start: 0, size: 0, key: index }));
    const before = virtual ? (items[0]?.start ?? 0) : 0;
    const after = virtual
      ? virtualizer.getTotalSize() - ((items.at(-1)?.start ?? 0) + (items.at(-1)?.size ?? 0))
      : 0;
    const anyChecked = checking && (checked?.size ?? 0) > 0;
    const allChecked =
      checking && shown.length > 0 && shown.every((row) => checked?.has(rowKey(row)));
    body = (
      <>
        {anyChecked && batch ? (
          <div
            role="toolbar"
            aria-label="Batch actions"
            className="sticky top-0 layer-sticky flex flex-wrap items-center gap-2 border-line border-b bg-action-soft px-4 py-1.5 md:px-6"
          >
            <span className="text-meta font-medium">{checked?.size} selected</span>
            {batch(new Set(checked))}
            <Button size="small" variant="quiet" onClick={() => onCheck?.(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}
        <table
          aria-label={label}
          role={grid ? "grid" : undefined}
          aria-rowcount={grid ? shown.length + 1 : undefined}
          onKeyDown={onKeyDown}
          className="w-full table-fixed border-collapse text-left"
          aria-busy={refreshing || undefined}
        >
          <thead
            className={`sticky ${anyChecked && batch ? "top-9" : "top-0"} layer-sticky bg-canvas`}
          >
            <tr className="border-line border-b text-meta text-ink-subtle">
              {cells.map((cell, index) => {
                const edges = edge(index, cells.length);
                if (cell.kind === "check")
                  return (
                    <th key="check" scope="col" className={`w-10 py-2 ${edges}`}>
                      <input
                        type="checkbox"
                        aria-label="Select all shown"
                        checked={allChecked}
                        tabIndex={-1}
                        onChange={(event) => toggle(shown.map(rowKey), event.target.checked)}
                        className="size-4 accent-[var(--color-action)]"
                      />
                    </th>
                  );
                if (cell.kind === "actions")
                  return (
                    <th key="actions" scope="col" className={`w-12 py-2 ${edges}`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  );
                const { column } = cell;
                const sorted = column.sort && sort?.key === column.sort ? sort : undefined;
                return (
                  <th
                    key={columnKey(column)}
                    scope="col"
                    aria-sort={
                      column.sort && onSort
                        ? sorted
                          ? sorted.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                    className={`px-3 py-2 font-medium ${column.width ?? ""} ${SHOWN[column.priority ?? 1]} ${
                      column.align === "end" ? "text-right" : ""
                    } ${edges}`}
                  >
                    {column.sort && onSort ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => onSort(nextSort(sort, column.sort as string))}
                        className="inline-flex items-center gap-1 font-medium text-inherit hover:text-ink"
                      >
                        {column.header}
                        <span
                          aria-hidden="true"
                          className={sorted ? "text-action" : "text-ink-subtle opacity-60"}
                        >
                          {sorted ? (sorted.dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {before > 0 ? (
              <tr className="border-0">
                <td colSpan={cells.length} style={{ height: before, padding: 0 }} />
              </tr>
            ) : null}
            {items.map(({ index }) => {
              const row = shown[index] as Row;
              const key = rowKey(row);
              const on = key === selected;
              const ticked = checked?.has(key) ?? false;
              const extra = detail?.(row);
              return (
                <tr
                  key={key}
                  data-row={key}
                  aria-rowindex={grid ? index + 2 : undefined}
                  aria-selected={grid ? on || ticked : undefined}
                  onClick={
                    onOpen
                      ? (event) => {
                          if ((event.target as HTMLElement).closest("a,button,input,[role=menu]"))
                            return;
                          setFocus((was) => ({ row: index, column: was.column }));
                          open(row, event.metaKey || event.ctrlKey);
                        }
                      : undefined
                  }
                  onAuxClick={(event) => {
                    if (event.button === 1 && href?.(row)) open(row, true);
                  }}
                  className={`border-line border-b align-top ${onOpen ? "cursor-pointer" : ""} ${
                    on
                      ? "bg-selected shadow-[inset_2px_0_0_var(--color-action)]"
                      : ticked
                        ? "bg-action-soft"
                        : onOpen
                          ? "hover:bg-surface"
                          : ""
                  }`}
                >
                  {cells.map((cell, position) => {
                    const here = focus.row === index && focus.column === position;
                    const common = {
                      "data-cell": `${index}:${position}`,
                      role: grid ? "gridcell" : undefined,
                      tabIndex: grid ? (here ? 0 : -1) : undefined,
                      onFocus: grid
                        ? () =>
                            setFocus((was) =>
                              was.row === index && was.column === position
                                ? was
                                : { row: index, column: position },
                            )
                        : undefined,
                    };
                    const edges = edge(position, cells.length);
                    const ring =
                      "outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset";
                    if (cell.kind === "check")
                      return (
                        <td key="check" {...common} className={`${PAD[density]} ${edges} ${ring}`}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${key}`}
                            checked={ticked}
                            tabIndex={-1}
                            onClick={(event) => {
                              // Shift and a click checks every row from the last one checked.
                              if (!event.shiftKey || anchor === undefined) return;
                              event.preventDefault();
                              const range = shown
                                .slice(Math.min(anchor, index), Math.max(anchor, index) + 1)
                                .map(rowKey);
                              toggle(range, true);
                              setAnchor(index);
                              // A browser sends no change after this; some test DOMs still do.
                              ranged.current = true;
                              setTimeout(() => {
                                ranged.current = false;
                              });
                            }}
                            onChange={(event) => {
                              // The click that checked a range has done its work.
                              if (ranged.current) {
                                ranged.current = false;
                                return;
                              }
                              toggle([key], event.target.checked);
                              setAnchor(index);
                            }}
                            className="size-4 accent-[var(--color-action)]"
                          />
                        </td>
                      );
                    if (cell.kind === "actions") {
                      const items = actions?.(row) ?? [];
                      return (
                        <td
                          key="actions"
                          {...common}
                          className={`${PAD[density]} text-right ${edges} ${ring}`}
                        >
                          {items.length > 0 ? (
                            <Menu
                              label={<MoreHorizontal aria-hidden="true" size={16} />}
                              ariaLabel={`Actions for ${key}`}
                              items={items}
                              align="end"
                              triggerClassName={`inline-flex ${density === "compact" ? "size-6" : "size-7"} items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink`}
                            />
                          ) : null}
                        </td>
                      );
                    }
                    const { column } = cell;
                    return (
                      <td
                        key={columnKey(column)}
                        {...common}
                        className={`px-3 ${PAD[density]} ${SHOWN[column.priority ?? 1]} ${
                          column.align === "end" ? "text-right tabular-nums" : ""
                        } ${column.truncate ? "truncate" : ""} ${edges} ${ring}`}
                        onPointerEnter={column.truncate ? fullOnHover : undefined}
                      >
                        {column.cell(row)}
                        {position === (checking ? 1 : 0) && extra ? (
                          <div className="mt-0.5 truncate text-meta">{extra}</div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {after > 0 ? (
              <tr className="border-0">
                <td colSpan={cells.length} style={{ height: after, padding: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
        {error ? (
          <div className="px-4 py-3 md:px-6">
            <ErrorState error={error} what={label.toLowerCase()} onRetry={onRetry} />
          </div>
        ) : null}
        {variant === "inset" && rows.length > 10 && !all ? (
          <div className="px-4 py-2 md:px-6">
            <Button size="small" variant="quiet" onClick={() => setAll(true)}>
              Show all {rows.length}
            </Button>
          </div>
        ) : null}
        {footer ? <div className="px-4 py-3 md:px-6">{footer}</div> : null}
      </>
    );
  }

  return (
    <div
      ref={region}
      className={`${fill ? "min-h-0 flex-1 overflow-auto" : "overflow-x-auto"} ${
        // panel-allowed: a table drawn on its own carries the panel's edge itself.
        framed ? "rounded-panel border border-line bg-surface" : ""
      }`}
    >
      {body}
    </div>
  );
}

/** Density as a small menu, for a table's toolbar. */
export function DensityMenu({
  density,
  onChange,
}: {
  density: Density;
  onChange: (density: Density) => void;
}) {
  const choices: Density[] = ["compact", "standard", "comfortable"];
  return (
    <Menu
      label={<Rows3 aria-hidden="true" size={16} />}
      ariaLabel="Row density"
      align="end"
      triggerClassName="inline-flex size-7 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
      items={choices.map((choice) => ({
        label: choice[0]?.toUpperCase() + choice.slice(1),
        current: choice === density,
        onSelect: () => onChange(choice),
      }))}
    />
  );
}
