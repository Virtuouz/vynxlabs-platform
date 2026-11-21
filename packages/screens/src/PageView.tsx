import type { Page, PageFilter, PageWidget } from "@volvel/manifest";
import { type ActingUser, type Condition, conditionWords } from "@volvel/manifest/action";
import { EmptyState, Panel, useFlip } from "@volvel/ui";
import { GripHorizontal } from "@volvel/ui/icons";
import type { ActOutcome, Choice, EventPayload } from "@volvel/widgets";
import type React from "react";
import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ActionsHost,
  actionAt,
  groupOf,
  holds,
  type NavigateTo,
  type Request,
  recordOf,
  useActions,
} from "./actions.tsx";
import { FilterBar } from "./FilterBar.tsx";
import { Frame, nameOf } from "./Frame.tsx";
import { duplicated, limitsOf, placed, sizeWords, without } from "./layout.ts";
import {
  type Box,
  CARRIED,
  type Card,
  type Carrying,
  type HowMoved,
  isControl,
  usePlacement,
} from "./placement.ts";
import type { FilterValues, PageDataClient, ViewEntry, ViewRegistry } from "./types.ts";
import { useWidgetData } from "./useWidgetData.ts";

export interface PageViewProps {
  widgets: readonly PageWidget[];
  filters: readonly PageFilter[];
  registry: ViewRegistry;
  client: PageDataClient;
  filterValues: FilterValues;
  onFilterValues(values: FilterValues): void;
  /** Bumped to make every widget read again. */
  refreshKey?: number;
  /**
   * An action ran here. A host that draws other pages at once (a side sheet over its page)
   * tells them, so the table under a sheet shows what the sheet's button changed.
   */
  onActed?: () => void;
  /** For a choice filter that lists a table's column: what was read for it, by filter name. */
  filterOptions?: Readonly<Record<string, readonly string[]>>;
  /** A widget raised an event its definition declares. Told after the page has done what its widget says to do. */
  onEvent?: (widget: string, event: string, payload: EventPayload) => void;
  /** The record the page is open on: a record page, a side sheet or a modal. */
  record?: string;
  /** Who is looking, for drawing `when` and `showWhen`. The server checks again. */
  user?: ActingUser;
  /** An action opens a page, or closes the sheet or modal it is in. Left out, they are not followed. */
  onNavigate?(to: NavigateTo): void;
  /** The page is shown as a side sheet or a modal: its views are given `close`. */
  over?: boolean;
  /** The record whose side sheet or modal is open over this page: its row, in the widget that lists it, is marked (`selectedRecord`). */
  overRecord?: string;
  /** The pages of the app, so that `open` knows whether its target is a page, a sheet or a modal. */
  pages?: readonly Page[];
  /** Present while building: the canvas. */
  editing?: {
    selected: string | undefined;
    onSelect(id: string | undefined): void;
    /** Every change of place or size, or a removal or duplicate, as a new widget list, with words for Undo ("Moved Invoices"). */
    onChange(widgets: PageWidget[], label: string): void;
    onRename(id: string, title: string): void;
    /** A column heading was clicked in a table while building. */
    onColumn?(id: string, column: string): void;
    /**
     * Something carried onto the page from outside it ("Add to page"), from where the
     * pointer was when the carrying began. A new value starts a new carry. `onDrop` is
     * told where it landed, or nothing when it was let go off the page or Esc was pressed.
     */
    carrying?: CarryRequest | undefined;
  };
}

/** A widget not yet on the page, held by the pointer. */
export interface CarryRequest {
  card: Card;
  from: { x: number; y: number };
  onDrop(at: Box | undefined): void;
}

type Editing = NonNullable<PageViewProps["editing"]>;

/** The room a page is given, below which its widgets stack in reading order: 42rem, as the stylesheet says. */
const NARROW_REM = 42;

/** Whether the element is narrower than a phone's width or so. Measured at once, and kept as it changes. */
function useNarrow(ref: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const measure = (width: number) => setNarrow(width > 0 && width < NARROW_REM * rem);
    measure(node.getBoundingClientRect().width);
    if (typeof ResizeObserver !== "function") return;
    const watching = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) measure(width);
    });
    watching.observe(node);
    return () => watching.disconnect();
  }, [ref]);
  return narrow;
}

function Cell({
  widget,
  entry,
  at,
  held,
  arriving,
  narrow,
  flow,
  client,
  filterValues,
  refreshKey,
  emptyMessage,
  editing,
  selected,
  onEvent,
  handlers,
  run,
  record,
  thisRow,
  user,
  onRecord,
  fade,
  onClose,
  overRecord,
}: {
  /** Closes the sheet or modal the page is shown in; absent when it is not. */
  onClose: (() => void) | undefined;
  overRecord: string | undefined;
  run(request: Request): Promise<ActOutcome>;
  /** The page's record id, and its row when a widget has read it. */
  record: string | undefined;
  thisRow: Readonly<Record<string, unknown>> | undefined;
  user: ActingUser | undefined;
  onRecord(row: Readonly<Record<string, unknown>>): void;
  /** While building, what decides when the widget is shown: it is drawn faded, with this said. */
  fade: string | undefined;
  widget: PageWidget;
  entry: ViewEntry | undefined;
  at: Box;
  held: boolean;
  /** It is new on the page since the page was opened: it fades in where it lands. */
  arriving: boolean;
  narrow: boolean;
  /** Drawn in a column at its own height (a served side sheet or modal), not at its place on the grid. */
  flow: boolean;
  client: PageDataClient;
  filterValues: FilterValues;
  refreshKey: number;
  emptyMessage: string;
  editing: Editing | undefined;
  selected: boolean;
  onEvent: PageViewProps["onEvent"];
  handlers: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>, how: HowMoved) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  };
}) {
  const definition = entry?.definition;
  // A widget drawn on the page as it is, with no card: a button.
  const bare = definition?.layout.frame === "none";
  // Whether it arrived is as of when it first drew: the next draw must not stop its fade.
  const [arrived] = useState(arriving);
  // A widget added before its source was chosen has nothing to ask for yet.
  // A summary with fewer values or breakdowns than it needs (a pivot broken down one way) is not
  // finished either.
  const waiting =
    definition !== undefined &&
    Object.entries(definition.data).some(([input, declared]) => {
      const given = widget.data?.[input];
      if (!given) return declared.required !== false;
      if (declared.shape !== "summary" || !("visual" in given.source)) return false;
      const { measures = [], groupBy = [] } = given.source.visual;
      return (
        measures.length < (declared.values?.min ?? 1) ||
        groupBy.length < (declared.breakdowns?.min ?? 0)
      );
    });
  const reading = useWidgetData({
    client,
    widget,
    reads: definition !== undefined && Object.keys(definition.data).length > 0 && !waiting,
    filterValues,
    refreshKey,
    emptyMessage,
  });
  const building = editing !== undefined;
  const config = { ...definition?.defaults, ...widget.config };
  const View = entry?.View;
  const emit = (event: string, payload: EventPayload) => {
    // A column heading clicked while building is the builder's: it opens that column's settings.
    if (building && event === "column") {
      const column = (payload as { group?: { column?: unknown } }).group?.column;
      if (typeof column === "string") editing?.onColumn?.(widget.id, column);
      return;
    }
    // Events are for a page that is read, and only those the definition declares.
    if (building || !definition || !(event in definition.events)) return;
    if (widget.on?.[event]) {
      const id = recordOf(payload);
      void run({
        widget,
        at: `on/${event}`,
        record: id,
        row: id ? lookup(id) : undefined,
        group: groupOf(payload),
        input: groupInput,
        among: amongIds(),
      });
    }
    onEvent?.(widget.id, event, payload);
  };
  // The rows the widget read, to find a row by its id and to step through them.
  const rowsRead = Object.values(reading.read ?? {}).find((wire) => wire.shape === "rows");
  // A record the widget read (a Record detail's) is found too, and the page's own record:
  // a confirmation names what it is about ("Mark INV-9339 as paid?").
  const recordRead = Object.values(reading.read ?? {}).find((wire) => wire.shape === "record");
  const lookup = (id: string) =>
    rowsRead?.rows.find((row) => row.id === id) ??
    (recordRead?.shape === "record" && recordRead.record?.id === id
      ? recordRead.record
      : undefined) ??
    (thisRow?.id === id ? thisRow : undefined);
  const amongIds = () =>
    rowsRead?.rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
  // The summary input a clicked group belongs to: the rows behind it are read for that input.
  const groupInput = Object.entries(definition?.data ?? {}).find(
    ([, declared]) => declared.shape === "summary",
  )?.[0];
  // A widget that shows the page's record tells the page what it holds, for `when` and `{column}`.
  const seen = reading.read;
  // biome-ignore lint/correctness/useExhaustiveDependencies: told again only when something new was read
  useEffect(() => {
    if (!record) return;
    for (const wire of Object.values(seen ?? {})) {
      if (wire.shape === "record" && wire.record && String(wire.record.id) === record)
        onRecord(wire.record);
    }
  }, [seen, record]);
  // What views read beyond the contract's props: how to close the sheet they are in, and which row is open.
  const selectedRecord = overRecord && lookup(overRecord) ? overRecord : undefined;
  const extras = {
    ...(onClose ? { close: onClose } : {}),
    ...(selectedRecord ? { selectedRecord } : {}),
  };
  const name = nameOf(widget, definition);
  const hiddenOnPhones = definition?.layout.phone === "hide";
  const style = {
    "--col": `${at.x + 1} / span ${at.w}`,
    "--row": `${at.y + 1} / span ${at.h}`,
  } as CSSProperties;
  return (
    <Card
      bare={bare}
      building={building}
      aria-label={name}
      // What is held follows the pointer, and is not played from where it was.
      data-flip-key={held ? undefined : widget.id}
      data-selected={selected ? "" : undefined}
      style={style}
      // A view may size what it draws by its cell's width: the container named `cell`.
      className={`@container/cell relative flex min-h-0 min-w-0 flex-col ${
        flow ? "" : "@2xl:[grid-column:var(--col)] @2xl:[grid-row:var(--row)]"
      } ${
        selected ? "ring-2 ring-action" : ""
      } ${fade ? "opacity-60" : ""} ${held ? "layer-sticky opacity-90 shadow-drag" : ""} ${arrived ? "animate-arrive" : ""} ${
        building ? "cursor-grab touch-pan-y select-none active:cursor-grabbing" : ""
      }`}
      {...(building
        ? {
            role: "group",
            tabIndex: 0,
            onClick: () => editing?.onSelect(widget.id),
            // Arriving by keyboard chooses it, so that the keys that follow are for it.
            onFocus: (event: React.FocusEvent<HTMLElement>) => {
              if (event.target === event.currentTarget && !selected) editing?.onSelect(widget.id);
            },
            onPointerDown: (event: React.PointerEvent<HTMLElement>) =>
              handlers.onPointerDown(event, "move"),
            onKeyDown: handlers.onKeyDown,
          }
        : {})}
    >
      <Frame
        widget={widget}
        definition={definition}
        reading={reading}
        selected={selected}
        building={building}
        onRename={editing ? (title) => editing.onRename(widget.id, title) : undefined}
        tabbable={!narrow}
      >
        {waiting ? (
          <p className="m-0 text-ink-muted">
            {building ? "Choose what it shows in Data." : "Nothing is set up here yet."}
          </p>
        ) : View ? (
          <View
            config={config}
            data={reading.data}
            size={{ w: at.w, h: at.h, narrow }}
            emit={emit}
            building={building}
            {...extras}
            {...(building || !client.act
              ? {}
              : {
                  act: (
                    at: string,
                    given?: { record?: string; inputs?: Readonly<Record<string, unknown>> },
                  ) =>
                    run({
                      widget,
                      at,
                      record: given?.record,
                      row: given?.record ? lookup(given.record) : undefined,
                      input: groupInput,
                      inputs: given?.inputs,
                      among: amongIds(),
                    }),
                })}
            can={(at, row) =>
              holds(actionAt(widget, at)?.when, { this: record ? thisRow : null, event: row }, user)
            }
            why={(at, row) => {
              const when = actionAt(widget, at)?.when;
              const records = { this: record ? thisRow : null, event: row };
              const failing = (when ?? []).filter((one) => !holds([one], records, user));
              return failing.length > 0
                ? `Only when ${failing.map((one) => conditionWords(one)).join(" and ")}.`
                : undefined;
            }}
            listens={(event) => !building && widget.on?.[event] !== undefined}
            {...(client.choices
              ? {
                  choices: (
                    input: string,
                    column: string,
                    search: string,
                  ): Promise<readonly Choice[]> =>
                    client.choices?.(widget.id, input, column, search) ?? Promise.resolve([]),
                }
              : {})}
          />
        ) : null}
      </Frame>
      {fade ? (
        <p className="m-0 px-3 pb-2 text-meta text-ink-muted">Shown only when {fade}</p>
      ) : null}
      {building && narrow && hiddenOnPhones ? (
        <span className="absolute top-2 right-2 text-meta text-ink-muted">Hidden on phones</span>
      ) : null}
      {selected || held ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-3 left-1/2 layer-sticky flex h-4 w-7 -translate-x-1/2 items-center justify-center rounded-inner bg-action text-action-ink"
          >
            <GripHorizontal size={14} />
          </span>
          {!narrow ? (
            <span
              aria-hidden="true"
              title="Drag to change its size"
              className="absolute -right-1 -bottom-1 layer-sticky size-3 cursor-nwse-resize touch-none rounded-inner border-2 border-canvas bg-action after:absolute after:-inset-2 after:content-['']"
              onPointerDown={(event) => {
                event.stopPropagation();
                handlers.onPointerDown(event, "stretch");
              }}
            />
          ) : null}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-2 -bottom-8 layer-sticky rounded-inner border border-line-strong bg-raised px-2 py-0.5 font-mono text-meta text-ink"
          >
            {sizeWords(at)}
          </span>
        </>
      ) : null}
    </Card>
  );
}

/**
 * A page: its filters and its widgets on twelve columns. Each widget reads its
 * own data, under the viewer's permissions, from the client. With `editing` it
 * is the builder's canvas: a click chooses a widget, which is dragged by
 * itself and stretched by its corner, moved a cell with the arrows, changed in
 * size with Shift and the arrows, copied with ⌘D or Ctrl+D, removed with
 * Delete, and let go with Esc.
 */
export function PageView({
  widgets,
  filters,
  registry,
  client,
  filterValues,
  onFilterValues,
  refreshKey = 0,
  onActed,
  filterOptions,
  onEvent,
  record,
  user,
  onNavigate,
  over,
  overRecord,
  pages,
  editing,
}: PageViewProps) {
  const [told, setTold] = useState("");
  // Each action that ran makes every widget read again, on top of the host's own refresh.
  const [ran, setRan] = useState(0);
  const [thisRow, setThisRow] = useState<Readonly<Record<string, unknown>>>();
  const host: ActionsHost = {
    client,
    registry,
    record,
    pages,
    filterValues,
    onFilterValues,
    onNavigate,
    // A host that hears of actions makes every page on screen read again, this one too;
    // otherwise this page does it for itself.
    refresh: () => (onActed ? onActed() : setRan((count) => count + 1)),
    label: (value) => value,
  };
  const actions = useActions(host);
  // What decides whether a widget is shown, as far as the browser knows it.
  const shownNow = (conditions: readonly Condition[] | undefined) =>
    holds(conditions, { this: record ? thisRow : null }, user);
  const read = useFilterOptions(filters, client, filterOptions);
  // Top to bottom and left to right, so the page reads in order without the grid.
  const ordered = useMemo(
    () => [...widgets].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x),
    [widgets],
  );
  const byId = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget])), [widgets]);
  const name = useCallback(
    (id: string) => {
      const widget = byId.get(id);
      return widget ? nameOf(widget, registry.get(widget.type)?.definition) : id;
    },
    [byId, registry],
  );

  const gridRef = useRef<HTMLDivElement>(null);
  const placement = usePlacement({
    grid: gridRef,
    limits: (id) => limitsOf(registry.get(byId.get(id)?.type ?? "")?.definition),
    onGrabbed: (id) => editing?.onSelect(id),
    onMove: editing
      ? (id, at, _by, how) =>
          editing.onChange(
            placed(widgets, id, at),
            `${how === "move" ? "Moved" : "Resized"} ${name(id)}`,
          )
      : undefined,
  });

  const remove = (id: string) => {
    if (!editing) return;
    const label = name(id);
    editing.onChange(without(widgets, id), `Removed ${label}`);
    editing.onSelect(undefined);
    setTold(`${label} is removed.`);
  };
  const duplicate = (id: string) => {
    if (!editing) return;
    const made = duplicated(widgets, id);
    if (!made) return;
    editing.onChange(made.widgets, `Duplicated ${name(id)}`);
    editing.onSelect(made.copy.id);
    setTold(`${name(id)} is copied.`);
  };

  const narrow = useNarrow(gridRef);
  // A served side sheet or modal is a column of its widgets, each as tall as what it holds:
  // the grid's rows are sized for a page, and would leave a form's sheet half empty.
  const flow = over === true && !editing;

  // Where everything is drawn: while something is held or carried, where it would all be
  // if it were let go now, so what is in the way is seen to move aside as it travels.
  const carrying = placement.carrying;
  const preview = useMemo(() => {
    const boxes = widgets.map((widget) => ({ id: widget.id, at: widget.at }));
    const held = placement.held;
    if (held) return placed(boxes, held.id, held.at);
    if (carrying?.at)
      return placed([...boxes, { id: CARRIED, at: carrying.at }], CARRIED, carrying.at);
    return boxes;
  }, [widgets, placement.held, carrying?.at]);
  const drawnAt = useMemo(() => new Map(preview.map((one) => [one.id, one.at])), [preview]);
  useFlip(JSON.stringify(preview), { ref: gridRef });

  // A widget that was not on the page when it was opened has arrived: added, copied or carried in.
  const known = useRef<Set<string> | undefined>(undefined);
  known.current ??= new Set(widgets.map((widget) => widget.id));
  useEffect(() => {
    for (const widget of widgets) known.current?.add(widget.id);
  });

  // A carry asked for by the host starts once per request.
  const carryRequest = editing?.carrying;
  const endRow = () => widgets.reduce((low, widget) => Math.max(low, widget.at.y + widget.at.h), 0);
  const narrowNow = useRef(narrow);
  narrowNow.current = narrow;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a request is started once, when it is new
  useEffect(() => {
    if (!carryRequest) return;
    placement.carry(carryRequest.card, carryRequest.from, carryRequest.onDrop, {
      narrow: () => narrowNow.current,
      endRow,
    });
  }, [carryRequest]);
  const emptyMessage =
    filters.length > 0 ? "Nothing matches the filters above." : "There is nothing here yet.";

  return (
    <div className="flex flex-col gap-3">
      <FilterBar filters={filters} values={filterValues} onChange={onFilterValues} options={read} />
      {widgets.length === 0 ? (
        <EmptyState
          title={editing ? "Nothing on this page yet" : "This page has nothing on it yet"}
        >
          {editing ? "Add a widget to start." : undefined}
        </EmptyState>
      ) : null}
      {/*
        The page lays itself out by the room it is given, not by the window's width: an app
        served full-width and a preview drawn at a phone's width both get the layout of their size.
      */}
      <div className="@container">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: a click on the empty page lets go of the chosen widget; Esc does the same from the keyboard */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: as above */}
        <div
          ref={gridRef}
          className={
            flow
              ? "grid grid-cols-1 gap-3"
              : "grid grid-cols-1 gap-3 @2xl:auto-rows-[2.5rem] @2xl:grid-cols-12"
          }
          onClick={(event) => {
            if (editing && event.target === event.currentTarget) editing.onSelect(undefined);
          }}
        >
          {ordered.map((widget) => {
            const entry = registry.get(widget.type);
            // On a phone a widget whose definition says so is not shown at all.
            if (!editing && narrow && entry?.definition.layout.phone === "hide") return null;
            // Served, a widget whose conditions do not hold is not drawn; building, it is drawn faded and says when.
            const showWhen = widget.rules?.showWhen;
            if (!editing && !shownNow(showWhen)) return null;
            const fade =
              editing && showWhen && showWhen.length > 0
                ? showWhen
                    .map((one) => conditionWords(one, (field) => field.replace(/_/g, " ")))
                    .join(" and ")
                : undefined;
            const at = drawnAt.get(widget.id) ?? widget.at;
            const selected = editing?.selected === widget.id;
            return (
              <Cell
                key={widget.id}
                widget={widget}
                entry={entry}
                at={at}
                held={placement.held?.id === widget.id}
                arriving={editing !== undefined && !known.current?.has(widget.id)}
                narrow={narrow}
                flow={flow}
                client={client}
                filterValues={filterValues}
                refreshKey={refreshKey + ran}
                emptyMessage={emptyMessage}
                editing={editing}
                selected={selected}
                onEvent={onEvent}
                run={actions.run}
                record={record}
                thisRow={thisRow}
                user={user}
                onRecord={setThisRow}
                fade={fade}
                onClose={over ? () => onNavigate?.({ close: true }) : undefined}
                overRecord={overRecord}
                handlers={{
                  onPointerDown: (event, how) => {
                    // A press on a widget that is not a drag chooses it by click, below.
                    if (narrow && how === "move") return;
                    placement.grab(event, widget.id, widget.at, how);
                  },
                  onKeyDown: (event) => {
                    if (!editing || isControl(event.target)) return;
                    if (event.key === "Escape") {
                      editing.onSelect(undefined);
                    } else if (event.key === "Delete") {
                      event.preventDefault();
                      remove(widget.id);
                    } else if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key.toLowerCase() === "d"
                    ) {
                      // The browser's own answer to this is a bookmark.
                      event.preventDefault();
                      duplicate(widget.id);
                    } else if (!event.metaKey && !event.ctrlKey) {
                      placement
                        .keys(widget.id, nameOf(widget, entry?.definition), widget.at)
                        .onKeyDown(event);
                    }
                  },
                }}
              />
            );
          })}
          {carrying?.at ? <Landing card={carrying.card} at={carrying.at} /> : null}
        </div>
        {carrying && !carrying.at ? <Carried carrying={carrying} /> : null}
        <span role="status" className="sr-only">
          {placement.said}
        </span>
        <span role="status" className="sr-only">
          {told}
        </span>
      </div>
      {actions.node}
    </div>
  );
}

/**
 * The values each choice filter offers: those the page lists, those the host
 * gave, and for a filter over a table's column, those the client reads. A
 * read that fails leaves the filter to be typed into, as before it was read.
 */
function useFilterOptions(
  filters: readonly PageFilter[],
  client: PageDataClient,
  given: Readonly<Record<string, readonly string[]>> | undefined,
): Readonly<Record<string, readonly string[]>> | undefined {
  const [read, setRead] = useState<Record<string, readonly string[]>>({});
  const wanted = filters
    .filter(
      (filter) =>
        filter.type === "choice" && filter.from && !filter.choices && !given?.[filter.name],
    )
    .map((filter) => filter.name)
    .join(",");
  useEffect(() => {
    if (!client.options || wanted === "") return;
    let live = true;
    for (const name of wanted.split(",")) {
      client.options(name).then(
        (values) => live && setRead((now) => ({ ...now, [name]: values })),
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
  }, [client, wanted]);
  return useMemo(
    () => (given || Object.keys(read).length > 0 ? { ...read, ...given } : undefined),
    [given, read],
  );
}

/** Where something carried onto the page would land, at its size, with what it is. */
function Landing({ card, at }: { card: Card; at: Box }) {
  const style = {
    "--col": `${at.x + 1} / span ${at.w}`,
    "--row": `${at.y + 1} / span ${at.h}`,
  } as CSSProperties;
  return (
    <div
      aria-hidden="true"
      data-flip-key={CARRIED}
      data-landing=""
      style={style}
      className="relative flex min-h-24 flex-col justify-center gap-0.5 rounded-panel border-2 border-dashed border-action bg-action-soft px-4 @2xl:min-h-0 @2xl:[grid-column:var(--col)] @2xl:[grid-row:var(--row)]"
    >
      <span className="truncate font-semibold text-ink">{card.title}</span>
      <span className="text-body-sm text-ink-muted">{card.kind}</span>
      <span className="pointer-events-none absolute right-2 -bottom-8 layer-sticky rounded-inner border border-line-strong bg-raised px-2 py-0.5 font-mono text-meta text-ink">
        {sizeWords(at)}
      </span>
    </div>
  );
}

/** What is being carried, under the pointer, while it is not over the page. */
function Carried({ carrying }: { carrying: Carrying }) {
  return (
    <div
      aria-hidden="true"
      data-carried=""
      style={{ left: carrying.pointer.x, top: carrying.pointer.y }}
      className="pointer-events-none fixed layer-sticky flex -translate-x-1/2 translate-y-2 flex-col rounded-panel border border-line-strong bg-raised px-3 py-2 shadow-drag"
    >
      <span className="font-medium text-ink">{carrying.card.title}</span>
      <span className="text-body-sm text-ink-muted">Over the page to place it · Esc to cancel</span>
    </div>
  );
}

/**
 * What a widget is drawn on: a card (the kit's panel), or, for a widget whose definition says
 * `frame: "none"`, the page itself. While building, a bare widget keeps a dashed outline, so it
 * can be seen, chosen and moved.
 */
function Card({
  bare,
  building,
  className = "",
  children,
  ...rest
}: Omit<React.HTMLAttributes<HTMLElement>, "onSelect" | "title"> & {
  bare: boolean;
  building: boolean;
  className?: string;
  children?: React.ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  if (!bare) {
    return (
      <Panel as="section" className={className} {...rest}>
        {children}
      </Panel>
    );
  }
  return (
    <section
      {...rest}
      className={`${className} ${building ? "rounded-panel border border-dashed border-line" : ""}`}
    >
      {children}
    </section>
  );
}
