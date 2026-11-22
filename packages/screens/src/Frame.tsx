import type { PageWidget } from "@volvel/manifest";
import { Button, HeadingSlot, hasHeadingControls, Menu, Notice, Skeleton } from "@volvel/ui";
import { Download, PanelRight } from "@volvel/ui/icons";
import type { WidgetDefinition, WidgetState } from "@volvel/widgets";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { download, type Result, toCsv, toXlsx } from "./export.ts";
import type { WireData } from "./types.ts";
import type { Reading } from "./useWidgetData.ts";

/** What a widget read as a table to keep: the first input that has rows, as its view was given them. */
function resultOf(read: Readonly<Record<string, WireData>> | undefined): Result | undefined {
  for (const wire of Object.values(read ?? {})) {
    // Rows are worth keeping; one number, or one record, is read off the page.
    if (wire.shape === "record" || wire.shape === "approvals" || wire.rows.length === 0) continue;
    if (wire.shape === "summary" && wire.breakdowns.length === 0) continue;
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
  if (renaming) {
    const finish = (save: boolean) => {
      if (settled.current) return;
      settled.current = true;
      const next = field.current?.value.trim() ?? title;
      setRenaming(false);
      if (save && next !== title) onRename(next);
    };
    return (
      <input
        ref={field}
        aria-label="Widget title"
        defaultValue={title}
        maxLength={100}
        className="min-w-0 flex-1 rounded-inner border border-action bg-surface px-1.5 py-0.5 text-body font-semibold text-ink"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") finish(true);
          if (event.key === "Escape") finish(false);
        }}
        onBlur={() => finish(true)}
      />
    );
  }
  if (renamable) {
    return (
      <button
        type="button"
        title="Rename"
        data-chrome="title"
        className="-ml-1.5 min-w-0 truncate rounded-inner border border-line-strong bg-surface px-1.5 py-0.5 text-left text-body font-semibold"
        onClick={(event) => {
          event.stopPropagation();
          setRenaming(true);
        }}
      >
        {title || <span className="font-normal text-ink-muted">Name this widget</span>}
      </button>
    );
  }
  return <h2 className="m-0 min-w-0 truncate text-body font-semibold">{title}</h2>;
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
  opens,
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
  /** Building: what a click on a row does, in words ("Invoice detail"), said at the right of the heading. */
  opens?: string | undefined;
  children: ReactNode;
}) {
  const name = nameOf(widget, definition);
  const state: WidgetState = definition ? reading.state : { status: "ready" };
  const kept = !building && state.status === "ready" ? resultOf(reading.read) : undefined;
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
    : widget.title || widget.subtitle || controls || (building && (selected || opens));
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
            <p className="m-0 text-body-sm text-ink-muted">{state.message}</p>
            {controls ? children : null}
          </>
        );
      case "ready":
        return children;
    }
  })();
  return (
    <>
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
                  triggerClassName="flex items-center rounded-control p-1 text-ink-muted hover:bg-sunken hover:text-ink"
                  label={<Download aria-hidden="true" size={16} />}
                  items={[
                    {
                      label: "Download as CSV",
                      onSelect: () =>
                        download(`${fileName(name)}.csv`, toCsv(kept), "text/csv;charset=utf-8"),
                    },
                    {
                      label: "Download as a spreadsheet",
                      onSelect: () =>
                        download(
                          `${fileName(name)}.xlsx`,
                          toXlsx(kept, name.slice(0, 31)),
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
          className={`flex min-h-0 flex-1 flex-col ${container ? "" : "gap-2 overflow-auto"} ${bare ? "justify-center" : container ? "" : "px-[14px] pb-[14px]"} outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset ${
            bare || container ? "" : heading ? "pt-[10px]" : "pt-[14px]"
          } ${reading.stale ? "opacity-50" : ""}`}
        >
          {reading.stale ? (
            <span role="status" className="text-body-sm text-ink-muted">
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
