import type { ButtonHTMLAttributes, ComponentChildren } from "preact";

const styles = {
  primary: "bg-action text-action-ink hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:bg-sunken",
  quiet: "text-action hover:bg-action-soft",
  danger: "text-danger hover:bg-danger-soft",
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: keyof typeof styles;
  size?: "regular" | "small";
  children: ComponentChildren;
}

export function Button({
  variant = "secondary",
  size = "regular",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      class={`inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none ${
        size === "small" ? "h-7 px-2 text-[13px]" : "h-9 px-3.5"
      } ${styles[variant]} ${rest.class ?? ""}`}
    >
      {children}
    </button>
  );
}
