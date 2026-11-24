import { type ReactNode, useId, useState } from "react";
import { Button } from "./Button.tsx";
import { useInOverlay } from "./overlay.ts";
import { useContained } from "./Panel.tsx";

/** What a failure's words can lead to: a label and where it goes. */
export interface FailureHelp {
  label: string;
  onClick: () => void;
  /**
   * What to show under the notice when it sits inside a dialog or sheet, where the help panel
   * would open behind the modal: the explanation itself, and where the whole of it is read.
   */
  inline?: { body: () => ReactNode; href: string };
}

let explainer: ((words: string) => FailureHelp | undefined) | undefined;

/**
 * The host says, once, which words it knows a way to explain (the words of a failure the API gave
 * a code for). A danger `Notice` of those words offers the way, as a toast does, so that a failure
 * shown in a dialog and one shown in a corner are told alike.
 */
export function setFailureExplainer(
  find: ((words: string) => FailureHelp | undefined) | undefined,
) {
  explainer = find;
}

const tones = {
  info: "bg-action-soft text-ink",
  attention: "bg-attention-soft text-ink",
  danger: "bg-danger-soft text-ink",
  success: "bg-success-soft text-ink",
  plain: "bg-surface text-ink",
};
const edges = {
  info: "border border-action/30",
  attention: "border border-attention/30",
  danger: "border border-danger/30",
  success: "border border-success/30",
  plain: "border border-line",
};

/**
 * A message that needs to be seen: an error, a state the person must not miss, or that something worked.
 * Inside a `Panel` it drops its border and keeps its tint (07 §7.5), so no box sits in another.
 */
export function Notice({
  tone,
  children,
  action,
  bare,
}: {
  tone: keyof typeof tones;
  children: ReactNode;
  action?: ReactNode;
  /** Without its border: where it sits inside a container that is not a `Panel`. */
  bare?: boolean;
}) {
  const contained = useContained();
  const edge = (bare ?? contained) ? "" : edges[tone];
  const help =
    action === undefined && tone === "danger" && typeof children === "string"
      ? explainer?.(children)
      : undefined;
  const inOverlay = useInOverlay();
  const [open, setOpen] = useState(false);
  const region = useId();
  const inline = inOverlay ? help?.inline : undefined;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-control px-3 py-2 ${tones[tone]} ${edge}`}
    >
      <div>{children}</div>
      {action}
      {help ? (
        <Button
          size="small"
          variant="quiet"
          onClick={inline ? () => setOpen((now) => !now) : help.onClick}
          {...(inline ? { "aria-expanded": open, "aria-controls": region } : {})}
        >
          {help.label}
        </Button>
      ) : null}
      {inline && open ? (
        <section id={region} aria-label="What this means" className="basis-full">
          <div className="text-ink-muted">{inline.body()}</div>
          <a
            href={inline.href}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-action underline"
          >
            Open in documentation
          </a>
        </section>
      ) : null}
    </div>
  );
}

/** What an empty list shows: what belongs here, and the way to add the first one. */
export function EmptyState({
  title,
  children,
  action,
  inCard,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** In a card that is already a box (a widget's): no box of its own, and centered in the room the card has. */
  inCard?: boolean;
}) {
  return (
    <div
      data-empty-state=""
      className={
        inCard
          ? "flex min-h-32 flex-1 flex-col items-center justify-center px-3 py-6 text-center"
          : "rounded-panel border border-dashed border-line px-5 py-8"
      }
    >
      <p className="m-0 font-medium">{title}</p>
      {children ? <p className="mt-1 mb-0 max-w-measure text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
