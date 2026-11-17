import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

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

export function Button({
  variant = "secondary",
  size = "regular",
  children,
  ...rest
}: ButtonProps) {
  if (rest.href !== undefined) {
    const { className, ...link } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a {...link} className={classesOf(variant, size, className)}>
        {children}
      </a>
    );
  }
  const { className, ...button } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" {...button} className={classesOf(variant, size, className)}>
      {children}
    </button>
  );
}
