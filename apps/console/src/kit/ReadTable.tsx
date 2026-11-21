import { Grid, type GridColumn, type GridSort } from "@volvel/ui";
import { ListFilter } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { count } from "./format.ts";
import { ColumnsMenu } from "./views.tsx";

/**
 * A table that is only read, such as a query's answer or the rows behind a
 * number, with what a reader needs to find something in it: each column
 * sorts, a row of fields under the headings narrows the rows to those that
 * contain what is typed, and the columns can be hidden and put in another
 * order. All of it works on the rows it was given and asks the server
 * nothing.
 *
 * Every table that shows an answer is this one. What its reader chooses lasts
 * while it is on the page; `onColumns` is told of the columns chosen, for a
 * place that keeps them.
 */
export function ReadTable<Row extends Record<string, unknown>>({
  label,
  columns,
  rows,
  rowKey,
  cell,
  shown,
  onColumns,
  note,
  pinned,
  empty = "Nothing to show.",
}: {
  /** Names the table for screen readers: "Rows of loans". */
  label: string;
  columns: GridColumn[];
  rows: Row[];
  rowKey: (row: Row) => string;
  cell?: (row: Row, column: GridColumn) => ReactNode | undefined;
  /** The columns shown to begin with, in order. Left out, all of them. */
  shown?: string[] | undefined;
  onColumns?: ((next: string[] | undefined) => void) | undefined;
  /** Rows kept at the foot whatever is sorted or typed, such as totals. */
  pinned?: Row[] | undefined;
  /** Said beside the tools, before how many rows match. */
  note?: ReactNode;
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState<GridSort>();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [filtering, setFiltering] = useState(false);
  const [chosen, setChosen] = useState<string[] | undefined>(shown);
  const order = (
    chosen && chosen.length > 0 ? chosen : columns.map((column) => column.name)
  ).filter((name) => columns.some((column) => column.name === name));
  const drawn = order.map((name) => ({
    ...(columns.find((column) => column.name === name) as GridColumn),
    sortable: true,
    filterable: true,
  }));

  const kept = useMemo(() => {
    const wanted = Object.entries(typed)
      .map(([name, text]) => [name, text.trim().toLowerCase()] as const)
      .filter(([, text]) => text !== "");
    const matching =
      wanted.length === 0
        ? rows
        : rows.filter((row) =>
            wanted.every(([name, text]) => textOf(row[name]).toLowerCase().includes(text)),
          );
    if (!sort) return matching;
    const way = sort.descending ? -1 : 1;
    return [...matching].sort((a, b) => way * compare(a[sort.column], b[sort.column]));
  }, [rows, typed, sort]);
  const narrowed = kept.length !== rows.length;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p
          className="m-0 min-w-0 text-body-sm text-ink-muted"
          role={narrowed ? "status" : undefined}
        >
          {note}
          {narrowed
            ? `${note ? " " : ""}${count(kept.length)} of ${count(rows.length)} match.`
            : ""}
        </p>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Filter the rows"
            aria-pressed={filtering}
            onClick={() => {
              // Putting the fields away puts away what was typed in them.
              if (filtering) setTyped({});
              setFiltering(!filtering);
            }}
            className={`inline-flex size-7 items-center justify-center rounded-control hover:bg-sunken hover:text-ink ${
              filtering ? "bg-selected text-ink" : "text-ink-muted"
            }`}
          >
            <ListFilter aria-hidden="true" size={16} />
          </button>
          <ColumnsMenu
            columns={columns.map((column) => ({
              key: column.name,
              label: column.label ?? column.name,
            }))}
            shown={chosen}
            onChange={(next) => {
              setChosen(next);
              onColumns?.(next);
            }}
          />
        </span>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Grid<Row>
          label={label}
          columns={drawn}
          rows={pinned && kept.length > 0 ? [...kept, ...pinned] : kept}
          rowKey={rowKey}
          sort={sort}
          onSort={(column) =>
            setSort((before) =>
              before?.column !== column
                ? { column, descending: false }
                : before.descending
                  ? undefined
                  : { column, descending: true },
            )
          }
          {...(filtering
            ? {
                filters: typed,
                onFilter: (column: string, text: string) =>
                  setTyped((before) => ({ ...before, [column]: text })),
              }
            : {})}
          {...(cell ? { cell } : {})}
          empty={narrowed ? "No row matches what is typed." : empty}
        />
      </div>
    </div>
  );
}

const textOf = (value: unknown): string =>
  value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

/** Numbers by size, everything else as text, with nothing last. */
function compare(a: unknown, b: unknown): number {
  const none = (value: unknown) => value === null || value === undefined || value === "";
  if (none(a) || none(b)) return none(a) === none(b) ? 0 : none(a) ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return textOf(a).localeCompare(textOf(b), undefined, { numeric: true, sensitivity: "base" });
}
