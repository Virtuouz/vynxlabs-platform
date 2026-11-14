import type { ReactNode } from "react";

/**
 * Junction dots: where a signal path meets a place. `here` is filled with the
 * accent, `production` is an amber ring, `pending` a dashed ring for what is not
 * yet deployed, and `plain` a quiet ring.
 */
export type JunctionKind = "here" | "production" | "pending" | "plain" | "danger";

export function Junction({ kind, size = 7 }: { kind: JunctionKind; size?: 5 | 7 }) {
  const box = size === 5 ? "size-[5px]" : "size-[7px]";
  const look: Record<JunctionKind, string> = {
    here: "bg-action",
    production: "border border-attention",
    pending: "border border-dashed border-action",
    plain: "border border-line-strong",
    danger: "bg-danger",
  };
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${box} ${look[kind]}`}
    />
  );
}

/** A short horizontal line of the signal path, between two junctions. */
export function Wire({ dashed = false, width = 14 }: { dashed?: boolean; width?: 6 | 14 | 20 }) {
  const w = width === 6 ? "w-1.5" : width === 20 ? "w-5" : "w-3.5";
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-px shrink-0 ${w} ${dashed ? "border-line-strong border-t border-dashed" : "bg-line-strong"}`}
    />
  );
}

export interface PathStep {
  key: string;
  label: ReactNode;
  kind: JunctionKind;
  /** Draws the wire into this step dashed: a relation, not a place you are in. */
  loose?: boolean;
}

/** A horizontal run of places joined by a fine line: scope, release stages, attempts. */
export function SignalPath({ steps, className = "" }: { steps: PathStep[]; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {steps.map((step, index) => (
        <span key={step.key} className="inline-flex min-w-0 items-center gap-1.5">
          {index > 0 ? <Wire dashed={step.loose ?? false} /> : null}
          <Junction kind={step.kind} size={5} />
          <span className="min-w-0 truncate">{step.label}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * Port brackets: two corner marks on the one object that is chosen, such as a
 * node, a widget or a release stage. Scarce on purpose.
 */
export function PortBrackets({
  children,
  active = true,
  className = "",
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      {children}
      {active ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -left-1 size-2.5 border-action border-t-2 border-l-2"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -bottom-1 size-2.5 border-action border-r-2 border-b-2"
          />
        </>
      ) : null}
    </div>
  );
}

/** The short accent bar over an inspector's or a sheet's title. */
export function InsetRule() {
  return <span aria-hidden="true" className="block h-0.5 w-5 bg-action" />;
}

/** A vertical line with a junction per entry, for an ordered list such as steps or a ledger. */
export function JunctionList({
  items,
}: {
  items: { key: string; kind: JunctionKind; content: ReactNode }[];
}) {
  return (
    <ol className="relative m-0 flex list-none flex-col gap-2.5 p-0 pl-4">
      <span
        aria-hidden="true"
        className="absolute top-1.5 bottom-1.5 left-[3px] w-px bg-line-strong"
      />
      {items.map((item) => (
        <li key={item.key} className="relative text-meta">
          <span className="absolute top-[5px] -left-4">
            <Junction kind={item.kind} />
          </span>
          {item.content}
        </li>
      ))}
    </ol>
  );
}
