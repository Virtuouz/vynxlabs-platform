import type { Page, PageFilter, PageWidget, WidgetIn } from "@volvel/manifest";
import { type ActingUser, type Condition, conditionWords } from "@volvel/manifest/action";
import { childrenOf, isContainer, type Roles, tabsOf, topLevel } from "@volvel/manifest/parts";
import { EmptyState, Panel, useFlip } from "@volvel/ui";
import { EyeOff, GripHorizontal } from "@volvel/ui/icons";
import type { ActOutcome, Choice, DecideOutcome, EventPayload, FilterHost } from "@volvel/widgets";
import { calloutEdge } from "@volvel/widgets-core/views";
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
  mayRun,
  type NavigateTo,
  type Request,
  recordOf,
  seenByTag,
  seenByUser,
  useActions,
  whyNotRun,
} from "./actions.tsx";
import { Frame, nameOf } from "./Frame.tsx";
import { useFilterHost } from "./filterHost.ts";
import {
  duplicated,
  fitContainers,
  gridOf,
  limitsOf,
  putAt,
  sizeWords,
  without,
} from "./layout.ts";
import {
  type Device,
  hiddenOnPhone,
  intoTablet,
  onTablet,
  phoneMoved,
  phoneOrder,
  phoneSpans,
} from "./narrow.ts";
import {
  type Box,
  CARRIED,
  type Carrying,
  GRID,
  type HowMoved,
  isControl,
  type Card as PlaceCard,
  type Placement,
  usePlacement,
} from "./placement.ts";
import { recallTab, rememberTab } from "./tabMemory.ts";
import {
  ActionError,
  type FilterValues,
  type PageDataClient,
  type ViewEntry,
  type ViewRegistry,
} from "./types.ts";
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
  /**
   * Which tab of each Tabs is open, by the Tabs' widget id, and how to open another: the served
   * app keeps it in its address. Left out, and while building, the page keeps it itself.
   */
  tabs?: { open: Readonly<Record<string, string>>; choose(widget: string, tab: string): void };
  /**
   * Names where a folded Section is kept in this browser (`volvel.fold.<foldKey>.<widget>`): the
   * app's path and the page. Left out, a fold lasts until the page is left.
   */
  foldKey?: string;
  /**
   * The screen size the page is drawn for. The tablet draws each widget at the place set for it
   * (`layout.tablet.at`), and a move or a stretch on it is written there, after `editing.askLayout`.
   * The phone orders widgets by priority and its own places, and a move on it writes its own place.
   * Left out, the page is the desktop's; the phone's rules follow the room the grid is given.
   */
  device?: Device;
  /**
   * While building: draw the page as this group sees it (`key` is the group's key). A widget it
   * may not see is faded and says so, an action it may not run is greyed with the reason, a
   * `showWhen` on the user is judged for it. Rows are not: they are read as the builder.
   */
  viewAs?: { key: string; name: string };
  /** Present while building: the canvas. */
  editing?: {
    /**
     * Asked before a move or a stretch on the tablet's or the phone's drawing writes that device's
     * own layout. Left out, it is written.
     */
    askLayout?(device: "tablet" | "phone"): Promise<boolean>;
    selected: string | undefined;
    onSelect(id: string | undefined): void;
    /** Every change of place or size, or a removal or duplicate, as a new widget list, with words for Undo ("Moved Invoices"). */
    onChange(widgets: PageWidget[], label: string): void;
    onRename(id: string, title: string): void;
    /** A column heading was clicked in a table while building. */
    onColumn?(id: string, column: string): void;
    /** A Text widget was double-clicked: its words are to be written where they are. */
    onEditText?(id: string): void;
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
  card: PlaceCard;
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

/** What the page shares with every grid it draws, the page's own and each container's. */
interface GridContext {
  registry: ViewRegistry;
  roles: Roles;
  client: PageDataClient;
  filterValues: FilterValues;
  refreshKey: number;
  emptyMessage: string;
  /** The row last chosen in each table or list that something on the page follows, by widget id. */
  chosen: Readonly<Record<string, string>>;
  /** The tables and lists some widget follows (`{ selected: id }`): a click on a row chooses it. */
  followed: ReadonlySet<string>;
  choose(widget: string, record: string): void;
  editing: Editing | undefined;
  onEvent: PageViewProps["onEvent"];
  run(request: Request): Promise<ActOutcome>;
  /** Decides an approval an Approvals widget shows; the page reads again after, so what depends on it is true. */
  decide(
    widget: string,
    id: string,
    decision: "approve" | "reject",
    comment?: string,
  ): Promise<DecideOutcome>;
  /** Makes every widget read again. */
  refresh(): void;
  /** The page's record id, and its row when a widget has read it. */
  record: string | undefined;
  thisRow: Readonly<Record<string, unknown>> | undefined;
  user: ActingUser | undefined;
  /** While building as a group ("View as"): who the page is judged for, and what to call them. */
  viewing: { user: ActingUser; name: string } | undefined;
  /** A reorder on the phone's drawing: the widget is read before another, or last. */
  movePhone(id: string, before: string | undefined): void;
  onRecord(row: Readonly<Record<string, unknown>>): void;
  /** Closes the sheet or modal the page is shown in; absent when it is not. */
  onClose: (() => void) | undefined;
  overRecord: string | undefined;
  /** The pages of the app, to say by name what a click opens. */
  pages: readonly Page[] | undefined;
  placement: Placement;
  /** Every widget as it is drawn now: held ones where they would land, containers as tall as they are. */
  drawn: readonly PageWidget[];
  /** Every widget as it is stored. */
  stored: ReadonlyMap<string, PageWidget>;
  /** The widgets seen since the page was opened: those not in it have just arrived. */
  known: ReadonlySet<string>;
  shownNow(conditions: readonly Condition[] | undefined): boolean;
  /** Where what is held or carried would land, when that is a grid it is not on. */
  landing: { card: PlaceCard; in: WidgetIn | undefined } | undefined;
  /** The tab of a container that is open, and how to open another. */
  tab: {
    open(container: PageWidget): string | undefined;
    choose(container: string, tab: string): void;
  };
  /** Whether a Section is folded as its reader left it, and how to fold it. */
  fold: { folded(container: PageWidget): boolean; set(container: string, folded: boolean): void };
  remove(id: string): void;
  duplicate(id: string): void;
  nameOf(id: string): string;
  /** What a Search and filter widget is given, for the filters it declares. */
  hostFor(filters: readonly PageFilter[]): FilterHost;
  /** A widget drawn at its own height (a Search and filter) says how tall it is, in pixels. */
  measured(id: string, pixels: number): void;
}

/**
 * What a widget draws, measured when `on`: its height is told as it changes (a filter bar that
 * wraps on a narrow page), so the page can draw it as tall as it is. Otherwise only what it draws.
 */
function Measured({
  on,
  onSize,
  children,
}: {
  on: boolean;
  onSize: (pixels: number) => void;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const told = useRef(onSize);
  told.current = onSize;
  useEffect(() => {
    const node = box.current;
    if (!on || !node || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => told.current(node.offsetHeight));
    watch.observe(node);
    return () => watch.disconnect();
  }, [on]);
  return on ? <div ref={box}>{children}</div> : <>{children}</>;
}

/** Whether an event is for this cell and not for a widget drawn inside it. */
const isOwn = (event: { target: EventTarget | null; currentTarget: EventTarget }) =>
  (event.target as HTMLElement | null)?.closest?.("[data-widget-cell]") === event.currentTarget;

function Cell({
  ctx,
  widget,
  entry,
  at,
  held,
  away,
  arriving,
  narrow,
  selected,
  handlers,
  fade,
  hiddenFor,
  span,
  place,
}: {
  ctx: GridContext;
  /** While building "View as" a group that may not see it: drawn faded, saying so ("Hidden for Billing"). */
  hiddenFor: string | undefined;
  /** How many of the phone's two columns it takes. */
  span: 1 | 2;
  /** While building, what decides when the widget is shown: it is drawn faded, with this said. */
  fade: string | undefined;
  widget: PageWidget;
  entry: ViewEntry | undefined;
  at: Box;
  held: boolean;
  /** Being dragged to another grid: it stays where it was, faded, until it is let go. */
  away: boolean;
  /** It is new on the page since the page was opened: it fades in where it lands. */
  arriving: boolean;
  narrow: boolean;
  selected: boolean;
  /** A container's: the drawing of what it holds, in `tab` for Tabs. */
  place: ((tab?: string) => React.ReactNode) | undefined;
  handlers: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>, how: HowMoved) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  };
}) {
  const {
    client,
    filterValues,
    refreshKey,
    emptyMessage,
    editing,
    onEvent,
    run,
    record,
    thisRow,
    user,
    onRecord,
    onClose,
    overRecord,
  } = ctx;
  const definition = entry?.definition;
  // A container is drawn on the page as it is, its heading and what it holds, with no card.
  const container = place !== undefined;
  // A widget drawn on the page as it is, with no card: a button.
  const bare = definition?.layout.frame === "none" || container;
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
  // The rows chosen in the tables and lists this widget's sources follow (`{ selected }`).
  const follows = Object.values(widget.data ?? {}).flatMap((given) =>
    "selected" in given.source ? [given.source.selected] : [],
  );
  const chosenAsked = Object.fromEntries(
    follows.flatMap((id) => (ctx.chosen[id] !== undefined ? [[id, ctx.chosen[id]]] : [])),
  ) as Record<string, string>;
  const reading = useWidgetData({
    client,
    widget,
    reads: definition !== undefined && Object.keys(definition.data).length > 0 && !waiting,
    filterValues,
    refreshKey,
    // A table says what it says when empty, in the words its maker chose.
    emptyMessage:
      widget.type === "core/table" &&
      typeof widget.config?.empty === "string" &&
      widget.config.empty
        ? widget.config.empty
        : emptyMessage,
    chosen: Object.keys(chosenAsked).length > 0 ? chosenAsked : undefined,
  });
  const building = editing !== undefined;
  // A Section the reader folded is folded as they left it, whatever the page says it starts as.
  const folds = container && widget.config?.folds === true;
  const config = {
    ...definition?.defaults,
    ...widget.config,
    ...(folds ? { folded: ctx.fold.folded(widget) } : {}),
    // On a phone the filters sit behind one "Filters · n" button, beside the search.
    ...(narrow && definition?.role === "filters" ? { sit: "button" } : {}),
  };
  // Who the page is judged for: the builder's own view as a group, or the person looking.
  const actor = ctx.viewing?.user ?? user;
  const View = entry?.View;
  const emit = (event: string, payload: EventPayload) => {
    // A container's fold is the host's, which keeps it for the reader.
    if (folds && event === "fold") {
      const folded = (payload as { group?: { folded?: unknown } }).group?.folded;
      if (!building && typeof folded === "boolean") ctx.fold.set(widget.id, folded);
      return;
    }
    // A column heading clicked while building is the builder's: it opens that column's settings.
    if (building && event === "column") {
      const column = (payload as { group?: { column?: unknown } }).group?.column;
      if (typeof column === "string") editing?.onColumn?.(widget.id, column);
      return;
    }
    // Events are for a page that is read, and only those the definition declares.
    if (building || !definition || !(event in definition.events)) return;
    // The row clicked in a table or list that another widget follows is the one chosen in it.
    if (event === "rowClick" && ctx.followed.has(widget.id)) {
      const chosenId = recordOf(payload);
      if (chosenId) ctx.choose(widget.id, chosenId);
    }
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
  const chosenHere = ctx.followed.has(widget.id) ? ctx.chosen[widget.id] : undefined;
  const selectedRecord =
    overRecord && lookup(overRecord)
      ? overRecord
      : chosenHere && lookup(chosenHere)
        ? chosenHere
        : undefined;
  const extras = {
    ...(onClose ? { close: onClose } : {}),
    ...(selectedRecord ? { selectedRecord } : {}),
    ...(definition?.role === "filters"
      ? {
          filters: ctx.hostFor(
            Array.isArray(widget.config?.filters) ? (widget.config.filters as PageFilter[]) : [],
          ),
        }
      : {}),
  };
  const name = nameOf(widget, definition);
  // Building: a table or list says what a click on a row does.
  const opened = widget.on?.rowClick?.steps.find((step) => step.do === "open");
  const opens =
    building && definition && "rowClick" in definition.events && opened?.do === "open"
      ? (ctx.pages?.find((one) => one.id === opened.page)?.title ?? opened.page)
      : undefined;
  const style = {
    "--col": `${at.x + 1} / span ${at.w}`,
    "--row": `${at.y + 1} / span ${at.h}`,
  } as CSSProperties;
  const tab = container
    ? {
        tab: {
          open: ctx.tab.open(widget),
          choose: (to: string) => ctx.tab.choose(widget.id, to),
        },
      }
    : {};
  return (
    <Card
      bare={bare}
      building={building}
      aria-label={name}
      // What is held follows the pointer, and is not played from where it was.
      data-flip-key={held ? undefined : widget.id}
      data-widget-cell={widget.id}
      data-selected={selected ? "" : undefined}
      style={style}
      // A view may size what it draws by its cell's width: the container named `cell`.
      className={`@container/cell relative flex min-h-0 min-w-0 flex-col ${calloutEdge(widget.type, widget.config)} ${span === 2 ? "col-span-2" : ""} @2xl:[grid-column:var(--col)] @2xl:[grid-row:var(--row)] ${
        selected ? "ring-2 ring-action" : building ? "hover:ring-1 hover:ring-action/40" : ""
      } ${fade || away ? "opacity-60" : ""} ${hiddenFor ? "opacity-40" : ""} ${held ? "layer-sticky opacity-90 shadow-drag" : ""} ${arrived ? "animate-arrive" : ""} ${
        building ? "cursor-grab touch-pan-y select-none active:cursor-grabbing" : ""
      }`}
      {...(building
        ? {
            role: "group",
            tabIndex: 0,
            // A press, a click or a key inside a widget in this one is that widget's, not this one's.
            onClick: (event: React.MouseEvent<HTMLElement>) => {
              if (isOwn(event)) editing?.onSelect(widget.id);
            },
            // Arriving by keyboard chooses it, so that the keys that follow are for it.
            ...(editing?.onEditText && widget.type === "core/text"
              ? {
                  onDoubleClick: (event: React.MouseEvent<HTMLElement>) => {
                    if (isOwn(event) && !isControl(event.target)) editing.onEditText?.(widget.id);
                  },
                }
              : {}),
            onFocus: (event: React.FocusEvent<HTMLElement>) => {
              if (event.target === event.currentTarget && !selected) editing?.onSelect(widget.id);
            },
            onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
              if (isOwn(event)) handlers.onPointerDown(event, "move");
            },
            onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
              if (isOwn(event)) handlers.onKeyDown(event);
            },
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
        container={container}
        opens={opens}
      >
        {waiting ? (
          <p className="m-0 text-ink-muted">
            {building ? "Choose what it shows in Data." : "Nothing is set up here yet."}
          </p>
        ) : View ? (
          <Measured
            on={entry?.definition.role === "filters"}
            onSize={(pixels) => ctx.measured(widget.id, pixels)}
          >
            <View
              config={config}
              data={reading.data}
              size={{ w: at.w, h: at.h, narrow }}
              emit={emit}
              building={building}
              {...(building && ctx.viewing ? { viewing: true } : {})}
              {...(widget.title ? { title: widget.title } : {})}
              {...extras}
              {...(place ? { place } : {})}
              {...tab}
              {...(building ? {} : { refresh: () => ctx.refresh() })}
              {...(building || !client.decide
                ? {}
                : {
                    decide: (id: string, decision: "approve" | "reject", comment?: string) =>
                      ctx.decide(widget.id, id, decision, comment),
                  })}
              {...(building || !client.act
                ? {}
                : {
                    act: (
                      at: string,
                      given?: {
                        record?: string;
                        records?: readonly string[];
                        inputs?: Readonly<Record<string, unknown>>;
                      },
                    ) =>
                      run({
                        widget,
                        at,
                        record: given?.record,
                        // Several rows chosen: the first stands for them in the confirmation.
                        ...(given?.records ? { records: given.records } : {}),
                        row:
                          (given?.record ?? given?.records?.[0])
                            ? lookup((given.record ?? given.records?.[0]) as string)
                            : record
                              ? thisRow
                              : undefined,
                        input: groupInput,
                        inputs: given?.inputs,
                        among: amongIds(),
                      }),
                  })}
              can={(at, row) =>
                ((building && !ctx.viewing) || mayRun(actionAt(widget, at), actor)) &&
                holds(
                  actionAt(widget, at)?.when,
                  { this: record ? thisRow : null, event: row },
                  actor,
                )
              }
              why={(at, row) => {
                const denied =
                  building && !ctx.viewing ? undefined : whyNotRun(actionAt(widget, at), actor);
                if (denied) return denied;
                const when = actionAt(widget, at)?.when;
                const records = { this: record ? thisRow : null, event: row };
                const failing = (when ?? []).filter((one) => !holds([one], records, actor));
                return failing.length > 0
                  ? `Only when ${failing.map((one) => conditionWords(one)).join(" and ")}.`
                  : undefined;
              }}
              listens={(event) =>
                !building &&
                (widget.on?.[event] !== undefined ||
                  (event === "rowClick" && ctx.followed.has(widget.id)))
              }
              {...(user
                ? {
                    viewer: {
                      id: user.id,
                      ...(user.email ? { email: user.email } : {}),
                      ...(user.name ? { name: user.name } : {}),
                    },
                  }
                : {})}
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
          </Measured>
        ) : null}
      </Frame>
      {fade ? (
        <p className="m-0 px-3 pb-2 text-meta text-ink-muted">Shown only when {fade}</p>
      ) : null}
      {hiddenFor ? (
        <span
          data-hidden-for=""
          className="pointer-events-none absolute top-1 left-1 layer-sticky rounded-inner bg-sunken px-1.5 text-meta text-ink-muted"
        >
          {hiddenFor}
        </span>
      ) : building && seenByTag(widget.rules) ? (
        <span
          data-seen-by=""
          className="pointer-events-none absolute top-1 left-1 rounded-inner bg-sunken px-1.5 text-meta text-ink-muted"
        >
          {seenByTag(widget.rules)}
        </span>
      ) : null}
      {selected || held ? (
        <>
          <span
            aria-hidden="true"
            data-chrome="handle"
            className="pointer-events-none absolute -top-3 left-1/2 layer-sticky flex h-4 w-7 -translate-x-1/2 items-center justify-center rounded-inner bg-action text-action-ink"
          >
            <GripHorizontal size={14} />
          </span>
          {!narrow ? (
            <span
              aria-hidden="true"
              data-chrome="resize"
              title="Drag to change its size"
              className="absolute -right-1 -bottom-1 layer-sticky size-2.5 cursor-nwse-resize touch-none rounded-none border border-canvas bg-action after:absolute after:-inset-2 after:content-['']"
              onPointerDown={(event) => {
                event.stopPropagation();
                handlers.onPointerDown(event, "stretch");
              }}
            />
          ) : null}
          <span
            aria-hidden="true"
            data-chrome="size"
            className="pointer-events-none absolute right-2 -bottom-8 layer-sticky rounded-inner border border-line-strong bg-raised px-2 py-0.5 font-mono text-meta text-ink"
          >
            {sizeWords(at)}
          </span>
        </>
      ) : null}
    </Card>
  );
}

/** What a page remembers of how a Section was left, for the reader, in this browser. Never needed: every access may fail. */
function foldStored(key: string): boolean | undefined {
  try {
    const value = window.localStorage.getItem(key);
    return value === "1" ? true : value === "0" ? false : undefined;
  } catch {
    return undefined;
  }
}
function foldKept(key: string, folded: boolean) {
  try {
    window.localStorage.setItem(key, folded ? "1" : "0");
  } catch {
    // Not kept: it is folded for now, and starts as the page says after a reload.
  }
}

/**
 * Widgets on twelve columns: the page's own, or, inside a container, that container's (or one
 * tab of it). The one piece that draws a grid, so a container's is the page's: the same classes,
 * the same reading order on a phone, the same container query by the room it is given, the
 * same places and the same moves. Each widget in it is drawn as any widget of the page is.
 */
function WidgetGrid({
  ctx,
  widgets,
  inner,
  gridRef,
}: {
  ctx: GridContext;
  /** What is on this grid, as it is drawn. */
  widgets: readonly PageWidget[];
  /** Absent for the page's own grid. */
  inner?: { container: string; tab?: string };
  /** The page's grid is measured by the page too. */
  gridRef?: RefObject<HTMLDivElement | null>;
}) {
  const own = useRef<HTMLDivElement>(null);
  const ref = gridRef ?? own;
  const narrow = useNarrow(ref);
  const { editing, placement, drawn } = ctx;
  // Top to bottom and left to right, so the page reads in order without the grid.
  // On a phone: by priority, then by the phone's own places (narrow.ts).
  const ordered = useMemo(
    () =>
      narrow
        ? phoneOrder(widgets)
        : [...widgets].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x),
    [widgets, narrow],
  );
  // On a phone one that would stand alone in a row takes it whole; what is hidden stands in the way of a pairing, drawn or not.
  const spans = useMemo(
    () =>
      narrow
        ? phoneSpans(ordered, (one) => hiddenOnPhone(one, ctx.registry.get(one.type)?.definition))
        : new Map<string, 1 | 2>(),
    [narrow, ordered, ctx.registry],
  );
  // A press on a widget on the phone, dragged up or down and let go, reads it before the one it
  // was let go above (or last): written as the phone's own place, once it is asked about.
  const reorderOnPhone = (event: React.PointerEvent<HTMLElement>, id: string) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || inner || !editing) return;
    const startY = event.clientY;
    const done = (up: PointerEvent) => {
      window.removeEventListener("pointerup", done);
      if (Math.abs(up.clientY - startY) < 8) return;
      const cells = [...(ref.current?.children ?? [])].filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && node.dataset.widgetCell !== undefined,
      );
      const target = cells.find((cell) => {
        if (cell.dataset.widgetCell === id) return false;
        const box = cell.getBoundingClientRect();
        return up.clientY < box.top + box.height / 2;
      });
      const ids = ordered.map((one) => one.id);
      const before = target?.dataset.widgetCell;
      // Where it already is: nothing to write.
      const next = ids[ids.indexOf(id) + 1];
      if (before === next) return;
      ctx.movePhone(id, before);
    };
    window.addEventListener("pointerup", done);
  };
  const stepOnPhone = (id: string, by: -1 | 1) => {
    const ids = ordered.map((one) => one.id);
    const at = ids.indexOf(id) + by;
    if (at < 0 || at >= ids.length) return;
    ctx.movePhone(id, by < 0 ? ids[at] : ids[at + 1]);
  };
  useFlip(JSON.stringify(ordered.map((one) => ({ id: one.id, at: one.at }))), { ref });
  const into: WidgetIn | undefined = inner
    ? { widget: inner.container, ...(inner.tab !== undefined ? { tab: inner.tab } : {}) }
    : undefined;
  const landingHere =
    ctx.landing !== undefined &&
    ctx.landing.in?.widget === into?.widget &&
    ctx.landing.in?.tab === into?.tab;
  const grid = (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the empty page lets go of the chosen widget; Esc does the same from the keyboard
    // biome-ignore lint/a11y/noStaticElementInteractions: as above
    <div
      ref={ref}
      {...(inner
        ? {
            "data-grid-in": inner.container,
            ...(inner.tab !== undefined ? { "data-grid-tab": inner.tab } : {}),
          }
        : {})}
      className={`grid grid-cols-2 gap-3 @2xl:auto-rows-[2.5rem] @2xl:grid-cols-12 ${inner && editing ? "min-h-10 rounded-inner" : ""} ${
        inner && landingHere ? "outline-2 outline-dashed outline-action/50 outline-offset-2" : ""
      }`}
      onClick={(event) => {
        if (editing && event.target === event.currentTarget) editing.onSelect(undefined);
      }}
    >
      {inner && editing && widgets.length === 0 ? (
        <p className="m-0 flex min-h-10 items-center justify-center rounded-inner bg-sunken/50 px-3 text-body-sm text-ink-muted [grid-column:1/-1]">
          Drag a widget here
        </p>
      ) : null}
      {ordered.map((widget) => {
        // What is carried or dragged in from elsewhere lands where this says.
        if (widget.id === CARRIED) {
          return ctx.landing ? (
            <Landing key={CARRIED} card={ctx.landing.card} at={widget.at} />
          ) : null;
        }
        const entry = ctx.registry.get(widget.type);
        // On a phone a widget its layout (or else its definition) hides is not shown at all; building, a dashed place-holder stands in, which chooses it.
        if (narrow && hiddenOnPhone(widget, entry?.definition)) {
          if (!editing) return null;
          return (
            <HiddenOnPhone
              key={widget.id}
              id={widget.id}
              name={ctx.nameOf(widget.id)}
              selected={editing.selected === widget.id}
              onSelect={() => editing.onSelect(widget.id)}
            />
          );
        }
        // Served, a widget whose conditions do not hold is not drawn; building, it is drawn faded and says when.
        const showWhen = widget.rules?.showWhen;
        if (!editing && !ctx.shownNow(showWhen)) return null;
        if (!editing && !seenByUser(widget.rules, ctx.user)) return null;
        // Building as a group: a widget it may not see is drawn faded, and says for whom it is hidden.
        const viewing = ctx.viewing;
        const hiddenFor =
          editing && viewing
            ? !seenByUser(widget.rules, viewing.user) ||
              !holds(
                (showWhen ?? []).filter((one) => "user" in one),
                {},
                viewing.user,
              )
              ? `Hidden for ${viewing.name}`
              : undefined
            : undefined;
        const fade =
          editing && showWhen && showWhen.length > 0
            ? showWhen
                .map((one) => conditionWords(one, (field) => field.replace(/_/g, " ")))
                .join(" and ")
            : undefined;
        const selected = editing?.selected === widget.id;
        const stored = ctx.stored.get(widget.id) ?? widget;
        const holding = placement.held?.id === widget.id ? placement.held : undefined;
        const sameGrid = holding ? gridKey(holding.in) === gridKey(widget.in) : false;
        const container = entry?.definition.role === "container";
        return (
          <Cell
            key={widget.id}
            ctx={ctx}
            widget={widget}
            entry={entry}
            at={widget.at}
            held={holding !== undefined && sameGrid}
            away={holding !== undefined && !sameGrid}
            arriving={editing !== undefined && !ctx.known.has(widget.id)}
            narrow={narrow}
            selected={selected}
            fade={fade}
            hiddenFor={hiddenFor}
            span={narrow ? (spans.get(widget.id) ?? 2) : 2}
            place={
              container
                ? (tab) => (
                    <WidgetGrid
                      ctx={ctx}
                      inner={{ container: widget.id, ...(tab !== undefined ? { tab } : {}) }}
                      widgets={childrenOf(drawn, widget.id, tab)}
                    />
                  )
                : undefined
            }
            handlers={{
              onPointerDown: (event, how) => {
                // On a phone a press is a click, or a drag up or down that reorders it.
                if (narrow && how === "move") return reorderOnPhone(event, widget.id);
                placement.grab(event, widget.id, stored.at, how, widget.in);
              },
              onKeyDown: (event) => {
                if (!editing || isControl(event.target)) return;
                if (
                  narrow &&
                  !inner &&
                  (event.key === "ArrowUp" || event.key === "ArrowDown") &&
                  !event.metaKey &&
                  !event.ctrlKey
                ) {
                  event.preventDefault();
                  stepOnPhone(widget.id, event.key === "ArrowUp" ? -1 : 1);
                } else if (event.key === "Escape") {
                  editing.onSelect(undefined);
                } else if (event.key === "Delete") {
                  event.preventDefault();
                  ctx.remove(widget.id);
                } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
                  // The browser's own answer to this is a bookmark.
                  event.preventDefault();
                  ctx.duplicate(widget.id);
                } else if (!event.metaKey && !event.ctrlKey) {
                  placement
                    .keys(widget.id, nameOf(widget, entry?.definition), stored.at, stored.in)
                    .onKeyDown(event);
                }
              },
            }}
          />
        );
      })}
    </div>
  );
  // The page lays itself out by the room it is given, not by the window's width: an app served
  // full-width and a preview drawn at a phone's width both get the layout of their size. So does
  // a container: by the room the container is given.
  return <div className="@container min-w-0">{grid}</div>;
}

const gridKey = (into: WidgetIn | undefined) => gridOf({ in: into });

/**
 * A page: its widgets on twelve columns. Each widget reads its
 * own data, under the viewer's permissions, from the client. A Section or Tabs holds widgets
 * on a grid of its own, drawn the same way. With `editing` it
 * is the builder's canvas: a click chooses a widget, which is dragged by
 * itself (into a Section or a tab, or out of one) and stretched by its
 * corner, moved a cell with the arrows, changed in
 * size with Shift and the arrows, copied with ⌘D or Ctrl+D, removed with
 * Delete, and let go with Esc.
 */
export function PageView({
  widgets: given,
  device,
  viewAs,
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
  tabs: tabHost,
  foldKey,
  editing,
}: PageViewProps) {
  // The tablet draws each widget where its own layout puts it; what is changed there is written back as that layout.
  const widgets = useMemo(() => (device === "tablet" ? onTablet(given) : given), [given, device]);
  // Building as a group: who the page is judged for. Rows are still the builder's.
  const viewUser = useMemo<ActingUser | undefined>(
    () =>
      editing && viewAs
        ? {
            id: user?.id ?? "builder",
            ...(user?.email ? { email: user.email } : {}),
            // Served, a person's groups come as names (for "user in group" conditions) and as keys (for who may run).
            groups: [viewAs.name, viewAs.key],
          }
        : undefined,
    [editing, viewAs, user],
  );
  const [told, setTold] = useState("");
  // Each action that ran makes every widget read again, on top of the host's own refresh.
  const [ran, setRan] = useState(0);
  const [thisRow, setThisRow] = useState<Readonly<Record<string, unknown>>>();
  // The row last chosen in each table or list another widget follows, by widget id.
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>({});
  const followed = useMemo(
    () =>
      new Set(
        widgets.flatMap((one) =>
          Object.values(one.data ?? {}).flatMap((given) =>
            "selected" in given.source ? [given.source.selected] : [],
          ),
        ),
      ),
    [widgets],
  );
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
  // What each Search and filter widget is given: the filters are drawn where the widget sits.
  const hostFor = useFilterHost({
    filters,
    values: filterValues,
    onValues: onFilterValues,
    client,
    given: filterOptions,
  });
  const roles = useMemo<Roles>(
    () => ({ get: (type: string) => registry.get(type)?.definition }),
    [registry],
  );
  const byId = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget])), [widgets]);
  const name = useCallback(
    (id: string) => {
      const widget = byId.get(id);
      return widget ? nameOf(widget, registry.get(widget.type)?.definition) : id;
    },
    [byId, registry],
  );

  // Which tab of each Tabs is open: in the served app's address (a reload and a link keep it),
  // and while building, here.
  const [openTabs, setOpenTabs] = useState<Readonly<Record<string, string>>>({});
  const tabsNow = !editing && tabHost ? tabHost.open : openTabs;
  const openTab = (container: PageWidget) => {
    const ids = tabsOf(container).map((tab) => tab.id);
    // The address (or, building, the builder's choice) wins; then the last tab this person had
    // here on this device (`remember`), then `opensFirst`, then the first.
    const wanted = tabsNow[container.id];
    if (wanted !== undefined && ids.includes(wanted)) return wanted;
    const config = container.config as { remember?: boolean; opensFirst?: string } | undefined;
    const last = !editing && config?.remember ? recallTab(user?.id, container.id) : undefined;
    for (const one of [last, config?.opensFirst])
      if (one !== undefined && ids.includes(one)) return one;
    return ids[0];
  };
  const chooseTab = (container: string, tab: string) => {
    if (!editing && byId.get(container)?.config?.remember === true)
      rememberTab(user?.id, container, tab);
    if (!editing && tabHost) tabHost.choose(container, tab);
    else setOpenTabs((now) => ({ ...now, [container]: tab }));
  };
  // Choosing a widget in a tab that is not open opens that tab; so does the chosen widget being
  // moved onto one (⋯ › Move to), so that it is still in sight.
  const selectedId = editing?.selected;
  const selectedIn = selectedId ? byId.get(selectedId)?.in : undefined;
  const selectedPlace = selectedIn ? `${selectedIn.widget}/${selectedIn.tab ?? ""}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: opened when the choice, or where it is, changes
  useEffect(() => {
    const chosen = selectedId ? byId.get(selectedId) : undefined;
    const container = chosen?.in ? byId.get(chosen.in.widget) : undefined;
    if (chosen?.in?.tab && container && openTab(container) !== chosen.in.tab)
      setOpenTabs((now) => ({ ...now, [container.id]: chosen.in?.tab as string }));
  }, [selectedId, selectedPlace]);

  // A Section folded by its reader stays folded for them: kept in this browser, if it will.
  const [folds, setFolds] = useState<Readonly<Record<string, boolean>>>({});
  const foldedNow = (container: PageWidget): boolean => {
    // Building, a Section is open, so that what is in it can be reached.
    if (editing || container.config?.folds !== true) return false;
    const seen = folds[container.id];
    if (seen !== undefined) return seen;
    const kept = foldKey ? foldStored(`volvel.fold.${foldKey}.${container.id}`) : undefined;
    return kept ?? container.config?.folded === true;
  };
  const setFolded = (container: string, folded: boolean) => {
    setFolds((now) => ({ ...now, [container]: folded }));
    if (foldKey) foldKept(`volvel.fold.${foldKey}.${container}`, folded);
  };

  const gridRef = useRef<HTMLDivElement>(null);
  // Every change the page makes to its widgets: containers kept as tall as what they hold.
  const change = (next: PageWidget[], label: string, pin?: string) => {
    if (!editing) return;
    const made = [...fitContainers(next, roles, pin ? { pin } : {})];
    if (device !== "tablet") return editing.onChange(made, label);
    // On the tablet a move is the tablet's own place: it is asked about first, and the desktop's stays.
    const written = intoTablet(given, widgets, made);
    const was = new Map(given.map((widget) => [widget.id, JSON.stringify(widget.layout?.tablet)]));
    const byHand = written.some(
      (widget) =>
        was.has(widget.id) && JSON.stringify(widget.layout?.tablet) !== was.get(widget.id),
    );
    const apply = () => editing.onChange(written, label);
    if (!byHand || !editing.askLayout) return apply();
    void editing.askLayout("tablet").then((yes) => yes && apply());
  };
  /** On the phone: the widget is read before another, or last. Asked about first, and marked as changed by hand. */
  const movePhone = (id: string, before: string | undefined) => {
    if (!editing) return;
    const apply = () =>
      editing.onChange(phoneMoved(given, id, before), `Moved ${name(id)} on the phone`);
    if (!editing.askLayout) return apply();
    void editing.askLayout("phone").then((yes) => yes && apply());
  };
  const placement = usePlacement({
    grid: gridRef,
    limits: (id) => limitsOf(registry.get(byId.get(id)?.type ?? "")?.definition),
    onGrabbed: (id) => editing?.onSelect(id),
    // A container is not put in another: it has no grid to drop on.
    targets: (id) => {
      const held = byId.get(id);
      const node = gridRef.current;
      if (!node || (held && isContainer(held, roles))) return [];
      const grids = [...node.querySelectorAll<HTMLElement>("[data-grid-in]")].map((grid) => ({
        into: {
          widget: grid.dataset.gridIn as string,
          ...(grid.dataset.gridTab !== undefined ? { tab: grid.dataset.gridTab } : {}),
        },
        node: grid,
      }));
      // Each tab of a Tabs that is not open, by its name in the strip: held over, it opens.
      const headers = grids.flatMap((grid) => {
        const container = byId.get(grid.into.widget);
        const cell = grid.node.closest<HTMLElement>("[data-widget-cell]");
        if (!container || !cell) return [];
        const names = [...cell.querySelectorAll<HTMLElement>('[role="tab"]')];
        return tabsOf(container).flatMap((tab, index) => {
          const header = names[index];
          return header && tab.id !== grid.into.tab
            ? [
                {
                  into: { widget: container.id, tab: tab.id },
                  node: grid.node,
                  header,
                  bottom: childrenOf(widgets, container.id, tab.id)
                    .filter((one) => one.id !== id)
                    .reduce((low, one) => Math.max(low, one.at.y + one.at.h), 0),
                },
              ]
            : [];
        });
      });
      return [...grids, ...headers];
    },
    onOpen: (into) => {
      if (into.tab) chooseTab(into.widget, into.tab);
    },
    onMove: editing
      ? (id, at, _by, how, into) => {
          const was = byId.get(id)?.in;
          const next = putAt(widgets, id, at, into, roles);
          const where =
            gridKey(was) === gridKey(into)
              ? ""
              : into
                ? ` into ${name(into.widget)}`
                : ` out of ${name(was?.widget ?? "")}`;
          change(next, `${how === "move" ? "Moved" : "Resized"} ${name(id)}${where}`, id);
        }
      : undefined,
  });

  const remove = (id: string) => {
    if (!editing) return;
    const label = name(id);
    change(without(widgets, id), `Removed ${label}`);
    editing.onSelect(undefined);
    setTold(`${label} is removed.`);
  };
  const duplicate = (id: string) => {
    if (!editing) return;
    const made = duplicated(widgets, id);
    if (!made) return;
    change(made.widgets, `Duplicated ${name(id)}`);
    editing.onSelect(made.copy.id);
    setTold(`${name(id)} is copied.`);
  };

  const narrow = useNarrow(gridRef);

  // Where everything is drawn: while something is held or carried, where it would all be
  // if it were let go now, so what is in the way is seen to move aside as it travels. What is
  // dragged to a grid it is not on (another container's, the page's) stays where it was, and a
  // landing is drawn where it would go.
  const carrying = placement.carrying;
  const held = placement.held;
  const heldWas = held ? byId.get(held.id) : undefined;
  const leaving =
    held !== undefined && heldWas !== undefined && gridKey(held.in) !== gridKey(heldWas.in);
  // The rows a Search and filter needs at the width it is drawn: its bar wraps on a narrow page,
  // and it is drawn as tall as that, what is below moved down (the page keeps the height it was given).
  const [needs, setNeeds] = useState<Readonly<Record<string, number>>>({});
  const foldedKey = widgets
    .filter((one) => foldedNow(one))
    .map((one) => one.id)
    .join(",");
  const drawn = useMemo(() => {
    let list: readonly PageWidget[] = widgets;
    const ghost = (at: Box, into: WidgetIn | undefined): PageWidget =>
      ({ id: CARRIED, type: "", at, ...(into ? { in: into } : {}) }) as PageWidget;
    if (held && heldWas) {
      list = leaving
        ? putAt([...widgets, ghost(held.at, held.in)], CARRIED, held.at, held.in, roles)
        : putAt(widgets, held.id, held.at, held.in, roles);
    } else if (carrying?.at) {
      list = putAt(
        [...widgets, ghost(carrying.at, undefined)],
        CARRIED,
        carrying.at,
        undefined,
        roles,
      );
    }
    // A container is as tall as what it holds: exactly so while building, and at least so when
    // served; a folded one is short.
    return fitContainers(list, roles, {
      ...(editing ? {} : { grow: true }),
      least: (id) => needs[id],
      folded: (id) => foldedKey.split(",").includes(id),
      // What is held, or what is carried, stays where it is put: the landing is drawn where it lands.
      ...(held ? { pin: held.id } : carrying?.at ? { pin: CARRIED } : {}),
    });
  }, [widgets, held, heldWas, leaving, carrying?.at, roles, editing, foldedKey, needs]);

  // A widget that was not on the page when it was opened has arrived: added, copied or carried in.
  const known = useRef<Set<string> | undefined>(undefined);
  known.current ??= new Set(widgets.map((widget) => widget.id));
  const seen = known.current;
  useEffect(() => {
    for (const widget of widgets) known.current?.add(widget.id);
  });

  // A carry asked for by the host starts once per request.
  const carryRequest = editing?.carrying;
  const endRow = () =>
    topLevel(widgets).reduce((low, widget) => Math.max(low, widget.at.y + widget.at.h), 0);
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
    filters.length > 0 ? "Nothing matches the filters." : "There is nothing here yet.";

  const landing = carrying?.at
    ? { card: carrying.card, in: undefined }
    : leaving && held && heldWas
      ? {
          card: {
            title: name(held.id),
            kind: registry.get(heldWas.type)?.definition.title ?? heldWas.type,
            size: { w: held.at.w, h: held.at.h },
            limits: limitsOf(registry.get(heldWas.type)?.definition),
          },
          in: held.in,
        }
      : undefined;

  const ctx: GridContext = {
    registry,
    roles,
    client,
    filterValues,
    refreshKey: refreshKey + ran,
    emptyMessage,
    chosen,
    followed,
    choose: (widget, row) =>
      setChosen((now) => (now[widget] === row ? now : { ...now, [widget]: row })),
    editing,
    onEvent,
    run: actions.run,
    refresh: host.refresh,
    decide: async (widget, id, decision, comment) => {
      if (!client.decide) return { ok: false, message: "Deciding isn't available here." };
      try {
        const done = await client.decide(widget, id, decision, comment);
        host.refresh();
        return {
          ok: true,
          message: `${decision === "approve" ? "Approved" : "Rejected"} “${done.title}” as ${done.by}.`,
        };
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : "It could not be decided.";
        if (error instanceof ActionError && error.status === 409) {
          // Someone else decided it: what they did is what is shown, and the page reads again.
          host.refresh();
          return { ok: false, conflict: true, message };
        }
        return { ok: false, message };
      }
    },
    record,
    thisRow,
    user,
    viewing: viewUser && viewAs ? { user: viewUser, name: viewAs.name } : undefined,
    movePhone,
    onRecord: setThisRow,
    onClose: over ? () => onNavigate?.({ close: true }) : undefined,
    overRecord,
    pages,
    placement,
    drawn,
    stored: byId,
    known: seen,
    shownNow,
    landing,
    tab: { open: openTab, choose: chooseTab },
    fold: { folded: foldedNow, set: setFolded },
    remove,
    duplicate,
    nameOf: name,
    hostFor,
    measured: (id, pixels) => {
      const rows = Math.max(1, Math.ceil((pixels + GRID.gap) / (GRID.row + GRID.gap)));
      setNeeds((now) => (now[id] === rows ? now : { ...now, [id]: rows }));
    },
  };

  return (
    <div className="flex flex-col gap-3">
      {widgets.length === 0 ? (
        <EmptyState
          title={editing ? "Nothing on this page yet" : "This page has nothing on it yet"}
        >
          {editing ? "Add a widget to start." : undefined}
        </EmptyState>
      ) : null}
      <div>
        <WidgetGrid ctx={ctx} widgets={topLevel(drawn)} gridRef={gridRef} />
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

/** Where something carried onto the page would land, at its size, with what it is. */
function Landing({ card, at }: { card: PlaceCard; at: Box }) {
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
      className="relative col-span-2 flex min-h-24 flex-col justify-center gap-0.5 rounded-panel border-2 border-dashed border-action bg-action-soft px-4 @2xl:min-h-0 @2xl:[grid-column:var(--col)] @2xl:[grid-row:var(--row)]"
    >
      <span className="truncate font-semibold text-ink">{card.title}</span>
      <span className="text-body-sm text-ink-muted">{card.kind}</span>
      <span className="pointer-events-none absolute right-2 -bottom-8 layer-sticky rounded-inner border border-line-strong bg-raised px-2 py-0.5 font-mono text-meta text-ink">
        {sizeWords(at)}
      </span>
    </div>
  );
}

/** Building the phone's layout: a widget it hides is a dashed place-holder, which can be chosen to change that. */
function HiddenOnPhone({
  id,
  name,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      data-widget-cell={id}
      data-hidden-on-phone=""
      data-selected={selected ? "" : undefined}
      aria-pressed={selected}
      onClick={onSelect}
      className={`col-span-2 flex min-h-10 items-center gap-2 rounded-panel border border-dashed border-action bg-action-soft px-3 py-2 text-left text-body-sm text-ink ${
        selected ? "ring-2 ring-action" : ""
      }`}
    >
      <EyeOff aria-hidden="true" size={14} className="shrink-0 text-action" />
      <span className="min-w-0 truncate">{name} is hidden on phones</span>
    </button>
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
