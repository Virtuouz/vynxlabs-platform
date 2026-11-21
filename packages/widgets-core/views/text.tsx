import { Markdown } from "@volvel/ui";
import type { WidgetViewProps } from "@volvel/widgets";

/** Headings, instructions and help, in Markdown. */
export function TextView({ config, building }: WidgetViewProps<{ text?: string }>) {
  const text = config.text ?? "";
  if (text.trim() === "") {
    return building ? (
      <p className="m-0 text-ink-muted">Write something in the Display tab.</p>
    ) : null;
  }
  // The `product` profile for now: a `page` profile is the Markdown reader's to add.
  return <Markdown text={text} />;
}
