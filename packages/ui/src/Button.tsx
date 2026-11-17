import { LoaderCircle } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";

const styles = {
  primary: "bg-action text-action-ink hover:brightness-110",
  secondary: "bg-surface text-ink border border-line-control hover:bg-sunken",
  quiet: "text-action hover:bg-action-soft",
  danger: "text-danger hover:bg-danger-soft",
  "danger-solid": "bg-danger text-surface hover:brightness-110",
  /** Reserved for the one action that changes production. */
  promote: "bg-attention text-canvas hover:brightness-110",
};

interface Shared {
  variant?: keyof typeof styles;
  /**
   * `regular` is the page's own control height: 36 px in tenant apps, 32 px in
   * the console. `small` is 28 px, for toolbars inside a pane; `large` is 36 px
   * everywhere, for sign-in.
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
  small: "h-7 gap-1.5 px-2 text-body-sm",
  regular: "h-control gap-2 px-3",
  large: "h-9 gap-2 px-4",
};

const classesOf = (variant: keyof typeof styles, size: "regular" | "small" | "large", extra = "") =>
  `inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap no-underline transition-[background-color,filter] motion-fast active:brightness-95 disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none ${SIZES[size]} ${styles[variant]} ${extra}`;

export function Button({ tooltip, keys, ...props }: ButtonProps) {
  const drawn = <Plain {...props} />;
  if (tooltip === undefined) return drawn;
  // A disabled button takes no pointer or focus: a wrapper that does says why.
  const disabled = props.href === undefined && (props.disabled || props.loading);
  return (
    <Tooltip label={tooltip} keys={keys}>
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
