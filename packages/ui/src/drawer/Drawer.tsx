import { Popover } from "@base-ui/react/popover";
import { ChevronRight, X } from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useRef,
} from "react";
import { useOpening } from "../presence.tsx";
import { edgeShadows } from "./edgeShadows.ts";

/** An icon component from `@volvel/ui/icons`, or any component that takes a class and a size. */
export type DrawerIcon = ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true";
}>;

// ---------------------------------------------------------------------------
// Header

/** The head of a drawer: the widget's icon tile, its name, its kind, and a ⋯ menu. */
export function DrawerHeader({
  icon: Icon,
  name,
  kind,
  menu,
}: {
  icon?: DrawerIcon;
  name: string;
  /** "Stat", "Chart", "Table". */
  kind: string;
  /** The ⋯ menu: pass a `Menu` or any button. */
  menu?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3">
      {Icon ? (
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-control border border-line bg-action-soft text-action"
        >
          <Icon size={16} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="m-0 truncate text-emphasis font-semibold text-ink">{name}</h2>
        <p className="m-0 truncate text-body-sm text-ink-muted">{kind}</p>
      </div>
      {menu ? <div className="shrink-0">{menu}</div> : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Tabs

export interface DrawerTab {
  id: string;
  label: string;
  /** Something is set on this tab: a dot. */
  dot?: boolean;
  /** A count, in place of the dot. */
  count?: number;
}

const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/**
 * The segmented tab bar. Left and Right (and Home and End) move between the tabs and open the
 * one they land on. Pair it with `DrawerPanel`, with the same `idPrefix`.
 */
export function DrawerTabs({
  tabs,
  value,
  onChange,
  idPrefix,
  label = "Settings",
}: {
  tabs: readonly DrawerTab[];
  value: string;
  onChange: (id: string) => void;
  idPrefix: string;
  label?: string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const move = (event: KeyboardEvent, at: number) => {
    const last = tabs.length - 1;
    const to =
      event.key === "ArrowRight"
        ? (at + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (at - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (to < 0) return;
    event.preventDefault();
    const next = tabs[to];
    if (!next) return;
    onChange(next.id);
    refs.current.get(next.id)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-0.5 rounded-control border border-line bg-sunken p-0.5"
    >
      {tabs.map((tab, at) => {
        const on = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) refs.current.set(tab.id, node);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab.id)}
            aria-selected={on}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => move(event, at)}
            className={`inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-inner px-2 text-body-sm font-medium outline-offset-1 focus-visible:outline-2 focus-visible:outline-focus ${
              on ? "bg-raised text-ink ring-1 ring-line" : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="text-meta text-ink-muted tabular-nums">{tab.count}</span>
            ) : tab.dot ? (
              <>
                <span aria-hidden="true" className="size-1.5 rounded-full bg-action" />
                <span className="sr-only">, has settings</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** What a tab holds. */
export function DrawerPanel({
  idPrefix,
  tab,
  children,
}: {
  idPrefix: string;
  tab: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={panelId(idPrefix, tab)}
      aria-labelledby={tabId(idPrefix, tab)}
      className="flex flex-col gap-5"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups and rows

/** An UPPERCASE small label, a bordered list of rows, and a note under it. */
export function DrawerGroup({
  label,
  aside,
  note,
  children,
}: {
  label: string;
  /** Right of the label: "6 of 8 shown". */
  aside?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <h3 id={id} className="m-0 text-label font-semibold text-ink-muted uppercase">
          {label}
        </h3>
        {aside ? <span className="text-meta text-ink-muted">{aside}</span> : null}
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
        {children}
      </div>
      {note ? <p className="m-0 px-0.5 text-meta text-ink-muted">{note}</p> : null}
    </section>
  );
}

/** Free content in a group, padded as a row is: chips, a sentence, a preview. */
export function DrawerBlock({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 px-3 py-3 ${className}`}>
      {label ? <p className="m-0 text-body-sm text-ink-muted">{label}</p> : null}
      {children}
    </div>
  );
}

const rowFace =
  "relative flex min-h-10 w-full items-center gap-3 px-3 py-2 text-left text-body-sm text-ink";

/**
 * One row of a group: its label on the left, an icon and the current value, a chevron. With an
 * `editor` it opens a small editor beside it, and shows as selected while it is open; with
 * `onClick` it runs an action; with neither it only reads.
 */
export function DrawerRow({
  label,
  icon: Icon,
  value,
  mono = false,
  hint,
  active,
  editor,
  editorTitle,
  editorFooter,
  open,
  onOpenChange,
  onClick,
  side = "right",
}: {
  label: string;
  icon?: DrawerIcon;
  /** The current value. */
  value?: ReactNode;
  /** The value is a number or a record number: Geist Mono. */
  mono?: boolean;
  /** A quieter second part of the value: "Money" after "$43,120.00". */
  hint?: ReactNode;
  /** Selected, as the row of an open editor: the accent rail. */
  active?: boolean;
  /** The body of a small editor that opens from the row. */
  editor?: ReactNode;
  editorTitle?: string;
  /** "Done" closes the editor; `false` leaves it out. Default: shown. */
  editorFooter?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClick?: () => void;
  side?: "left" | "right" | "bottom";
}) {
  const body = (
    <>
      <span className="w-24 shrink-0 text-ink-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {Icon ? <Icon size={14} aria-hidden className="shrink-0 text-ink-muted" /> : null}
        <span className={`min-w-[4ch] truncate ${mono ? "font-mono text-action" : ""}`}>
          {value ?? <span className="text-ink-muted">Not set</span>}
        </span>
        {hint ? <span className="min-w-0 shrink-[4] truncate text-ink-muted">· {hint}</span> : null}
      </span>
      {editor || onClick ? (
        <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-ink-muted" />
      ) : null}
    </>
  );
  const rail =
    "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-action before:opacity-0 data-[active]:bg-selected data-[active]:before:opacity-100 data-[popup-open]:bg-selected data-[popup-open]:before:opacity-100";
  const interactive = `${rowFace} ${rail} cursor-pointer outline-offset-[-2px] hover:bg-selected focus-visible:outline-2 focus-visible:outline-focus`;
  if (editor) {
    return (
      <DrawerEditor
        title={editorTitle ?? label}
        footer={editorFooter ?? true}
        side={side}
        {...(open === undefined ? {} : { open })}
        {...(onOpenChange ? { onOpenChange } : {})}
        trigger={
          <button type="button" data-active={active ? "" : undefined} className={interactive}>
            {body}
          </button>
        }
      >
        {editor}
      </DrawerEditor>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-active={active ? "" : undefined}
        className={interactive}
      >
        {body}
      </button>
    );
  }
  return (
    <div data-active={active ? "" : undefined} className={`${rowFace} ${rail}`}>
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The small editor

/**
 * A small editor that opens beside a row or a chip: a title, a close ×, a body, and a "Done"
 * footer. Escape and a click outside close it, and focus goes back to what opened it.
 */
export function DrawerEditor({
  trigger,
  title,
  children,
  footer = true,
  doneLabel = "Done",
  open,
  onOpenChange,
  onDone,
  side = "right",
  boundary,
}: {
  /** The element that opens it: a button. */
  trigger: ReactElement;
  title: string;
  children: ReactNode;
  footer?: boolean;
  doneLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Runs when "Done" is pressed, before it closes. */
  onDone?: () => void;
  side?: "left" | "right" | "bottom";
  /** An element it stays inside (the canvas, so it never covers the settings or the header). */
  boundary?: Element | null | undefined;
}) {
  // One put on the page already open (a row added and opened at once, a column's editor beside its heading) is
  // told it is shut first, so it arrives with the starting style that a click on its trigger gives it.
  const opening = useOpening(open === true);
  const controlled = open === undefined ? {} : { open: opening };
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Popover.Root
      {...controlled}
      {...(onOpenChange ? { onOpenChange: (next: boolean) => onOpenChange(next) } : {})}
    >
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner
          side={side}
          align="start"
          sideOffset={8}
          // Below the app's top bar (3.5rem), never over it: the list shrinks and scrolls, its footer stays.
          collisionPadding={{ top: 56, right: 8, bottom: 8, left: 8 }}
          {...(boundary ? { collisionBoundary: boundary } : {})}
          className="layer-popover"
        >
          <Popover.Popup
            ref={popup}
            // Focus stays in it while it is open, as in a dialog: Tab from the last control goes to the first.
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key !== "Tab") return;
              const back = event.shiftKey;
              // Let the browser move on; if that took it out of the editor, bring it round to the other end.
              requestAnimationFrame(() => {
                const box = popup.current;
                if (!box || box.contains(document.activeElement)) return;
                const tabbable = [
                  ...box.querySelectorAll<HTMLElement>(
                    "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
                  ),
                ].filter((one) => one.getClientRects().length > 0);
                (back ? tabbable.at(-1) : tabbable[0])?.focus();
              });
            }}
            // Focus starts on what the editor is for (a search, the chosen row, the first field), not on Close.
            initialFocus={() =>
              popup.current?.querySelector<HTMLElement>("[data-autofocus]") ??
              popup.current?.querySelector<HTMLElement>(
                "input[type=radio]:checked, input[type=radio], [role=radio][aria-checked=true], textarea:not([disabled]), input:not([disabled]):not([type=hidden]):not([type=checkbox])",
              ) ??
              true
            }
            className="flex max-h-[min(34rem,var(--available-height))] w-[22rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-panel border border-line bg-raised text-ink shadow-overlay transition-[opacity,translate] motion-base data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-3">
              <Popover.Title className="m-0 text-body-sm font-semibold">{title}</Popover.Title>
              <Popover.Close
                aria-label={`Close ${title}`}
                className="grid size-6 cursor-pointer place-items-center rounded-inner text-ink-muted outline-offset-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                <X aria-hidden="true" size={14} />
              </Popover.Close>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto p-3"
              // A soft edge at the foot while there is more to see: a small screen shows part of a long editor.
              style={edgeShadows("var(--color-raised)")}
            >
              {children}
            </div>
            {footer ? (
              <div className="flex justify-end border-t border-line px-3 py-2">
                <Popover.Close
                  onClick={onDone}
                  className="h-8 cursor-pointer rounded-control bg-action px-3 text-body-sm font-medium text-action-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {doneLabel}
                </Popover.Close>
              </div>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------------------------------------------------------------------------
// Switch rows and dashed adds

/** A switch: on or off. */
export function DrawerSwitch({
  checked,
  onChange,
  labelledBy,
  describedBy,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelledBy?: string;
  describedBy?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
      {...(describedBy ? { "aria-describedby": describedBy } : {})}
      {...(label ? { "aria-label": label } : {})}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full border outline-offset-2 transition-colors motion-fast focus-visible:outline-2 focus-visible:outline-focus ${
        checked ? "border-action bg-action" : "border-line-control bg-sunken"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 left-0.5 size-3.5 rounded-full transition-[translate] motion-fast ${
          checked ? "translate-x-4 bg-action-ink" : "bg-ink-muted"
        }`}
      />
    </button>
  );
}

/** A label, a help line, and a switch: "Show values on bars". */
export function ToggleRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      {/* The words are part of the switch: a press on them turns it (the keyboard has the switch itself). */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: the switch beside it is the keyboard's control */}
      <div className="min-w-0 cursor-pointer" onClick={() => onChange(!checked)}>
        <p id={id} className="m-0 text-body-sm text-ink">
          {label}
        </p>
        {help ? (
          <p id={helpId} className="m-0 text-meta text-ink-muted">
            {help}
          </p>
        ) : null}
      </div>
      <DrawerSwitch
        checked={checked}
        onChange={onChange}
        labelledBy={id}
        {...(help ? { describedBy: helpId } : {})}
      />
    </div>
  );
}

/** The dashed "+ Add a step", "+ Column": full width, or as wide as its words. */
export function DashedAdd({
  children,
  onClick,
  inline = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  inline?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong px-3 text-body-sm text-ink-muted outline-offset-2 hover:border-action hover:text-ink focus-visible:outline-2 focus-visible:outline-focus ${
        inline ? "" : "w-full"
      }`}
    >
      <span aria-hidden="true">+</span>
      {children}
    </button>
  );
}
