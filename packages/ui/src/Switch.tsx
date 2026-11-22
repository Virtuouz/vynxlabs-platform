import { Switch as Base } from "@base-ui/react/switch";
import type { ReactNode } from "react";

/**
 * The boards' pill toggle: an on-or-off setting that takes effect as it is
 * pressed ("Full width", "Stored in cents"). The label sits before it, so the
 * whole row reads as one line, and can be pressed too. Use a checkbox for a
 * choice that is made with a form's Save.
 */
export function Switch({
  label,
  hint,
  checked,
  onChange,
  disabled,
  name,
  labelHidden = false,
}: {
  label: ReactNode;
  /** A line under the label that says what on means. */
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  /** The label names it for screen readers only, for a row that already says what it is. */
  labelHidden?: boolean;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the switch is the control, inside it
    <label className="flex cursor-pointer items-center justify-between gap-3 has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
      <span className={labelHidden ? "sr-only" : "flex min-w-0 flex-col"}>
        <span className="text-body-sm text-ink">{label}</span>
        {hint ? <span className="text-meta text-ink-muted">{hint}</span> : null}
      </span>
      <Base.Root
        checked={checked}
        {...(disabled === undefined ? {} : { disabled })}
        {...(name === undefined ? {} : { name })}
        onCheckedChange={(next: boolean) => onChange(next)}
        className="relative h-5 w-9 shrink-0 rounded-full border border-line-strong bg-raised transition-colors motion-fast data-[checked]:border-transparent data-[checked]:bg-action"
      >
        <Base.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-ink-muted transition-transform motion-fast data-[checked]:translate-x-[18px] data-[checked]:bg-action-ink" />
      </Base.Root>
    </label>
  );
}
