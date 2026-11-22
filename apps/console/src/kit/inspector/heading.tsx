/**
 * "Heading": the title and the caption of a widget that has a frame (boards 11, 14, 15, 18).
 * The shell draws it in the Display tab, first (or last, for a table, list, detail and form); a
 * section that wants it elsewhere (the stat and goal put their Preview before it) registers
 * with `ownHeading` and places `HeadingGroup` itself. A frameless widget (a button, an action
 * group, a filter) has none: its title is only the outline's name, set in ⋯ › Layout.
 */
import { DrawerGroup, DrawerRow, TextField } from "@volvel/ui";
import { Type } from "lucide-react";
import type { Env } from "./controls.tsx";
import { withConfig, withText } from "./model.ts";

/** Whether the widget is drawn in a frame that has a title. */
export const hasHeading = (env: Env) => env.definition.layout.frame !== "none";

export function HeadingGroup({
  env,
  caption: setting,
  fields = false,
}: {
  env: Env;
  /** The setting that holds the caption, when it is not the widget's own subtitle. */
  caption?: string;
  /** Two fields written in place (the chart's), not two rows that open an editor. */
  fields?: boolean;
}) {
  const { widget } = env;
  if (!hasHeading(env)) return null;
  // A widget whose caption is a setting of its own (the stat's) writes that.
  const name = setting ?? ("caption" in env.definition.config.properties ? "caption" : undefined);
  const own = name !== undefined;
  const caption = own
    ? typeof env.config[name] === "string"
      ? (env.config[name] as string)
      : undefined
    : widget.subtitle;
  const writeTitle = (text: string) =>
    env.write(withText(widget, "title", text), "changing the title", `title:${widget.id}`);
  const writeCaption = (text: string) =>
    own
      ? env.write(
          withConfig(widget, name, text || undefined),
          "changing the caption",
          `${name}:${widget.id}`,
        )
      : env.write(
          withText(widget, "subtitle", text),
          "changing the caption",
          `subtitle:${widget.id}`,
        );
  if (!fields) {
    return (
      <DrawerGroup label="Heading">
        <DrawerRow
          label="Title"
          icon={Type}
          value={widget.title || <span className="text-ink-muted">Add a title</span>}
          editorTitle="Title"
          editor={
            <TextField
              name={`${widget.id}-title`}
              label="Title"
              hint="Or click the title on the page."
              required={false}
              maxLength={100}
              value={widget.title ?? ""}
              onChange={writeTitle}
            />
          }
        />
        <DrawerRow
          label="Caption"
          icon={Type}
          value={caption || <span className="text-ink-muted">Add a line under the title</span>}
          editorTitle="Caption"
          editor={
            <TextField
              name={`${widget.id}-caption`}
              label="Caption"
              hint="What the numbers are, or what to notice."
              required={false}
              maxLength={200}
              value={caption ?? ""}
              onChange={writeCaption}
            />
          }
        />
      </DrawerGroup>
    );
  }
  const field = (
    label: string,
    value: string,
    placeholder: string,
    max: number,
    onChange: (text: string) => void,
  ) => (
    <label className="flex flex-col gap-0.5 px-3 py-2">
      <span className="text-meta text-ink-muted">{label}</span>
      <input
        type="text"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        maxLength={max}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-full min-w-0 border-0 bg-transparent p-0 text-body-sm font-medium text-ink outline-offset-4 placeholder:font-normal placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-focus"
      />
    </label>
  );
  return (
    <DrawerGroup label="Heading" note="Also editable by clicking the title on the page.">
      {field("Title", widget.title ?? "", "A name for it", 100, writeTitle)}
      {field("Caption", caption ?? "", "What the numbers are, or what to notice", 200, writeCaption)}
    </DrawerGroup>
  );
}
