import type { PageWidget } from "@volvel/manifest";
import {
  Button,
  EmptyState,
  HeadingSlot,
  hasHeadingControls,
  LimitNote,
  Menu,
  Notice,
  Skeleton,
} from "@volvel/ui";
import { Download, PanelRight } from "@volvel/ui/icons";
import type { WidgetDefinition, WidgetState } from "@volvel/widgets";
import { countText, formatOfColumn } from "@volvel/widgets";
import { type ColumnSpec, columnsToShow, headingOf } from "@volvel/widgets-core/views";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { download, type Result, toCsv, toXlsx } from "./export.ts";
import type { WireData } from "./types.ts";
import { DOWNLOAD_ROWS, type Reading } from "./useWidgetData.ts";

/**
 * What a widget read as a table to keep: the first input that has rows, as its view was given them.
 * A table keeps what it shows: its columns in its order, under the headings set, with money in
 * units and numbers as numbers (a hidden column is left out, though rows are sent whole).
 */
export function resultOf(
  read: Readonly<Record<string, WireData>> | undefined,
  widget?: PageWidget,
): Result | undefined {
  for (const wire of Object.values(read ?? {})) {
    // Rows are worth keeping; one number, or one record, is read off the page.
    if (wire.shape === "record" || wire.shape === "approvals" || wire.rows.length === 0) continue;
    if (wire.shape === "summary" && wire.breakdowns.length === 0) continue;
    if (wire.shape === "rows" && widget?.type === "core/table") {
      const specs = columnsToShow(widget.config?.columns as ColumnSpec[] | undefined, wire);
      const names = wire.names ?? {};
      return {
        columns: specs.map(({ spec }) => ({ name: headingOf(spec, wire) })),
        rows: wire.rows.map((row) =>
          specs.map(({ spec, info }) => {
            const value = row[spec.column];
            if (typeof value === "string" && names[spec.column]?.[value] !== undefined) {
              return names[spec.column]?.[value];
            }
            const format = formatOfColumn(spec.format, info);
            return format?.style === "currency" &&
              format.minorUnits === true &&
              typeof value === "number"
              ? Math.round(value) / 100
              : value;
          }),
        ),
      };
    }
    const columns = wire.columns.map((column) => ({ name: column.label || column.name }));
    const names = wire.shape === "rows" ? (wire.names ?? {}) : {};
    const rows = wire.rows.map((row) =>
      wire.columns.map((column) => {
        const value = row[column.name];
        return typeof value === "string" && names[column.name]?.[value] !== undefined
          ? names[column.name]?.[value]
          : value;
      }),
    );
    return { columns, rows };
  }
  return undefined;
}

/** A file name from a widget's title: letters, digits and dashes. */
const fileName = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "widget";

/** What a widget with no title is called where it needs a name: in the builder, and to a screen reader. */
export const nameOf = (widget: PageWidget, definition: WidgetDefinition | undefined) =>
  widget.title || definition?.title || widget.id;

/** The title, which in the builder is renamed where it stands. */
function Title({
  widget,
  renamable,
  onRename,
}: {
  widget: PageWidget;
  /** The widget is the one being built and may be renamed. */
  renamable: boolean;
  onRename: (title: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [typed, setTyped] = useState(widget.title ?? "");
  const field = useRef<HTMLInputElement>(null);
  // Said once: Enter or Esc ends it, and the blur that follows must not say it again.
  const settled = useRef(false);
  useEffect(() => {
    if (renaming) {
      settled.current = false;
      field.current?.focus();
      field.current?.select();
    }
  }, [renaming]);
  const title = widget.title ?? "";
  // A title cut with "…" says the whole of itself on hover.
  const cut = useRef<HTMLHeadingElement>(null);
  const tell = () => {
    const el = cut.current;
    if (el) el.title = el.scrollWidth > el.clientWidth ? title : "";
  };
  if (renaming) {
    const finish = (save: boolean) => {
      if (settled.current) return;
      const next = field.current?.value.trim() ?? title;
      // A title past its limit is said at the field and kept for the person to shorten, not cut.
      if (save && next.length > 100) return;
      settled.current = true;
      setRenaming(false);
      if (save && next !== title) onRename(next);
    };
    return (
      <>
        <input
          ref={field}
          aria-label="Widget title"
          defaultValue={title}
          onChange={(event) => setTyped(event.currentTarget.value)}
          className="min-w-0 flex-1 rounded-inner border border-action bg-surface px-1.5 py-0.5 text-body font-semibold text-ink"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") finish(true);
            if (event.key === "Escape") finish(false);
          }}
          onBlur={() => finish(true)}
        />
        <LimitNote value={typed} max={100} />
      </>
    );
  }
  if (renamable) {
    return (
      <button
        type="button"
        title="Rename"
        data-chrome="title"
        // Its edge lies outside the words, so that choosing a widget moves nothing in it.
        className="-my-[3px] -ml-[7px] min-w-0 truncate rounded-inner border border-line-strong bg-surface px-1.5 py-0.5 text-left text-body font-semibold"
        onClick={(event) => {
          event.stopPropagation();
          setRenaming(true);
        }}
      >
        {title || <span className="font-normal text-ink-muted">Name this widget</span>}
      </button>
    );
  }
  return (
    <h2
      ref={cut}
      onMouseEnter={tell}
      className="m-0 max-w-full min-w-0 flex-[1_1_8rem] truncate text-body font-semibold"
    >
      {title}
    </h2>
  );
}

/**
 * What goes around every widget, the same for every widget: its title and the
 * line under it, and what to draw while it is loading, when there is nothing,
 * when it could not be read and when it may not be seen. A type nobody knows
 * is said, not skipped.
 */
export function Frame({
  widget,
  definition,
  reading,
  selected,
  building,
  onRename,
  tabbable,
  container = false,
  flat = false,
  opens,
  offer,
  quiet = false,
  onEmpty,
  children,
}: {
  widget: PageWidget;
  definition: WidgetDefinition | undefined;
  reading: Reading;
  selected: boolean;
  building: boolean;
  onRename: ((title: string) => void) | undefined;
  /** The body scrolls, so it takes focus and can be scrolled by keyboard. */
  tabbable: boolean;
  /**
   * The widget holds others (a Section, Tabs) and is drawn with no card: its heading one row of
   * the page's grid and what it holds under it, with no padding and no scrolling of its own.
   */
  container?: boolean;
  /**
   * Drawn into the room of the modal or sheet it is in: no padding, and no scroll box of its own,
   * since the overlay scrolls and nothing may scroll inside it.
   */
  flat?: boolean;
  /** Building: what a click on a row does, in words ("Invoice detail"), said at the right of the heading. */
  opens?: string | undefined;
  /** The page's filters narrow what is read: a way to take them all off, offered when that left nothing. */
  offer?: { label: string; run: () => void } | undefined;
  /** Another widget on the page holds the offer: this one says what it has, in a line. */
  quiet?: boolean;
  /** Told when the widget is empty, and when it no longer is. */
  onEmpty?: ((empty: boolean) => void) | undefined;
  children: ReactNode;
}) {
  const name = nameOf(widget, definition);
  const state: WidgetState = definition ? reading.state : { status: "ready" };
  const isEmpty = state.status === "empty";
  const told = useRef(onEmpty);
  told.current = onEmpty;
  useEffect(() => {
    told.current?.(isEmpty);
    return () => told.current?.(false);
  }, [isEmpty]);
  const kept = !building && state.status === "ready" ? resultOf(reading.read, widget) : undefined;
  // A table read a page at a time is downloaded whole, as far as a download reads.
  const total = Object.values(reading.read ?? {}).reduce(
    (most, wire) => (wire.shape === "rows" && wire.total ? Math.max(most, wire.total) : most),
    0,
  );
  const capped = total > DOWNLOAD_ROWS ? ` (the first ${countText(DOWNLOAD_ROWS)} rows)` : "";
  const keep = async (save: (result: Result) => void) => {
    const whole = resultOf(await reading.all(), widget) ?? kept;
    if (whole) save(whole);
  };
  const followed = Object.values(reading.read ?? {}).find((wire) => wire.followed)?.followed;
  // A widget drawn with no card (a button, a filter bar) has no title on the page: it is named in
  // the inspector, for the outline. A heading there would sit over what it draws.
  const bare = definition?.layout.frame === "none" && !container;
  // A table's buttons sit at the right of its heading row, so it keeps the row for them.
  const controls = !bare && !container && hasHeadingControls(widget.config);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // What waits for a decision is counted in the heading, when something does.
  const asked = Object.values(reading.read ?? {}).find((wire) => wire.shape === "approvals");
  const waiting = asked?.shape === "approvals" ? asked.waiting.length : 0;
  const moreWaiting = asked?.shape === "approvals" && asked.more;
  // The body is a stop for the keyboard only while it scrolls, so that it can be scrolled by keys.
  const [scrolls, setScrolls] = useState(false);
  const watching = useRef<ResizeObserver | undefined>(undefined);
  const watch = (node: HTMLDivElement | null) => {
    watching.current?.disconnect();
    if (!node || typeof ResizeObserver !== "function") return;
    const look = () => setScrolls(node.scrollHeight > node.clientHeight + 3);
    watching.current = new ResizeObserver(look);
    watching.current.observe(node);
    for (const child of Array.from(node.children)) watching.current.observe(child);
    look();
  };
  const heading = bare
    ? false
    : widget.title ||
      widget.subtitle ||
      controls ||
      (building && (opens || (container && selected)));
  // One with no heading is named on its edge: a heading that came with being chosen would push down what it draws.
  const named = building && selected && !bare && !heading && onRename !== undefined;
  const body = (() => {
    if (!definition) {
      return <Notice tone="danger">There is no widget called "{widget.type}".</Notice>;
    }
    switch (state.status) {
      case "loading":
        return <Skeleton lines={3} label={`Loading ${name}`} />;
      case "failed":
        return (
          <Notice
            tone="danger"
            action={
              <Button size="small" onClick={reading.retry}>
                Try again
              </Button>
            }
          >
            {state.message}
          </Notice>
        );
      case "forbidden":
        return <Notice tone="attention">You may not see this. {state.message}</Notice>;
      case "empty":
        // What the widget keeps even with nothing to read (a table's buttons) is still drawn.
        return (
          <>
            {controls ? children : null}
            {quiet ? (
              <p className="m-0 text-ink-muted">{state.message}</p>
            ) : (
              <EmptyState
                inCard
                title={state.message}
                action={
                  offer ? (
                    <Button size="small" onClick={offer.run}>
                      {offer.label}
                    </Button>
                  ) : undefined
                }
              />
            )}
          </>
        );
      case "ready":
        return children;
    }
  })();
  return (
    <>
      {named ? (
        <div className="absolute -top-3 right-2 layer-sticky flex max-w-[45%] py-[3px] pl-[7px]">
          <Title widget={widget} renamable onRename={(title) => onRename(title)} />
        </div>
      ) : null}
      {heading ? (
        <header
          className={`flex min-w-0 flex-col gap-0.5 ${container ? "min-h-7 justify-center" : "px-[14px] pt-3"}`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0">
            <Title
              widget={widget}
              renamable={building && selected && onRename !== undefined}
              onRename={(title) => onRename?.(title)}
            />
            {waiting > 0 && state.status === "ready" ? (
              <span
                data-count=""
                role="img"
                aria-label={`${waiting}${moreWaiting ? " or more" : ""} waiting`}
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-action-soft px-1.5 text-meta font-medium text-action tabular-nums"
              >
                {waiting}
                {moreWaiting ? "+" : ""}
              </span>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {building && opens ? (
                <span
                  data-chrome="opens"
                  className="flex shrink-0 items-center gap-1.5 text-meta text-ink-muted"
                >
                  <PanelRight aria-hidden="true" size={13} />
                  Click opens <span className="text-ink">{opens}</span>
                </span>
              ) : null}
              <div
                ref={setSlot}
                data-heading-controls=""
                className="flex items-center gap-2 empty:hidden"
              />
              {kept ? (
                <Menu
                  ariaLabel={`Download ${name}`}
                  align="end"
                  triggerClassName="flex items-center justify-center rounded-control p-1 text-ink-muted hover:bg-sunken hover:text-ink pointer-coarse:min-h-8 pointer-coarse:min-w-8"
                  label={<Download aria-hidden="true" size={16} />}
                  items={[
                    {
                      label: `Download as CSV${capped}`,
                      onSelect: () =>
                        void keep((whole) =>
                          download(`${fileName(name)}.csv`, toCsv(whole), "text/csv;charset=utf-8"),
                        ),
                    },
                    {
                      label: `Download as a spreadsheet${capped}`,
                      onSelect: () =>
                        void keep((whole) =>
                          download(
                            `${fileName(name)}.xlsx`,
                            toXlsx(whole, name.slice(0, 31)),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          ),
                        ),
                    },
                  ]}
                />
              ) : null}
            </div>
          </div>
          {widget.subtitle ? (
            <p className="m-0 text-meta text-ink-muted">{widget.subtitle}</p>
          ) : null}
        </header>
      ) : null}
      <HeadingSlot.Provider value={slot}>
        <div
          ref={watch}
          tabIndex={tabbable && !container && scrolls ? 0 : undefined}
          aria-busy={reading.stale ? true : undefined}
          className={`flex min-h-0 flex-1 flex-col ${container ? "" : flat ? "gap-2" : "gap-2 overflow-auto"} ${bare ? "justify-center" : container || flat ? "" : "px-[14px] pb-[14px]"} outline-none! focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset ${
            bare || container || flat ? "" : heading ? "pt-[10px]" : "pt-[14px]"
          } transition-opacity motion-base ${
            // A read that answers at once changes nothing but its rows: only one that takes a while is faded.
            reading.stale && !building ? "opacity-60 delay-500" : ""
          }`}
        >
          {reading.stale && !building ? (
            <span role="status" className="sr-only">
              Updating…
            </span>
          ) : null}
          {followed ? (
            <Notice tone="attention">
              Names <code>{followed.names}</code>, now <code>{followed.now}</code>: change it in the
              repository.
            </Notice>
          ) : null}
          {body}
          {reading.more?.loading ? (
            <span role="status" className="text-body-sm text-ink-muted">
              Loading more…
            </span>
          ) : null}
          {reading.more?.error ? (
            <Notice
              tone="danger"
              action={
                <Button size="small" onClick={reading.more.retry}>
                  Try again
                </Button>
              }
            >
              {reading.more.error}
            </Notice>
          ) : null}
        </div>
      </HeadingSlot.Provider>
    </>
  );
}
