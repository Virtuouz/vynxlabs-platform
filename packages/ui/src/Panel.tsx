import { createContext, type HTMLAttributes, type ReactNode, useContext } from "react";

/**
 * Whether what is drawn sits inside a container already (07 §7.5): a notice
 * there drops its border, keeping its tint and icon, so no box is drawn
 * inside another.
 */
const Contained = createContext(false);

/** Marks what it holds as inside a container: for a sheet or a pane that is not a `Panel`. */
export function ContainedArea({ children }: { children: ReactNode }) {
  return <Contained.Provider value={true}>{children}</Contained.Provider>;
}

/** True inside a `Panel`, or a `ContainedArea`. */
export const useContained = () => useContext(Contained);

/**
 * The one container (07 §7.5): a surface with a hairline border. It may hold
 * a table, a form or a list, never another panel.
 *
 * Bare, it is the border and the surface, and the caller lays out what is
 * inside. `padded`, or with a `title`, an `action` or a `footer`, it lays itself out: the
 * heading and action at the top, the footer under a rule at the bottom. With
 * `onSelect` the whole panel is one button, as a pet or an order in a grid is.
 */
export function Panel({
  title,
  description,
  action,
  footer,
  onSelect,
  selected,
  as: As = "section",
  padded = false,
  children,
  className = "",
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, "title" | "onSelect"> & {
  title?: ReactNode;
  description?: ReactNode;
  /** A control at the top right, such as a menu or a badge. */
  action?: ReactNode;
  footer?: ReactNode;
  /** Makes the panel one button. Leave it out when the panel holds buttons of its own. */
  onSelect?: () => void;
  selected?: boolean;
  as?: "section" | "div" | "aside";
  /** Lays out what it holds with the panel's own padding and gaps, without a heading. */
  padded?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const laidOut = Boolean(padded || title || description || action || footer || onSelect);
  if (!laidOut) {
    return (
      <Contained.Provider value={true}>
        <As {...rest} className={`rounded-panel border border-line bg-surface ${className}`}>
          {children}
        </As>
      </Contained.Provider>
    );
  }
  const head =
    title || description || action ? (
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {title ? <h3 className="m-0 text-title font-semibold">{title}</h3> : null}
          {description ? <p className="m-0 text-body-sm text-ink-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    ) : null;
  const body = (
    <>
      {head}
      {children}
      {footer ? (
        <div className="-mx-4 -mb-4 mt-1 flex flex-wrap items-center gap-2 border-line border-t px-4 py-3">
          {footer}
        </div>
      ) : null}
    </>
  );
  const frame = `flex flex-col gap-3 rounded-panel border bg-surface p-4 text-left text-ink ${
    selected ? "border-action ring-1 ring-action" : "border-line"
  } ${className}`;
  return (
    <Contained.Provider value={true}>
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={`${frame} w-full cursor-pointer hover:border-line-strong focus-visible:outline-2 focus-visible:outline-focus`}
        >
          {body}
        </button>
      ) : (
        <As {...rest} className={frame}>
          {body}
        </As>
      )}
    </Contained.Provider>
  );
}
