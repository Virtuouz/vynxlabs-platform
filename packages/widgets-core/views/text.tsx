import { Markdown } from "@volvel/ui";
import type { WidgetViewProps } from "@volvel/widgets";

type Look = "plain" | "note" | "warning" | "tip";

/** A callout has a coloured left edge and a tint, as the style tiles draw it. */
const EDGE: Record<Exclude<Look, "plain">, string> = {
  note: "border-l-4 border-action bg-action-soft",
  warning: "border-l-4 border-attention bg-sunken",
  tip: "border-l-4 border-success bg-sunken",
};

/** Headings, instructions and help, in Markdown; as a plain block, or a Note, Warning or Tip around it. */
export function TextView({ config, building }: WidgetViewProps<{ text?: string; look?: Look }>) {
  const text = config.text ?? "";
  const look = config.look ?? "plain";
  if (text.trim() === "") {
    return building ? (
      <p className="m-0 text-ink-muted">Write something in the Display tab.</p>
    ) : null;
  }
  const body = <Markdown text={text} profile="page" />;
  if (look === "plain" || !(look in EDGE)) return body;
  return (
    <div
      data-look={look}
      className={`rounded-control px-4 py-3 ${EDGE[look as keyof typeof EDGE]}`}
    >
      {body}
    </div>
  );
}
