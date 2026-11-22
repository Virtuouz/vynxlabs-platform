/**
 * What the data rows share: writing one part of an input's visual query, the types a column has
 * in words and icons, and a list of choices that reads as radio rows.
 */
import type { DataInput, VisualQuery } from "@volvel/manifest";
import type { DrawerIcon } from "@volvel/ui";
import { Calendar, Hash, Link2, List, ToggleLeft, Type } from "lucide-react";
import { useId } from "react";
import type { Env } from "./controls.tsx";
import {
  type CatalogColumn,
  renamedResult,
  tidyVisual,
  withInput,
  withSystemColumns,
} from "./model.ts";

export const TEMPORAL = new Set(["date", "timestamp"]);
export const NUMERIC = new Set(["integer", "number"]);

/** The columns of the table an input reads, with the ones every table has. */
export function columnsOf(env: Env, visual: VisualQuery | undefined): CatalogColumn[] {
  return withSystemColumns(
    env.catalog.tables.find((one) => one.name === visual?.table)?.columns ?? [],
  );
}

/** The icon of a column's type. */
export function iconOfType(type: string, references?: string | null): DrawerIcon {
  if (references) return Link2;
  if (TEMPORAL.has(type)) return Calendar;
  if (NUMERIC.has(type)) return Hash;
  if (type === "enum") return List;
  if (type === "boolean") return ToggleLeft;
  return Type;
}

/** Writes one input's visual query; `key` joins quick changes into one step to undo. */
export function writeVisual(
  env: Env,
  input: string,
  next: VisualQuery,
  words: string,
  key?: string,
  widget = env.widget,
) {
  const data = widget.data?.[input];
  if (!data) return;
  env.write(
    withInput(widget, input, { ...(data as DataInput), source: { visual: tidyVisual(next) } }),
    words,
    key,
  );
}

/** A name a result had is the name it has now: in the visual's own sort, and in the widget's configuration. */
export function renameIn(env: Env, input: string, visual: VisualQuery, from: string, to: string) {
  if (from === to) return { visual, widget: env.widget };
  return {
    visual: {
      ...visual,
      ...(visual.sort
        ? { sort: visual.sort.map((one) => (one.by === from ? { ...one, by: to } : one)) }
        : {}),
    },
    widget: renamedResult(env.definition, env.widget, input, from, to),
  };
}

/**
 * A list of choices as radio rows, each with a quiet word beside it: "a date", "3 values". The
 * chosen one is highlighted.
 */
export function ChoiceList<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: Value; label: string; hint?: string; icon?: DrawerIcon }[];
  value: Value | undefined;
  onChange: (next: Value) => void;
}) {
  const name = useId();
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {options.map((one) => {
        const on = one.value === value;
        const Icon = one.icon;
        return (
          <label
            key={one.value}
            className={`flex h-9 cursor-pointer items-center gap-2 rounded-control border px-3 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
              on ? "border-action bg-selected" : "border-transparent hover:bg-selected"
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={on}
              onChange={() => onChange(one.value)}
              className="sr-only"
            />
            {Icon ? <Icon size={14} aria-hidden className="shrink-0 text-ink-muted" /> : null}
            <span className="min-w-0 flex-1 truncate">{one.label}</span>
            {one.hint ? (
              <span className="shrink-0 text-meta text-ink-muted">{one.hint}</span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}
