/**
 * What the drawers of the layout, record and action widgets share: how a setting is written,
 * the "‹ Back" head of a sub-view, a labelled block, the tones a button is drawn in, and the
 * icons a button may carry.
 */
import { DrawerGroup, type DrawerIcon, DrawerRow } from "@volvel/ui";
import { ChevronLeft } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import type { Env } from "../controls.tsx";
import { ICON_CHOICES as KIT_ICONS } from "../controls.tsx";
import { withConfig } from "../model.ts";

export type { Env };

/** Writes one setting of the widget, as one step to undo (typing joins into one). */
export function setConfig(env: Env, name: string, value: unknown, label: string, joins = false) {
  env.write(
    withConfig(env.widget, name, value),
    `changing ${label.toLowerCase()}`,
    joins ? `config:${env.widget.id}:${name}` : undefined,
  );
}

/**
 * For the Back button of a sub-view, which takes the focus when the view opens (a keyboard
 * reader is not left on a control that has gone) and gives it back to what opened it when it
 * closes, if that is still there.
 */
export function useTakesFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      const now = document.activeElement;
      if ((now === document.body || now === null) && opener?.isConnected) opener.focus();
    };
  }, []);
  return ref;
}

/** The head of a sub-view: "‹ Back" and where you are. */
export function BackHead({
  onBack,
  title,
  kind,
}: {
  onBack: () => void;
  title: string;
  kind?: string;
}) {
  const back = useTakesFocus<HTMLButtonElement>();
  return (
    <div className="flex items-center gap-2">
      <button
        ref={back}
        type="button"
        onClick={onBack}
        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-control px-2 text-body-sm text-ink-muted outline-offset-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ChevronLeft aria-hidden="true" size={14} />
        Back
      </button>
      <div className="min-w-0">
        <p className="m-0 truncate text-body-sm font-semibold text-ink">{title}</p>
        {kind ? <p className="m-0 truncate text-meta text-ink-muted">{kind}</p> : null}
      </div>
    </div>
  );
}

/**
 * A label over a segmented control, inside a group: "Fields across", "Line up". The segments
 * share the width, as the boards draw them.
 */
export function LabelledBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-3 [&_fieldset]:flex [&_fieldset]:w-full [&_fieldset]:flex-nowrap [&_label]:flex-1 [&_label]:justify-center">
      <p className="m-0 text-body-sm text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

/** A dashed "+ …" that opens something: the same look as `DashedAdd`, and it can anchor a popover. */
export const dashedFace =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong px-3 text-body-sm text-ink-muted outline-offset-2 hover:border-action hover:text-ink focus-visible:outline-2 focus-visible:outline-focus";

/** A button drawn as it is on the page, in a tone. For a tile. */
export function ButtonPreview({
  tone,
  label,
  icon: Icon,
}: {
  tone: string | undefined;
  label: string;
  icon?: DrawerIcon | undefined;
}) {
  const face =
    tone === "primary"
      ? "bg-action text-action-ink"
      : tone === "quiet"
        ? "text-ink"
        : tone === "danger"
          ? "border border-danger text-danger"
          : "border border-line-strong bg-surface text-ink";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex min-h-7 max-w-full items-center justify-center gap-1 rounded-control px-2 py-0.5 text-center text-meta leading-tight font-medium ${face}`}
    >
      {Icon ? <Icon size={14} /> : null}
      <span className="line-clamp-2 break-words">{label}</span>
    </span>
  );
}

export const TONE_WORDS: Record<string, string> = {
  primary: "Main",
  default: "Normal",
  quiet: "Quiet",
  danger: "Danger",
};

/** The icons a button may carry: the kit's one curated set (`controls.tsx`), the names the views know. */
export const ICON_CHOICES: { name: string; label: string; Icon: DrawerIcon }[] = KIT_ICONS.map(
  ({ name, label, icon }) => ({ name, label, Icon: icon as DrawerIcon }),
);

export const iconOf = (name: string | undefined) => ICON_CHOICES.find((one) => one.name === name);

/** The "Icon" row: the current icon, and a grid of the others in its small editor. */
export function IconRow({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (name: string | undefined) => void;
}) {
  const current = iconOf(value);
  return (
    <DrawerRow
      label="Icon"
      {...(current ? { icon: current.Icon } : {})}
      value={current ? current.label : <span className="text-ink-muted">None</span>}
      editorTitle="Icon"
      editorFooter={false}
      editor={
        <div role="radiogroup" aria-label="Icon" className="grid grid-cols-4 gap-1.5">
          <IconChoice label="None" on={!value} onPick={() => onChange(undefined)} />
          {ICON_CHOICES.map(({ name, label, Icon }) => (
            <IconChoice
              key={name}
              label={label}
              Icon={Icon}
              on={value === name}
              onPick={() => onChange(name)}
            />
          ))}
        </div>
      }
    />
  );
}

function IconChoice({
  label,
  Icon,
  on,
  onPick,
}: {
  label: string;
  Icon?: DrawerIcon;
  on: boolean;
  onPick: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a grid of icon buttons that act as one radio group
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onPick}
      className={`grid h-10 cursor-pointer place-items-center rounded-control border text-body-sm outline-offset-1 focus-visible:outline-2 focus-visible:outline-focus ${
        on
          ? "border-action bg-action-soft text-action"
          : "border-line text-ink hover:border-line-strong"
      }`}
    >
      {Icon ? <Icon size={16} aria-hidden /> : <span className="text-meta">None</span>}
    </button>
  );
}

/** A list in the order of `ids`; anything the ids miss keeps its place at the end. */
export function reorderBy<T extends { id: string }>(
  list: readonly T[],
  ids: readonly string[],
): T[] {
  const byId = new Map(list.map((one) => [one.id, one]));
  const next = ids.map((id) => byId.get(id)).filter((one): one is T => one !== undefined);
  for (const one of list) if (!ids.includes(one.id)) next.push(one);
  return next;
}

// ---------------------------------------------------------------------------
// Groups

/** A group of the drawer: a section's own `DrawerGroup`. */
export function Group({
  label,
  note,
  aside,
  children,
}: {
  label: string;
  note?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DrawerGroup label={label} {...(note ? { note } : {})} {...(aside ? { aside } : {})}>
      {children}
    </DrawerGroup>
  );
}
