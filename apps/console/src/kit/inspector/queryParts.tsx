/**
 * What the data rows share: writing one part of an input's visual query, the types a column has
 * in words and icons, and a list of choices that reads as radio rows.
 */
import type { DataInput, VisualQuery } from "@volvel/manifest";
import type { DrawerIcon } from "@volvel/ui";
import { Calendar, Hash, Link2, List, ToggleLeft, Type } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { Env } from "./controls.tsx";
import { type CatalogColumn, columnsNamed, renamedResult, tidyVisual, withInput } from "./model.ts";

export const TEMPORAL = new Set(["date", "timestamp"]);
export const NUMERIC = new Set(["integer", "number"]);

/** The columns of the table an input reads, with the ones every table has. */
export function columnsOf(env: Env, visual: VisualQuery | undefined): CatalogColumn[] {
  return columnsNamed(env.catalog, visual?.table, visual?.joins);
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
 * chosen one is highlighted. With `findLabel` there is a search field above (the focus starts
 * there) that narrows the rows by what is typed; with `onEnter` the arrow keys only move over
 * the rows, and Enter (or a click) is what applies one.
 */
export function ChoiceList<Value extends string>({
  label,
  options,
  value,
  onChange,
  findLabel,
  onEnter = false,
}: {
  label: string;
  options: readonly { value: Value; label: string; hint?: string; icon?: DrawerIcon }[];
  value: Value | undefined;
  onChange: (next: Value) => void;
  /** Names a search field over the list, e.g. "Find a table". */
  findLabel?: string;
  /** Arrow keys move without choosing; Enter chooses. */
  onEnter?: boolean;
}) {
  const name = useId();
  const [typed, setTyped] = useState("");
  const [moved, setMoved] = useState<Value>();
  const arrow = useRef(false);
  const needle = typed.trim().toLowerCase();
  const shown = needle
    ? options.filter((one) => `${one.label} ${one.hint ?? ""}`.toLowerCase().includes(needle))
    : options;
  const marked = onEnter ? (moved ?? value) : value;
  const list = useRef<HTMLFieldSetElement>(null);
  const apply = (next: Value | undefined) => {
    if (next !== undefined) onChange(next);
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {findLabel ? (
        <input
          type="search"
          data-autofocus=""
          aria-label={findLabel}
          placeholder={findLabel}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setMoved(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              (
                list.current?.querySelector<HTMLInputElement>("input[type=radio]:checked") ??
                list.current?.querySelector<HTMLInputElement>("input[type=radio]")
              )?.focus();
            } else if (event.key === "Enter") {
              event.preventDefault();
              apply(shown[0]?.value);
            }
          }}
          className="h-9 w-full rounded-control border border-line bg-surface px-3 text-body-sm text-ink outline-offset-1 focus-visible:outline-2 focus-visible:outline-focus"
        />
      ) : null}
      <fieldset
        ref={list}
        className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0"
        onKeyDown={(event) => {
          if (event.key.startsWith("Arrow")) arrow.current = true;
          else if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            apply(marked);
          }
        }}
        onKeyUp={() => {
          arrow.current = false;
        }}
      >
        <legend className="sr-only">{label}</legend>
        {shown.length === 0 ? (
          <p className="m-0 px-3 py-2 text-body-sm text-ink-muted">Nothing matches.</p>
        ) : null}
        {shown.map((one) => {
          const on = one.value === marked;
          const Icon = one.icon;
          return (
            <label
              key={one.value}
              className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-control border px-3 py-1 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
                on ? "border-action bg-selected" : "border-transparent hover:bg-selected"
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={on}
                onChange={() => {
                  // An arrow key moves the mark; a click or Space chooses.
                  if (onEnter && arrow.current) setMoved(one.value);
                  else onChange(one.value);
                  arrow.current = false;
                }}
                className="sr-only"
              />
              {Icon ? <Icon size={14} aria-hidden className="shrink-0 text-ink-muted" /> : null}
              {/* A long hint gives way before the name does, and a name wraps rather than being cut. */}
              <span className="min-w-[40%] flex-1 [overflow-wrap:anywhere]" title={one.label}>
                {one.label}
              </span>
              {one.hint ? (
                <span
                  className="min-w-0 max-w-[50%] truncate text-meta text-ink-muted"
                  title={one.hint}
                >
                  {one.hint}
                </span>
              ) : null}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
