import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

const styles = {
  primary: "bg-action text-action-ink hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:bg-sunken",
  quiet: "text-action hover:bg-action-soft",
  danger: "text-danger hover:bg-danger-soft",
  "danger-solid": "bg-danger text-surface hover:brightness-110",
  /** Reserved for the one action that changes production. */
  promote: "bg-attention text-canvas hover:brightness-110",
};

interface Shared {
  variant?: keyof typeof styles;
  size?: "regular" | "small";
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

const classesOf = (variant: keyof typeof styles, size: "regular" | "small", extra = "") =>
  `inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap no-underline disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none ${
    size === "small" ? "h-7 px-2 text-[13px]" : "h-9 px-3.5"
  } ${styles[variant]} ${extra}`;

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
