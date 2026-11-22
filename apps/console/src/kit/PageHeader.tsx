import { Popover, TermText } from "@volvel/ui";
import { Info } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { openHelp, useHelp } from "../help/store.ts";
import { usePreference } from "../prefs.ts";

/**
 * The one heading every screen has (08 §3.1). Where it is in the console is
 * the shell's breadcrumb; this says what the screen is.
 *
 * - A **list** or a working screen: the title, a count, a sentence on what it
 *   is for, the actions (one primary), and a toolbar of filters beneath.
 * - An **object**: its kind above, its name (in the code face when it is a
 *   path or an ID), its state beside the name, actions, and a line of facts.
 * - An **editor** (`compact`): one row, name and state on the left, actions on
 *   the right, so the work below keeps the height.
 *
 * Its `h1` is where focus goes when a screen opens.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  count,
  state,
  meta,
  actions,
  toolbar,
  mono = false,
  compact = false,
  size = "display",
  after,
  helpKey,
  helpSeen,
  oneRow = false,
  bar = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A line above the title: an object's kind. */
  eyebrow?: ReactNode;
  /** How many there are, beside a list's title. */
  count?: number | undefined;
  /** An object's state, beside its name. */
  state?: ReactNode;
  /** A line of facts under the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Filters and search for a list, under the heading. */
  toolbar?: ReactNode;
  /** The title is a path or an ID. */
  mono?: boolean;
  compact?: boolean;
  /** An overview names its object larger. */
  size?: "display" | "display-lg";
  /** Anything that belongs to the heading but sits under it, such as the field to name something new. */
  after?: ReactNode;
  /**
   * A list's id, for a list whose description explains it once (P4-1): shown
   * on a member's first visit, then folded behind a help control beside the
   * title, so the list starts higher. Its empty state keeps the sentence.
   */
  helpKey?: string | undefined;
  /** Whether the description is folded, whatever the member has read: for the kit sheet. */
  helpSeen?: boolean;
  /**
   * A workbench's compact heading (P4-1): the title and actions on one row, then
   * the description, then the filters on a row of their own (phase 23 M5).
   */
  oneRow?: boolean;
  /** A compact heading that is a toolbar edge to edge (the builder's): one row, the name at the title size. */
  bar?: boolean;
}) {
  const [seen] = useSeen(helpKey, Boolean(description));
  const { topic } = useHelp();
  const folded = Boolean(helpKey && description && (helpSeen ?? seen));
  const heading = (
    <h1
      className={`m-0 min-w-0 ${
        bar
          ? "text-title"
          : mono
            ? `font-mono text-title ${compact ? "truncate" : "break-all"}`
            : size === "display-lg"
              ? "text-display-lg"
              : "text-display"
      }`}
    >
      {title}
      {count !== undefined ? (
        <span className="ml-2 align-middle font-mono text-code font-normal text-ink-subtle">
          {count}
        </span>
      ) : null}
    </h1>
  );
  if (compact) {
    return (
      <header className={bar ? "flex shrink-0 flex-col gap-2 px-4 py-3" : "flex flex-col gap-2"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* The name and state give way before the actions do, so the row stays one row. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            {heading}
            {state}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {after}
      </header>
    );
  }
  const named = typeof title === "string" ? title : "this page";
  // A description in words may use the workspace's own terms. One made of elements is left as it is.
  const said = typeof description === "string" ? <TermText>{description}</TermText> : description;
  // Folded, the description is behind the ⓘ, with the way to the page's help under it.
  // Shown, or with none, the ⓘ opens the help itself.
  const help = folded ? (
    <Help title={named} more={topic !== undefined}>
      {description}
    </Help>
  ) : topic !== undefined ? (
    <button
      type="button"
      aria-label={`Help for ${named}`}
      onClick={() => openHelp()}
      className="inline-flex size-7 items-center justify-center rounded-control text-ink-subtle hover:bg-sunken hover:text-ink"
    >
      <Info aria-hidden="true" size={16} />
    </button>
  ) : null;
  if (oneRow) {
    // A workbench's heading keeps to little height: the title with its actions at the right,
    // then the sentence on a first visit, then the filters on a row of their own, full width
    // (phase 23 M5). The filters are never beside the title.
    return (
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {heading}
            {help}
            {state}
          </div>
          {actions ? (
            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {description && !folded ? <p className="m-0 max-w-measure text-ink-muted">{said}</p> : null}
        {after}
        {toolbar ? (
          <div data-header-filters="" className="min-w-0">
            {toolbar}
          </div>
        ) : null}
      </header>
    );
  }
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow ? <div className="text-meta text-ink-subtle">{eyebrow}</div> : null}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {heading}
            {help}
            {state}
          </div>
          {description && !folded ? (
            <p className="m-0 max-w-measure text-ink-muted">{said}</p>
          ) : null}
          {meta ? (
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-meta">{meta}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {after}
      {toolbar ? (
        <div data-header-filters="" className="min-w-0">
          {toolbar}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Whether a member has read a list's description. It is marked read the first
 * time it is shown, and stays shown for the whole of that visit: it folds on
 * the next one, never under the reader's eyes.
 */
export function useSeen(key: string | undefined, has: boolean): [boolean] {
  const [seen, setSeen] = usePreference<boolean>(`seen:${key ?? "none"}`, false);
  const first = useRef(!seen);
  useEffect(() => {
    if (key && has && first.current) setSeen(true);
  }, [key, has, setSeen]);
  return [seen && !first.current];
}

/** The ⓘ beside a list's title that holds what the list is for, and leads to the page's help. */
export function Help({
  title,
  children,
  more = false,
}: {
  title: string;
  children: ReactNode;
  /** Whether there is help for the page to lead on to. */
  more?: boolean;
}) {
  return (
    <Popover
      title={`About ${title}`}
      trigger={
        <button
          type="button"
          aria-label={`About ${title}`}
          className="inline-flex size-7 items-center justify-center rounded-control text-ink-subtle hover:bg-sunken hover:text-ink"
        >
          <Info aria-hidden="true" size={16} />
        </button>
      }
    >
      {children}
      {more ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => openHelp()}
            className="border-0 bg-transparent p-0 font-medium text-action underline"
          >
            Learn more
          </button>
        </div>
      ) : null}
    </Popover>
  );
}
