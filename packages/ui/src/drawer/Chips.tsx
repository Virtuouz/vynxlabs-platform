import { Check, Plus, X } from "lucide-react";
import type { ComponentPropsWithRef, ReactElement, ReactNode } from "react";

const focus = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** Chips, laid out in a wrapping row. */
export function ChipSet({ children, label }: { children: ReactNode; label?: string }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset draws a border and a legend
    <div
      role="group"
      {...(label ? { "aria-label": label } : {})}
      className="flex flex-wrap gap-1.5"
    >
      {children}
    </div>
  );
}

/**
 * "✓ Clinic": a thing that is followed or on. Pressing it switches it off, and it then draws
 * dashed, as the filter a widget does not follow.
 */
export function CheckChip({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-control border px-3 text-body-sm ${focus} ${
        checked
          ? "border-action bg-action-soft text-action"
          : "border-dashed border-line-strong text-ink-muted hover:text-ink"
      }`}
    >
      {checked ? <Check aria-hidden="true" size={14} /> : null}
      {children}
    </button>
  );
}

/**
 * A sentence as a chip, with a ×: "Status is Unpaid". Pass the sentence as children, its value
 * in `<strong>`. Pressing the sentence runs `onEdit`; the × runs `onRemove`. (The brief calls it
 * ValueChip; `ValueChip` is already the console's colored value badge in this kit.)
 */
export function SentenceChip({
  children,
  onEdit,
  onRemove,
  removeLabel = "Remove",
}: {
  children: ReactNode;
  onEdit?: () => void;
  onRemove?: () => void;
  /** What the × says to a screen reader: "Remove Status is Unpaid". */
  removeLabel?: string;
}) {
  return (
    <span className="inline-flex h-7 items-center rounded-control border border-line-strong bg-sunken text-body-sm text-ink">
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className={`h-full cursor-pointer rounded-l-control pr-1 pl-3 ${focus}`}
        >
          {children}
        </button>
      ) : (
        <span className="pr-1 pl-3">{children}</span>
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className={`grid h-full w-6 cursor-pointer place-items-center rounded-r-control text-ink-muted hover:text-ink ${focus}`}
        >
          <X aria-hidden="true" size={14} />
        </button>
      ) : (
        <span className="w-1.5" />
      )}
    </span>
  );
}

/**
 * The dashed "+ Condition". It passes its other props on, so it can be the trigger of a
 * `DrawerEditor`: `<DrawerEditor trigger={<AddChip>Condition</AddChip>}>`.
 */
export function AddChip({
  children,
  ...rest
}: { children: ReactNode } & ComponentPropsWithRef<"button">): ReactElement {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-control border border-dashed border-line-strong px-3 text-body-sm text-ink-muted hover:border-action hover:text-ink ${focus}`}
    >
      <Plus aria-hidden="true" size={14} />
      {children}
    </button>
  );
}
