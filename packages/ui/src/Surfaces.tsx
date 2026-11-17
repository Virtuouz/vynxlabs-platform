const AVATAR_SIZES = {
  small: "size-7 text-meta",
  regular: "size-9 text-body",
  large: "size-12 text-emphasis",
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
