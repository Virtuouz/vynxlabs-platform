import type { ReactNode } from "react";

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
}) {
  const heading = (
    <h1
      className={`m-0 min-w-0 ${
        mono
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
      <header className="flex flex-col gap-2">
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
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow ? <div className="text-meta text-ink-subtle">{eyebrow}</div> : null}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {heading}
            {state}
          </div>
          {description ? <p className="m-0 max-w-measure text-ink-muted">{description}</p> : null}
          {meta ? (
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-meta">{meta}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {after}
      {toolbar}
    </header>
  );
}
