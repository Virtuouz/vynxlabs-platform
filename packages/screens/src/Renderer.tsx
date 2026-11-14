import type { InterfaceBody, InterfacePage, PageWidget, WidgetField } from "@vynxlabs/manifest";
import {
  Button,
  Dialog,
  DialogsProvider,
  type FormSchema,
  type WidgetField as KitField,
  Notice,
  Tabs,
  useDialogs,
  Widget,
  type WidgetContext,
} from "@vynxlabs/ui";
import type React from "react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type DataClient, type Filter, failure, type Row, type TableInfo } from "./data.ts";
import { all, heading, linkDefaults, linkFilter, sortOf, summaryRows } from "./links.ts";

const SYSTEM = new Set(["id", "created_at", "updated_at"]);
/** How many reference IDs one request may ask for. The rows API takes no more in one `in`. */
export const LOOKUP_BATCH = 200;

/** Rows of other tables, by table and ID, kept for as long as the page is open. */
type Lookups = Map<string, Map<string, Row>>;

interface WidgetData {
  rows: Row[];
  cursor: string | null;
  loading: boolean;
  error?: string;
}

/** The fields a widget shows when it names none: its totals, or the table's own columns. */
function fieldsOf(widget: PageWidget, info: TableInfo | undefined): WidgetField[] {
  if (widget.fields?.length) return widget.fields;
  if (widget.summary) {
    return [
      ...widget.summary.groupBy.map((group) => ({ column: group.column })),
      ...widget.summary.aggregates.map((aggregate) => ({ column: aggregate.as })),
    ];
  }
  return (info?.columns ?? [])
    .filter((column) => !SYSTEM.has(column.name))
    .slice(0, 8)
    .map((column) => ({ column: column.name }));
}

/** What a value of a widget's row holds: a column's type, or a number for a total. */
function typeOf(widget: PageWidget, info: TableInfo | undefined, name: string): string {
  const column = (from: string) => info?.columns.find((candidate) => candidate.name === from);
  const aggregate = widget.summary?.aggregates.find((candidate) => candidate.as === name);
  if (aggregate) {
    if (aggregate.fn === "min" || aggregate.fn === "max") {
      return column(aggregate.column ?? "")?.type ?? "text";
    }
    return "number";
  }
  return column(name)?.type ?? "text";
}

const FORM_TYPES: Record<
  string,
  { type: "string" | "number" | "integer" | "boolean"; format?: string }
> = {
  integer: { type: "integer" },
  number: { type: "number" },
  boolean: { type: "boolean" },
  date: { type: "string", format: "date" },
  timestamp: { type: "string", format: "date-time" },
};

/** A form for the fields of a widget, as the kit's form takes it. */
function formSchema(fields: WidgetField[], info: TableInfo | undefined): FormSchema {
  const writable = fields.filter((field) => !SYSTEM.has(field.column));
  return {
    type: "object",
    required: writable
      .filter((field) => info?.columns.find((column) => column.name === field.column)?.required)
      .map((field) => field.column),
    properties: Object.fromEntries(
      writable.map((field) => {
        const type = info?.columns.find((column) => column.name === field.column)?.type ?? "text";
        return [
          field.column,
          {
            ...(FORM_TYPES[type] ?? { type: "string" }),
            title: field.label ?? heading(field.column),
          },
        ];
      }),
    ),
  } as FormSchema;
}

function WidgetView({
  widget,
  source,
  chosen,
  info,
  tables,
  client,
  version,
  lookups,
  selected,
  followed,
  onSelect,
  onChanged,
  onLooked,
  narrowed,
}: {
  /** What the page's filters add, for this widget's table. */
  narrowed?: Filter | undefined;
  widget: PageWidget;
  source: PageWidget | undefined;
  /** The row chosen in the widget this one follows. */
  chosen: Row | undefined;
  info: TableInfo | undefined;
  tables: Record<string, TableInfo>;
  client: DataClient;
  /** Goes up when a row was written anywhere on the page, so that every widget reads again. */
  version: number;
  lookups: Lookups;
  selected: Row | undefined;
  /** Whether another widget follows this one, so that choosing a row here means something. */
  followed: boolean;
  onSelect: (row: Row) => void;
  onChanged: () => void;
  /** Called when rows that references point at have arrived, for every widget to draw again. */
  onLooked: () => void;
}) {
  const dialogs = useDialogs();
  const [data, setData] = useState<WidgetData>({ rows: [], cursor: null, loading: false });
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState<string>();
  const [formKey, setFormKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();

  const table = widget.table;
  const link = linkFilter(widget, source, chosen);
  const held = typeof link === "string" ? link : undefined;
  const filter = held
    ? undefined
    : all([widget.filter as Filter | undefined, link as Filter, narrowed]);
  const readable = widget.type !== "text" && widget.type !== "form" && info?.found && info.canRead;
  const fields = useMemo(() => fieldsOf(widget, info), [widget, info]);
  const limit = widget.type === "card" ? 1 : (widget.pageSize ?? 50);
  // Everything that decides which rows are read, as one value to watch.
  const asked = JSON.stringify([table, widget.summary, filter, sortOf(widget), limit, held]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `asked` stands for the widget, filter and sort it was made from, and `version` asks again after a write
  useEffect(() => {
    if (!readable || !table || held) {
      setData({ rows: [], cursor: null, loading: false });
      return;
    }
    let current = true;
    setData((before) => ({ ...before, loading: true }));
    const summary = widget.summary;
    const reading = summary
      ? client
          .aggregate(table, {
            group: summary.groupBy.map((group) =>
              group.bucket ? `${group.column}:${group.bucket}` : group.column,
            ),
            measures: summary.aggregates.map((aggregate) =>
              aggregate.column ? `${aggregate.fn}:${aggregate.column}` : aggregate.fn,
            ),
            ...(filter ? { filter } : {}),
            sort: sortOf(widget),
            limit: 1000,
          })
          .then((totals) => ({ rows: summaryRows(summary, totals.items), cursor: null }))
      : client
          .find(table, { ...(filter ? { filter } : {}), sort: sortOf(widget), limit })
          .then((page) => ({ rows: page.items, cursor: page.nextCursor }));
    reading.then(
      (read) => current && setData({ ...read, loading: false }),
      (error) =>
        current &&
        setData({ rows: [], cursor: null, loading: false, error: failure(error).message }),
    );
    return () => {
      current = false;
    };
  }, [asked, version, readable, client]);

  // The rows that references point at, fetched once each, a batch at a time.
  const shows = fields.filter((field) => field.show !== undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: asks again when the rows change, which is when new IDs can appear
  useEffect(() => {
    let current = true;
    for (const field of shows) {
      const target = info?.columns.find((column) => column.name === field.column)?.references;
      if (!target || !tables[target]?.canRead) continue;
      const known = lookups.get(target) ?? new Map<string, Row>();
      lookups.set(target, known);
      const wanted = [
        ...new Set(
          data.rows
            .map((row) => row[field.column])
            .filter((id): id is string => typeof id === "string" && !known.has(id)),
        ),
      ];
      for (let start = 0; start < wanted.length; start += LOOKUP_BATCH) {
        const batch = wanted.slice(start, start + LOOKUP_BATCH);
        // Marked as asked for, so that no other widget asks for the same rows meanwhile.
        for (const id of batch) known.set(id, {});
        client
          .find(target, { filter: { column: "id", op: "in", value: batch }, limit: LOOKUP_BATCH })
          .then(
            (page) => {
              for (const row of page.items) known.set(String(row.id), row);
              // Another widget may be waiting for the same rows, so the whole page draws again.
              if (current) onLooked();
            },
            () => {
              for (const id of batch) known.delete(id);
            },
          );
      }
    }
    return () => {
      current = false;
    };
  }, [data.rows]);

  const display = useCallback(
    (column: string, value: unknown) => {
      const field = fields.find((candidate) => candidate.column === column);
      if (!field?.show || typeof value !== "string") return undefined;
      const target = info?.columns.find((candidate) => candidate.name === column)?.references;
      const shown = target ? lookups.get(target)?.get(value)?.[field.show] : undefined;
      return shown === undefined || shown === null ? undefined : String(shown);
    },
    [fields, info, lookups],
  );

  if (widget.type === "text") {
    return <p className="m-0 whitespace-pre-wrap">{widget.options?.text}</p>;
  }
  if (!info?.found) {
    return (
      <Notice tone="attention">
        The table "{table}" is not in this workspace any more, so there is nothing to show here.
      </Notice>
    );
  }
  if (!info.canRead) {
    return <Notice tone="attention">You may not read the table "{table}".</Notice>;
  }
  const missing = fields.filter(
    (field) => !widget.summary && !info.columns.some((column) => column.name === field.column),
  );
  if (missing.length > 0) {
    return (
      <Notice tone="attention">
        The table "{table}" no longer has {missing.map((field) => `"${field.column}"`).join(", ")}.
        Whoever looks after this screen needs to take it out.
      </Notice>
    );
  }

  const canWrite = info.canWrite && !widget.summary;
  const kitFields: KitField[] = fields.map((field) => ({
    name: field.column,
    label: field.label ?? heading(field.column),
    type: typeOf(widget, info, field.column),
    editable: field.editable === true && canWrite && !SYSTEM.has(field.column),
  }));
  const waitingText =
    held === "waiting"
      ? `Choose a row in ${source?.title || "the other widget"} to see what goes with it.`
      : held === "nothing"
        ? "The chosen row points at nothing here."
        : undefined;
  const insert = async (values: Row) => {
    setErrors({});
    setProblem(undefined);
    try {
      await client.insert(table as string, { ...values, ...linkDefaults(widget, chosen) });
      setFormKey((key) => key + 1);
      setDone(widget.options?.success || "Added.");
      setAdding(false);
      onChanged();
    } catch (error) {
      const refused = failure(error);
      setErrors(refused.fields);
      setProblem(refused.message);
    }
  };

  if (widget.type === "form") {
    if (!info.canWrite) {
      return <Notice tone="attention">You may not add rows to the table "{table}".</Notice>;
    }
    if (held === "waiting") return <p className="m-0 text-ink-muted">{waitingText}</p>;
    return (
      <div className="flex flex-col gap-3">
        {done ? <Notice tone="success">{done}</Notice> : null}
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        <Widget
          key={formKey}
          name="form"
          config={{
            schema: formSchema(fields, info),
            submitLabel: widget.options?.submitLabel ?? "Add",
          }}
          context={{ errors, onSubmit: insert }}
        />
      </div>
    );
  }

  if (data.error) return <Notice tone="danger">{data.error}</Notice>;
  if (waitingText) return <p className="m-0 text-ink-muted">{waitingText}</p>;

  const context: WidgetContext = {
    rows: data.rows,
    loading: data.loading,
    display,
    ...(selected?.id !== undefined ? { selectedId: String(selected.id) } : {}),
    ...(followed ? { onSelect } : {}),
    ...(data.cursor
      ? {
          page: {
            hasMore: true,
            onMore: () => {
              const cursor = data.cursor as string;
              client
                .find(table as string, {
                  ...(filter ? { filter } : {}),
                  sort: sortOf(widget),
                  limit,
                  cursor,
                })
                .then((page) =>
                  setData((before) => ({
                    ...before,
                    rows: [...before.rows, ...page.items],
                    cursor: page.nextCursor,
                  })),
                );
            },
          },
        }
      : {}),
    ...(canWrite
      ? {
          onEdit: async (row: Row, column: string, value: unknown) => {
            try {
              await client.update(table as string, String(row.id), { [column]: value });
              onChanged();
            } catch (error) {
              throw new Error(failure(error).message);
            }
          },
        }
      : {}),
    ...(canWrite && widget.options?.allowDelete
      ? {
          onDelete: async (row: Row) => {
            const sure = await dialogs.confirm({
              title: "Delete this row?",
              text: "It is removed from the table for everyone. This cannot be undone.",
              action: "Delete",
              danger: true,
            });
            if (!sure) return;
            try {
              await client.remove(table as string, String(row.id));
              onChanged();
            } catch (error) {
              setProblem(failure(error).message);
            }
          },
        }
      : {}),
  };

  if (widget.type === "figure") {
    const first = widget.summary?.aggregates[0];
    const value = first ? data.rows[0]?.[first.as] : undefined;
    const shown =
      typeof value === "number"
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : value === undefined || value === null
          ? "—"
          : String(value);
    return (
      <div className="flex h-full flex-col justify-center gap-1">
        <span className="text-[13px] text-ink-muted">
          {widget.title || heading(first?.as ?? "total")}
        </span>
        <span className="font-mono text-3xl font-semibold tabular-nums">
          {data.loading && data.rows.length === 0 ? "…" : shown}
        </span>
        {data.error ? <span className="text-[13px] text-danger">{data.error}</span> : null}
      </div>
    );
  }

  if (widget.type === "chart") {
    const options = widget.options ?? {};
    /** What a value is called: the name its field was given, or its own made readable. */
    const titleOf = (name: string) =>
      fields.find((field) => field.column === name)?.label ?? heading(name);
    return (
      <Widget
        name="chart"
        config={{
          title: widget.title || "Chart",
          mark: options.mark,
          x: options.x,
          y: options.y,
          ...(options.series ? { series: options.series } : {}),
          xType: typeOf(widget, info, options.x ?? ""),
          ...(options.x ? { xTitle: titleOf(options.x) } : {}),
          ...(options.y ? { yTitle: titleOf(options.y) } : {}),
          ...(options.series ? { seriesTitle: titleOf(options.series) } : {}),
          height: 220,
        }}
        context={{ rows: data.rows }}
      />
    );
  }

  const label = widget.title || heading(table as string);
  return (
    <div className="flex flex-col gap-2">
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {widget.type === "card" ? (
        <Widget
          name="card"
          config={{ fields: kitFields, empty: "There is no row to show." }}
          context={context}
        />
      ) : widget.type === "cards" ? (
        <Widget name="cards" config={{ fields: kitFields, label }} context={context} />
      ) : (
        <Widget
          name="table"
          config={{ label, columns: kitFields, empty: "No rows." }}
          context={context}
        />
      )}
      {canWrite && widget.options?.allowAdd && widget.type !== "card" ? (
        <div>
          <Button size="small" onClick={() => setAdding(true)}>
            Add a row
          </Button>
          <Dialog open={adding} onClose={() => setAdding(false)} title={`Add to ${label}`}>
            <div className="flex flex-col gap-3">
              {problem ? <Notice tone="danger">{problem}</Notice> : null}
              <Widget
                key={formKey}
                name="form"
                config={{ schema: formSchema(fields, info), submitLabel: "Add" }}
                context={{ errors, onSubmit: insert }}
              />
            </div>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}

export interface PageRendererProps {
  page: InterfacePage;
  /** What each table the page shows holds, and what the person may do with it. */
  tables: Record<string, TableInfo>;
  client: DataClient;
  /** For the builder: the widget being worked on, and how another is picked. */
  editing?:
    | {
        selected?: string | undefined;
        onSelect: (widget: string) => void;
        /**
         * Lets a widget be dragged by its heading and stretched by its corner,
         * and is called with where it was let go, on the twelve-column grid.
         */
        onMove?: (widget: string, at: PageWidget["at"]) => void;
      }
    | undefined;
}

/** What someone set in a page's filters: a range of dates, or one value. */
type Narrow = { from?: string | undefined; to?: string | undefined; value?: string | undefined };

/** The conditions a page's filters put on one table: only those whose column the table has. */
function pageNarrowing(
  page: InterfacePage,
  values: Record<string, Narrow>,
  info: TableInfo | undefined,
): Filter | undefined {
  const parts: Filter[] = [];
  for (const one of page.filters ?? []) {
    if (!info?.columns.some((column) => column.name === one.column)) continue;
    const set = values[one.id];
    if (!set) continue;
    if (one.type === "date") {
      if (set.from) parts.push({ column: one.column, op: "gte", value: set.from });
      if (set.to) parts.push({ column: one.column, op: "lt", value: set.to });
    } else if (set.value) {
      parts.push({ column: one.column, op: "eq", value: set.value });
    }
  }
  return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { and: parts };
}

function PageFilters({
  page,
  values,
  onChange,
}: {
  page: InterfacePage;
  values: Record<string, Narrow>;
  onChange: (id: string, value: Narrow) => void;
}) {
  const input =
    "h-8 rounded-control border border-line bg-surface px-2 text-ink placeholder:text-ink-muted/70";
  return (
    <search aria-label="Filters" className="mb-3 flex flex-wrap items-end gap-3">
      {(page.filters ?? []).map((one) => {
        const set = values[one.id] ?? {};
        return one.type === "date" ? (
          <fieldset key={one.id} className="m-0 flex items-end gap-1.5 border-0 p-0">
            <legend className="mb-1 p-0 text-[13px] text-ink-muted">{one.label}</legend>
            <input
              type="date"
              aria-label={`${one.label} from`}
              className={input}
              value={set.from ?? ""}
              onChange={(event) =>
                onChange(one.id, { ...set, from: event.target.value || undefined })
              }
            />
            <span className="pb-1.5 text-ink-muted">–</span>
            <input
              type="date"
              aria-label={`${one.label} until`}
              className={input}
              value={set.to ?? ""}
              onChange={(event) =>
                onChange(one.id, { ...set, to: event.target.value || undefined })
              }
            />
          </fieldset>
        ) : (
          <label key={one.id} className="flex flex-col gap-1 text-[13px] text-ink-muted">
            {one.label}
            <input
              className={input}
              placeholder="All"
              value={set.value ?? ""}
              onChange={(event) => onChange(one.id, { value: event.target.value || undefined })}
            />
          </label>
        );
      })}
    </search>
  );
}

function PageBody({ page, tables, client, editing }: PageRendererProps) {
  const [chosen, setChosen] = useState<Record<string, Row>>({});
  const [narrow, setNarrow] = useState<Record<string, Narrow>>({});
  const [version, setVersion] = useState(0);
  const lookups = useRef<Lookups>(new Map()).current;
  const byId = useMemo(
    () => new Map(page.widgets.map((widget) => [widget.id, widget])),
    [page.widgets],
  );
  const followed = useMemo(
    () => new Set(page.widgets.map((widget) => widget.link?.from).filter(Boolean)),
    [page.widgets],
  );
  const [, setLooked] = useState(0);
  const looked = useCallback(() => setLooked((count) => count + 1), []);
  const changed = useCallback(() => {
    // A row was written: what references showed may be stale too.
    lookups.clear();
    setVersion((before) => before + 1);
  }, [lookups]);
  // Top to bottom and left to right, so the page reads in order without the grid.
  const ordered = [...page.widgets].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);

  // A widget being dragged or stretched is drawn where it would land, before it is let go.
  const grid = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<{ id: string; at: PageWidget["at"] }>();
  const grab = (
    event: React.PointerEvent<HTMLElement>,
    widget: PageWidget,
    how: "move" | "stretch",
  ) => {
    const onMove = editing?.onMove;
    const box = grid.current?.getBoundingClientRect();
    if (!onMove || !box || event.button !== 0) return;
    // A press on a button in the heading is that button's, not the start of a drag.
    if (how === "move" && (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const gap = 12;
    const column = (box.width + gap) / 12;
    const row = 40 + gap;
    const from = { x: event.clientX, y: event.clientY };
    let latest = widget.at;
    const follow = (moved: PointerEvent) => {
      const across = Math.round((moved.clientX - from.x) / column);
      const down = Math.round((moved.clientY - from.y) / row);
      const start = widget.at;
      latest =
        how === "move"
          ? {
              ...start,
              x: Math.min(12 - start.w, Math.max(0, start.x + across)),
              y: Math.min(199, Math.max(0, start.y + down)),
            }
          : {
              ...start,
              w: Math.min(12 - start.x, Math.max(1, start.w + across)),
              h: Math.min(40, Math.max(1, start.h + down)),
            };
      setHeld({ id: widget.id, at: latest });
    };
    const drop = () => {
      handle.removeEventListener("pointermove", follow);
      handle.removeEventListener("pointerup", drop);
      handle.removeEventListener("pointercancel", drop);
      setHeld(undefined);
      const start = widget.at;
      if (
        latest.x !== start.x ||
        latest.y !== start.y ||
        latest.w !== start.w ||
        latest.h !== start.h
      ) {
        onMove(widget.id, latest);
      }
    };
    handle.addEventListener("pointermove", follow);
    handle.addEventListener("pointerup", drop);
    handle.addEventListener("pointercancel", drop);
  };

  if (ordered.length === 0) {
    return <p className="m-0 text-ink-muted">This page has nothing on it yet.</p>;
  }
  const movable = editing?.onMove !== undefined;
  return (
    <>
      {page.filters && page.filters.length > 0 ? (
        <PageFilters
          page={page}
          values={narrow}
          onChange={(id, value) => setNarrow((before) => ({ ...before, [id]: value }))}
        />
      ) : null}
      <div ref={grid} className="grid grid-cols-1 gap-3 md:auto-rows-[2.5rem] md:grid-cols-12">
        {ordered.map((widget) => {
          const source = widget.link ? byId.get(widget.link.from) : undefined;
          const active = editing?.selected === widget.id;
          const at = held?.id === widget.id ? held.at : widget.at;
          return (
            <section
              key={widget.id}
              aria-label={widget.title || widget.id}
              style={
                {
                  "--col": `${at.x + 1} / span ${at.w}`,
                  "--row": `${at.y + 1} / span ${at.h}`,
                } as CSSProperties
              }
              className={`relative flex min-h-40 min-w-0 flex-col rounded-panel border bg-surface md:min-h-0 md:[grid-column:var(--col)] md:[grid-row:var(--row)] ${
                active ? "border-action ring-2 ring-action/30" : "border-line"
              } ${held?.id === widget.id ? "z-10 opacity-90 shadow-lg" : ""}`}
            >
              {widget.title || editing ? (
                <header
                  className={`flex items-center justify-between gap-2 border-line border-b px-3 py-2 ${
                    movable ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""
                  }`}
                  {...(movable
                    ? {
                        title: "Drag to move",
                        onPointerDown: (event: React.PointerEvent<HTMLElement>) =>
                          grab(event, widget, "move"),
                      }
                    : {})}
                >
                  <h2 className="m-0 truncate text-[14px] font-semibold">
                    {widget.title || heading(widget.id)}
                  </h2>
                  {editing ? (
                    <Button
                      size="small"
                      variant={active ? "primary" : "quiet"}
                      onClick={() => editing.onSelect(widget.id)}
                    >
                      {active ? "Editing" : "Edit"}
                    </Button>
                  ) : null}
                </header>
              ) : null}
              {movable ? (
                <span
                  aria-hidden="true"
                  title="Drag to change its size"
                  className="absolute right-0 bottom-0 z-10 hidden h-4 w-4 cursor-nwse-resize touch-none rounded-br-[inherit] border-action border-r-2 border-b-2 md:block"
                  onPointerDown={(event) => grab(event, widget, "stretch")}
                />
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <WidgetView
                  widget={widget}
                  source={source}
                  chosen={source ? chosen[source.id] : undefined}
                  info={widget.table ? tables[widget.table] : undefined}
                  tables={tables}
                  client={client}
                  version={version}
                  lookups={lookups}
                  selected={chosen[widget.id]}
                  followed={followed.has(widget.id)}
                  onSelect={(row) => setChosen((before) => ({ ...before, [widget.id]: row }))}
                  onChanged={changed}
                  onLooked={looked}
                  narrowed={pageNarrowing(
                    page,
                    narrow,
                    widget.table ? tables[widget.table] : undefined,
                  )}
                />
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/** One page of widgets, each reading its own rows, and following the rows chosen in others. */
export function PageRenderer(props: PageRendererProps) {
  return (
    <DialogsProvider>
      {/* A new page starts with nothing chosen. */}
      <PageBody key={props.page.id} {...props} />
    </DialogsProvider>
  );
}

export interface InterfaceRendererProps {
  body: InterfaceBody;
  tables: Record<string, TableInfo>;
  client: DataClient;
  /** The page that is open. The first, when left out. */
  pageId?: string | undefined;
  onPage?: (id: string) => void;
}

/** A whole interface: its pages as tabs when there are several, and the open one drawn. */
export function InterfaceRenderer({
  body,
  tables,
  client,
  pageId,
  onPage,
}: InterfaceRendererProps) {
  const [open, setOpen] = useState<string | undefined>(pageId);
  const current = body.pages.find((page) => page.id === (pageId ?? open)) ?? body.pages[0];
  if (!current) return <p className="m-0 text-ink-muted">This app has no pages yet.</p>;
  const drawn = <PageRenderer page={current} tables={tables} client={client} />;
  if (body.pages.length === 1) return drawn;
  return (
    <Tabs
      label="Pages"
      value={current.id}
      onChange={(id) => {
        setOpen(id);
        onPage?.(id);
      }}
      tabs={body.pages.map((page) => ({
        id: page.id,
        label: page.title,
        content: page.id === current.id ? drawn : null,
      }))}
    />
  );
}
