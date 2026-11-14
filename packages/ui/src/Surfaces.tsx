import type { ReactNode } from "react";

/**
 * A panel holding one thing: a pet, an order, a person. An optional heading
 * and action sit at the top, and an optional footer at the bottom. With
 * `onSelect` the whole card is one button.
 */
export function Card({
  title,
  description,
  action,
  footer,
  onSelect,
  selected,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** A control at the top right, such as a menu or a badge. */
  action?: ReactNode;
  footer?: ReactNode;
  /** Makes the card one button. Leave it out when the card holds buttons of its own. */
  onSelect?: () => void;
  selected?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const head =
    title || action ? (
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {title ? <h3 className="m-0 text-base font-semibold">{title}</h3> : null}
          {description ? <p className="m-0 text-[13px] text-ink-muted">{description}</p> : null}
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
  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`${frame} w-full cursor-pointer hover:border-line-strong focus-visible:outline-2 focus-visible:outline-focus`}
      >
        {body}
      </button>
    );
  }
  return <section className={frame}>{body}</section>;
}

const AVATAR_SIZES = {
  small: "size-7 text-xs",
  regular: "size-9 text-sm",
  large: "size-12 text-base",
};

/** The first letters of a name's first and last words, for an avatar. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * A person or a thing, as a picture or as the initials of its name. The name
 * is its accessible label; mark it `decorative` when the name is written beside it.
 */
export function Avatar({
  name,
  src,
  size = "regular",
  decorative = false,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  decorative?: boolean;
}) {
  const box = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${AVATAR_SIZES[size]}`;
  if (src) {
    return <img src={src} alt={decorative ? "" : name} className={`${box} object-cover`} />;
  }
  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
      className={`${box} bg-action-soft font-semibold text-action`}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * A gray placeholder where something is loading, in the shape of what will be
 * there. Several lines of text are drawn with `lines`. It pulses unless the
 * person asked for less motion.
 */
export function Skeleton({
  lines = 1,
  className = "",
  label = "Loading",
}: {
  lines?: number;
  /** Sets the shape: `h-24 w-full` for a card, `size-9 rounded-full` for an avatar. */
  className?: string;
  /** Read out once in place of the shapes. */
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <div
          // The shapes are all alike and never reorder.
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          key={index}
          aria-hidden="true"
          className={`animate-pulse rounded-control bg-sunken motion-reduce:animate-none ${
            className || (index === lines - 1 && lines > 1 ? "h-4 w-2/3" : "h-4 w-full")
          }`}
        />
      ))}
    </div>
  );
}
