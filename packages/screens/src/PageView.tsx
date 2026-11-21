import type { PageFilter, PageWidget } from "@volvel/manifest";
import { EmptyState, Panel } from "@volvel/ui";
import { GripHorizontal } from "@volvel/ui/icons";
import type { EventPayload } from "@volvel/widgets";
import type React from "react";
import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { FilterBar } from "./FilterBar.tsx";
import { Frame, nameOf } from "./Frame.tsx";
import { duplicated, limitsOf, placed, sizeWords, without } from "./layout.ts";
import { type Box, type HowMoved, isControl, usePlacement } from "./placement.ts";
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
  /** For a choice filter that lists a table's column: what was read for it, by filter name. */
  filterOptions?: Readonly<Record<string, readonly string[]>>;
  /** A widget raised an event its definition declares. Nothing handles them in phase 25, so a page leaves them alone. */
  onEvent?: (widget: string, event: string, payload: EventPayload) => void;
  /** Present while building: the canvas. */
  editing?: {
    selected: string | undefined;
    onSelect(id: string | undefined): void;
    /** Every change of place or size, or a removal or duplicate, as a new widget list, with words for Undo ("Moved Invoices"). */
    onChange(widgets: PageWidget[], label: string): void;
    onRename(id: string, title: string): void;
    /** A column heading was clicked in a table while building. */
    onColumn?(id: string, column: string): void;
  };
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
  narrow,
  client,
  filterValues,
  refreshKey,
  emptyMessage,
  editing,
  selected,
  onEvent,
  handlers,
}: {
  widget: PageWidget;
  entry: ViewEntry | undefined;
  at: Box;
  held: boolean;
  narrow: boolean;
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
  const reading = useWidgetData({
    client,
    widget,
    reads: definition !== undefined && Object.keys(definition.data).length > 0,
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
    onEvent?.(widget.id, event, payload);
  };
  const name = nameOf(widget, definition);
  const hiddenOnPhones = definition?.layout.phone === "hide";
  const style = {
    "--col": `${at.x + 1} / span ${at.w}`,
    "--row": `${at.y + 1} / span ${at.h}`,
  } as CSSProperties;
  return (
    <Panel
      as="section"
      aria-label={name}
      data-flip-key={widget.id}
      data-selected={selected ? "" : undefined}
      style={style}
      className={`relative flex min-h-0 min-w-0 flex-col @2xl:[grid-column:var(--col)] @2xl:[grid-row:var(--row)] ${
        selected ? "ring-2 ring-action" : ""
      } ${held ? "layer-sticky opacity-90 shadow-drag" : ""} ${
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
        {View ? (
          <View
            config={config}
            data={reading.data}
            size={{ w: at.w, h: at.h, narrow }}
            emit={emit}
            building={building}
          />
        ) : null}
      </Frame>
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
    </Panel>
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
  filterOptions,
  onEvent,
  editing,
}: PageViewProps) {
  const [told, setTold] = useState("");
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

  const placement = usePlacement({
    places: JSON.stringify(widgets.map((widget) => [widget.id, widget.at])),
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

  const gridRef = placement.grid;
  const narrow = useNarrow(gridRef);
  const emptyMessage =
    filters.length > 0 ? "Nothing matches the filters above." : "There is nothing here yet.";

  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        filters={filters}
        values={filterValues}
        onChange={onFilterValues}
        options={filterOptions}
      />
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
          className="grid grid-cols-1 gap-3 @2xl:auto-rows-[2.5rem] @2xl:grid-cols-12"
          onClick={(event) => {
            if (editing && event.target === event.currentTarget) editing.onSelect(undefined);
          }}
        >
          {ordered.map((widget) => {
            const entry = registry.get(widget.type);
            // On a phone a widget whose definition says so is not shown at all.
            if (!editing && narrow && entry?.definition.layout.phone === "hide") return null;
            const at = placement.at(widget.id, widget.at);
            const selected = editing?.selected === widget.id;
            return (
              <Cell
                key={widget.id}
                widget={widget}
                entry={entry}
                at={at}
                held={placement.held?.id === widget.id}
                narrow={narrow}
                client={client}
                filterValues={filterValues}
                refreshKey={refreshKey}
                emptyMessage={emptyMessage}
                editing={editing}
                selected={selected}
                onEvent={onEvent}
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
        </div>
        <span role="status" className="sr-only">
          {placement.said}
        </span>
        <span role="status" className="sr-only">
          {told}
        </span>
      </div>
    </div>
  );
}
