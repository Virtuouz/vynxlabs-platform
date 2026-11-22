import { Markdown } from "@volvel/ui";
import type { WidgetViewProps } from "@volvel/widgets";

type Look = "plain" | "note" | "warning" | "tip";

/**
 * A callout is its card, not a box in a box: the card keeps its surface and takes a 3px edge in
 * the callout's color along its left side, as the style tiles in the drawer draw it. The page's
 * card puts this on (see `calloutEdge`).
 */
const EDGE: Record<Exclude<Look, "plain">, string> = {
  note: "inset-shadow-[3px_0_0_0_var(--color-action)]",
  warning: "inset-shadow-[3px_0_0_0_var(--color-attention)]",
  tip: "inset-shadow-[3px_0_0_0_var(--color-success)]",
};

/** The classes a Text widget's card takes for its look; none for a plain one, and for any other widget. */
export function calloutEdge(
  type: string,
  config: Readonly<Record<string, unknown>> | undefined,
): string {
  const look = config?.look;
  return type === "core/text" && typeof look === "string" && look in EDGE
    ? EDGE[look as keyof typeof EDGE]
    : "";
}

/** Headings, instructions and help, in Markdown; as a plain block, or a Note, Warning or Tip card. */
export function TextView({ config, building }: WidgetViewProps<{ text?: string; look?: Look }>) {
  const text = config.text ?? "";
  const look = config.look ?? "plain";
  if (text.trim() === "") {
    return building ? (
      <p className="m-0 text-ink-muted">Click to write, or Edit on the page.</p>
    ) : null;
  }
  return (
    // A callout in the text sits in the widget's card: it keeps its rail and icon and drops its own box.
    <div
      data-look={look}
      className={`[&_[role=note]]:border-transparent [&_[role=note]]:bg-transparent [&_[role=note]]:pr-0 ${look in EDGE ? "pl-1" : ""}`}
    >
      <Markdown text={text} profile="page" />
    </div>
  );
}
