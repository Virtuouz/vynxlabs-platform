import { LoaderCircle } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";

/**
 * The boards' four looks: `primary` (main) is solid cyan with dark text,
 * `secondary` (normal) an outline, `quiet` words alone, `danger` an outline
 * with red words. `dashed` is the dashed box that stands for an add place:
 * "+ Add a step".
 */
const styles = {
  primary:
    "bg-action text-action-ink font-semibold hover:brightness-110 forced-colors:border-2 forced-colors:border-[ButtonText]",
  secondary: "border border-line-strong bg-transparent text-ink hover:bg-hover",
  quiet: "text-ink hover:bg-hover",
  danger: "border border-danger/50 text-danger hover:bg-danger-soft",
  "danger-solid":
    "bg-danger text-action-ink font-semibold hover:brightness-110 forced-colors:border-2 forced-colors:border-[ButtonText]",
  /** Reserved for the one action that changes production. */
  promote:
    "bg-attention text-canvas font-semibold hover:brightness-110 forced-colors:border-2 forced-colors:border-[ButtonText]",
  dashed:
    "border border-dashed border-line-strong bg-transparent text-ink-muted hover:bg-hover hover:text-ink",
};

/** The boards' names for the same looks, so a call reads as the board does. */
const ALIASES = { main: "primary", normal: "secondary" } as const;

interface Shared {
  variant?: keyof typeof styles | keyof typeof ALIASES;
  /**
   * `regular` is the page's own control height, 36 px. `small` is 28 px, for
   * toolbars inside a pane; `large` is 40 px, for sign-in.
   */
  size?: "regular" | "small" | "large";
  /**
   * The work it started is under way: a spinner beside the label, which stays,
   * and it cannot be pressed again. Screen readers hear it as busy.
   */
  loading?: boolean;
  /**
   * Said when the button is pointed at or focused: what an icon-only button
   * does, or why a disabled one cannot be pressed. Not a replacement for an
   * accessible name.
   */
  tooltip?: ReactNode;
  /** The shortcut that does the same, shown in the tooltip: `⌘Z`. */
  keys?: string | undefined;
  children: ReactNode;
}

/**
 * A button, or with `href` a link that looks like one. Use the link form when
 * pressing it goes somewhere, so it opens in a new tab and reads as a link to a
 * screen reader.
 */
export type ButtonProps = Shared &
  (
    | (Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> & { href?: undefined })
    | (Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "size"> & { href: string })
  );

const SIZES = {
  small: "h-7 gap-1.5 px-2",
  regular: "h-control gap-2 px-3",
  large: "h-10 gap-2 px-4",
};

const classesOf = (
  named: keyof typeof styles | keyof typeof ALIASES,
  size: "regular" | "small" | "large",
  extra = "",
) => {
  const variant =
    named in ALIASES ? ALIASES[named as keyof typeof ALIASES] : (named as keyof typeof styles);
  return `inline-flex items-center justify-center rounded-control text-body-sm font-medium whitespace-nowrap no-underline transition-[background-color,filter] motion-fast active:brightness-95 disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none ${SIZES[size]} ${styles[variant]} ${extra}`;
};

export function Button({ tooltip, keys, ...props }: ButtonProps) {
  const drawn = <Plain {...props} />;
  if (tooltip === undefined) return drawn;
  // A disabled button takes no pointer or focus: a wrapper that does says why.
  const disabled = props.href === undefined && (props.disabled || props.loading);
  return (
    <Tooltip label={tooltip} keys={keys} tapToShow={disabled === true}>
      {disabled ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focus is how a keyboard user hears why it is disabled
        <span tabIndex={0} className="inline-flex rounded-control">
          {drawn}
        </span>
      ) : (
        (drawn as ReactElement)
      )}
    </Tooltip>
  );
}

function Plain({
  variant = "secondary",
  size = "regular",
  loading = false,
  children,
  ...rest
}: Omit<ButtonProps, "tooltip" | "keys">) {
  const label = loading ? (
    <>
      <LoaderCircle aria-hidden="true" size={14} className="shrink-0 animate-spin" />
      {children}
    </>
  ) : (
    children
  );
  if (rest.href !== undefined) {
    const { className, ...link } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a
        {...link}
        {...(loading ? { "aria-busy": true, "aria-disabled": true } : {})}
        className={classesOf(variant, size, className)}
      >
        {label}
      </a>
    );
  }
  const { className, ...button } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type="button"
      {...button}
      disabled={button.disabled || loading}
      aria-busy={loading || undefined}
      className={classesOf(variant, size, className)}
    >
      {label}
    </button>
  );
}
