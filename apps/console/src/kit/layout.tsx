import { SideSheet } from "@vynxlabs/ui";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { InsetRule, Junction, type JunctionKind } from "./motifs.tsx";

/** Whether the window is at least this wide, kept up to date as it is resized. */
export function useWide(minWidth: number): boolean {
  const query = `(min-width: ${minWidth}px)`;
  const read = () => typeof window !== "undefined" && window.matchMedia?.(query).matches === true;
  const [wide, setWide] = useState(read);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `read` depends only on `query`
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const update = () => setWide(read());
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return wide;
}

/** The widths the console lays itself out at. */
export const WIDE = { inspector: 1280, panel: 1024, rail: 768 } as const;

/**
 * A screen's heading: an optional line above it, the title, a sentence on what
 * the screen is for, and the screen's actions. One action is primary.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  meta,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow ? <div className="text-meta text-ink-subtle">{eyebrow}</div> : null}
        <h1 className="m-0 text-display">{title}</h1>
        {description ? <p className="m-0 max-w-[70ch] text-ink-muted">{description}</p> : null}
        {meta ? (
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-meta">{meta}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A section's heading inside a screen, in the label role. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="m-0 text-label text-ink-subtle uppercase">{children}</h2>
      {action}
    </div>
  );
}

/** A working surface with a hairline border. */
export function Panel({
  children,
  className = "",
  as: As = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
}) {
  return <As className={`rounded-panel border border-line bg-surface ${className}`}>{children}</As>;
}

/**
 * The details of what is chosen. Beside the list on a wide screen; on a narrower
 * one it slides over the list as a sheet, and on a phone it takes the screen.
 */
export function Inspector({
  open,
  title,
  eyebrow,
  onClose,
  children,
  footer,
  label,
}: {
  open: boolean;
  title: ReactNode;
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** The region's name for screen readers. */
  label: string;
}) {
  const wide = useWide(WIDE.inspector);
  if (!open) return null;
  if (!wide) {
    return (
      <SideSheet open={open} onClose={onClose} title={title} description={eyebrow} footer={footer}>
        {children}
      </SideSheet>
    );
  }
  return (
    <aside
      aria-label={label}
      className="flex w-[22rem] shrink-0 flex-col border-line border-l bg-surface 2xl:w-[26rem]"
    >
      <div className="flex items-start justify-between gap-3 border-line border-b px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <InsetRule />
          {eyebrow ? <span className="text-meta text-ink-subtle">{eyebrow}</span> : null}
          <h2 className="m-0 truncate text-title">{title}</h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <X aria-hidden="true" size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center gap-2 border-line border-t px-4 py-3">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}

/**
 * A list and the inspector of what is chosen in it, filling the work area. The
 * list scrolls on its own, so choosing never loses the place.
 */
export function MasterDetail({
  children,
  inspector,
  side,
}: {
  children: ReactNode;
  inspector: ReactNode;
  /** A rail on the left, such as a list of tables. */
  side?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      {side}
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      {inspector}
    </div>
  );
}

/** Numbered stages, joined by a line, with the current one marked. */
export function Stepper({
  steps,
  current,
  onChoose,
}: {
  steps: { key: string; label: string; detail?: ReactNode; done?: boolean }[];
  current: string;
  onChoose?: (key: string) => void;
}) {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0 md:flex-row md:items-stretch md:gap-0">
      {steps.map((step, index) => {
        const here = step.key === current;
        const kind: JunctionKind = here ? "here" : step.done ? "plain" : "pending";
        const body = (
          <span className="flex min-w-0 items-start gap-2.5 text-left">
            <span
              className={`font-mono text-telemetry ${here ? "text-action" : "text-ink-subtle"}`}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={here ? "font-medium" : "text-ink-muted"}>{step.label}</span>
              {step.detail ? (
                <span className="text-meta text-ink-subtle">{step.detail}</span>
              ) : null}
            </span>
          </span>
        );
        return (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-2">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="hidden h-px w-6 shrink-0 bg-line-strong md:block"
              />
            ) : null}
            <Junction kind={kind} />
            {onChoose ? (
              <button
                type="button"
                aria-current={here ? "step" : undefined}
                onClick={() => onChoose(step.key)}
                className="min-w-0 rounded-control px-1.5 py-1 hover:bg-sunken"
              >
                {body}
              </button>
            ) : (
              <span aria-current={here ? "step" : undefined} className="min-w-0 px-1.5 py-1">
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A state that asks for something, with what to do about it: "3 drafts — Review".
 * Only built from what the API returned.
 */
export function NextStep({
  icon,
  tone = "action",
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  tone?: "action" | "attention" | "danger" | "success";
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  const tile = {
    action: "bg-action-soft text-action",
    attention: "bg-attention-soft text-attention",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  }[tone];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-control ${tile}`}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 basis-48 flex-col">
        <span className="font-medium">{title}</span>
        {detail ? <span className="text-meta text-ink-muted">{detail}</span> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** An empty place, with a small diagram of what goes there and the way to start. */
export function EmptyCanvas({
  title,
  text,
  action,
}: {
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-line-strong border-dashed px-6 py-10 text-center">
      <span aria-hidden="true" className="flex items-center gap-1.5">
        <Junction kind="here" />
        <span className="h-px w-6 bg-line-strong" />
        <Junction kind="pending" />
        <span className="h-px w-6 border-line-strong border-t border-dashed" />
        <Junction kind="plain" />
      </span>
      <p className="m-0 text-title">{title}</p>
      {text ? <p className="m-0 max-w-[52ch] text-ink-muted">{text}</p> : null}
      {action}
    </div>
  );
}

/** Choices that narrow a list, one of which is on. */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; count?: number | null }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const on = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a chip is a toggle button that acts as a radio
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-meta ${
              on
                ? "border-action/60 bg-action-soft text-action"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {option.label}
            {option.count !== undefined && option.count !== null ? (
              <span className="font-mono text-tag opacity-80">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Label and value pairs for an inspector: the value in the code face when it is technical. */
export function KeyValues({
  rows,
}: {
  rows: { label: string; value: ReactNode; mono?: boolean }[];
}) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-meta text-ink-subtle">{row.label}</dt>
          <dd className={`m-0 min-w-0 break-words ${row.mono ? "font-mono text-telemetry" : ""}`}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
