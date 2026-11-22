import { Button, Menu, Popover, Tooltip } from "@volvel/ui";
import {
  ChevronDown,
  Eye,
  Monitor,
  Pencil,
  Play,
  Smartphone,
  Tablet,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/** The sizes the preview can be drawn at. */
export const VIEWPORTS = {
  desktop: { label: "Desktop", width: undefined, icon: Monitor },
  tablet: { label: "Tablet", width: 768, icon: Tablet },
  phone: { label: "Phone", width: 390, icon: Smartphone },
} as const;

/** Who the page is drawn as. "Me" is the maker; a group is one of the app's groups. */
export type ViewAs = { as: "me" } | { as: "group"; group: string; name: string };
export const VIEW_AS_ME: ViewAs = { as: "me" };
export const viewAsWords = (view: ViewAs) => (view.as === "me" ? "Me" : view.name);

/** The name being typed, where the name stood. Enter keeps it, Escape and leaving the field are told which. */
export function RenameField({
  title,
  onDone,
}: {
  title: string;
  /** `undefined` leaves the name as it was. */
  onDone: (next: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(title);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.select(), []);
  const finish = (keep: boolean) => {
    const next = draft.trim();
    onDone(keep && next !== "" && next !== title ? next : undefined);
  };
  return (
    <input
      ref={field}
      aria-label="Name of the app"
      value={draft}
      maxLength={200}
      size={Math.max(12, Math.min(draft.length + 2, 40))}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        // Enter and Escape are the name's own; every other key goes on to the page's shortcuts.
        if (event.key === "Enter") {
          event.stopPropagation();
          finish(true);
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          finish(false);
        }
      }}
      className="h-9 min-w-0 max-w-full rounded-control border border-action bg-surface px-2 font-[inherit] text-[length:inherit]"
    />
  );
}

/** The pencil beside the name: it renames the app where the name stands. */
export function RenameButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="small"
      variant="quiet"
      aria-label="Rename the app"
      tooltip="Rename the app"
      onClick={onClick}
    >
      <Pencil aria-hidden="true" size={14} />
    </Button>
  );
}

/** "3 draft changes": what the draft changes against what people see. It opens the review of them. */
export function DraftPill({ count, onOpen }: { count: number | undefined; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-attention bg-attention-soft px-3 text-meta text-ink hover:brightness-95"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-attention" />
      {count === undefined
        ? "Draft changes"
        : `${count} draft ${count === 1 ? "change" : "changes"}`}
    </button>
  );
}

/**
 * "2 to fix": what keeps the app from being published, beside its name, as a pill that opens the
 * list. The workbench does not move, and nothing is covered, when something needs fixing.
 */
export function FixPill({ words }: { words: readonly string[] }) {
  if (words.length === 0) return null;
  return (
    <Popover
      title="To fix before it can be published"
      trigger={
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-danger bg-danger-soft px-3 text-meta text-ink hover:brightness-95"
        >
          <TriangleAlert aria-hidden="true" size={14} className="text-danger" />
          {words.length} to fix
        </button>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-body-sm">
        {words.map((one) => (
          <li key={one}>{one}</li>
        ))}
      </ul>
    </Popover>
  );
}

/** Desktop, Tablet and Phone: the size the page is drawn at. */
export function DeviceSwitch({
  value,
  onChange,
}: {
  value: keyof typeof VIEWPORTS;
  onChange: (next: keyof typeof VIEWPORTS) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Screen size"
      className="flex rounded-control border border-line p-0.5"
      // A radio group: the arrow keys move the choice, and Tab leaves the group.
      onKeyDown={(event) => {
        const keys = Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[];
        const by =
          event.key === "ArrowRight" || event.key === "ArrowDown"
            ? 1
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? -1
              : 0;
        if (by === 0) return;
        event.preventDefault();
        const next = keys[(keys.indexOf(value) + by + keys.length) % keys.length];
        if (!next) return;
        onChange(next);
        const group = event.currentTarget;
        requestAnimationFrame(() =>
          group.querySelector<HTMLElement>(`[data-device="${next}"]`)?.focus(),
        );
      }}
    >
      {(Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]).map((one) => {
        const Icon = VIEWPORTS[one].icon;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a segmented control of toggle buttons
          <button
            key={one}
            type="button"
            role="radio"
            aria-checked={value === one}
            aria-label={VIEWPORTS[one].label}
            data-device={one}
            tabIndex={value === one ? 0 : -1}
            onClick={() => onChange(one)}
            className={`flex h-7 items-center gap-1.5 rounded-inner px-3 text-meta ${
              value === one ? "bg-selected text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon aria-hidden="true" size={14} />
            <span className="max-xl:sr-only">{VIEWPORTS[one].label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "View as Me ▾": who the page is drawn as. It records the choice; what is drawn for a group follows from it. */
export function ViewAsMenu({
  value,
  groups,
  onChange,
}: {
  value: ViewAs;
  /** The tenant's groups, by key (`group-keys`). */
  groups: readonly { key: string; name: string }[];
  onChange: (next: ViewAs) => void;
}) {
  return (
    <Menu
      ariaLabel={`View as ${viewAsWords(value)}`}
      align="end"
      triggerClassName="flex h-8 items-center gap-1.5 rounded-control border border-line-control px-3 text-body-sm hover:bg-sunken"
      label={
        <>
          <Eye aria-hidden="true" size={14} className="text-ink-muted" />
          <span className="text-ink-muted max-xl:sr-only">View as</span>
          <span className="font-medium">{viewAsWords(value)}</span>
          <ChevronDown aria-hidden="true" size={14} className="text-ink-muted" />
        </>
      }
      items={[
        {
          label: "Me",
          current: value.as === "me",
          onSelect: () => onChange(VIEW_AS_ME),
        },
        ...groups.map((group, at) => ({
          label: group.name,
          current: value.as === "group" && value.group === group.key,
          separated: at === 0,
          onSelect: () => onChange({ as: "group", group: group.key, name: group.name }),
        })),
      ]}
    />
  );
}

/** "▷ Preview": the draft as people will use it, in a new tab at the builder's address. */
export function PreviewButton({ onOpen, note }: { onOpen: () => void; note: string }) {
  return (
    <Tooltip label={note}>
      <Button onClick={onOpen}>
        <Play aria-hidden="true" size={14} /> <span className="max-sm:sr-only">Preview</span>
      </Button>
    </Tooltip>
  );
}

/**
 * Publish as a split button: the main part is the step itself (it opens the check of what would be
 * published); the arrow holds "Publish", "Open the published app" and, later, "Restore an earlier
 * draft" (off until draft history is built).
 */
export function PublishSplit({
  disabled,
  onPublish,
  openHref,
  restore,
  check,
}: {
  disabled: boolean;
  /** Asks for the check ("Ready to publish"): the main part and the first item of the menu. */
  onPublish: () => void;
  /** The check, in a popover under the main part, opened and closed from outside (it is saved first). */
  check?: { open: boolean; onOpenChange: (open: boolean) => void; content: ReactNode } | undefined;
  /** The published app's address; the item is off while there is none. */
  openHref: string | undefined;
  /** Wired when draft history exists; until then the item is off. */
  restore?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  // Both panels hang from the whole split button, their right edges at its right edge (board 6).
  const whole = useRef<HTMLSpanElement>(null);
  const item =
    "flex w-full items-center rounded-inner px-3 py-1.5 text-left text-body-sm hover:bg-action-soft focus-visible:bg-action-soft aria-disabled:pointer-events-none aria-disabled:opacity-50";
  return (
    <span ref={whole} className="inline-flex">
      {check ? (
        <Popover
          open={check.open}
          onOpenChange={(next) => (next ? onPublish() : check.onOpenChange(false))}
          title="What publishing does"
          titleHidden
          align="end"
          anchor={whole}
          wide
          trigger={
            <Button variant="primary" disabled={disabled} className="rounded-r-none">
              Publish
            </Button>
          }
        >
          {check.content}
        </Popover>
      ) : (
        <Button
          variant="primary"
          disabled={disabled}
          className="rounded-r-none"
          onClick={onPublish}
        >
          Publish
        </Button>
      )}
      <Popover
        open={open}
        onOpenChange={setOpen}
        title="More ways to publish"
        titleHidden
        align="end"
        anchor={whole}
        wide
        trigger={
          <Button
            variant="primary"
            aria-label="More ways to publish"
            className="rounded-l-none border-l border-action-ink/30 px-2"
          >
            <ChevronDown aria-hidden="true" size={14} />
          </Button>
        }
      >
        <div role="menu" aria-label="Publish" className="flex flex-col p-1">
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            className={item}
            onClick={() => {
              setOpen(false);
              onPublish();
            }}
          >
            Publish
          </button>
          {openHref ? (
            <a
              role="menuitem"
              href={openHref}
              target="_blank"
              rel="noreferrer"
              className={`${item} text-ink no-underline`}
              onClick={() => setOpen(false)}
            >
              Open the published app
            </a>
          ) : (
            <MenuItemOff tooltip="Publish once, and the app has an address.">
              Open the published app
            </MenuItemOff>
          )}
          {restore ? (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                setOpen(false);
                restore();
              }}
            >
              Restore an earlier draft
            </button>
          ) : (
            <MenuItemOff tooltip="Nothing to restore here">Restore an earlier draft</MenuItemOff>
          )}
        </div>
      </Popover>
    </span>
  );
}

/** A menu item that is off, and says why when it is pointed at or focused. */
function MenuItemOff({ tooltip, children }: { tooltip: string; children: ReactNode }) {
  return (
    <Tooltip label={tooltip} side="left">
      <button
        type="button"
        role="menuitem"
        aria-disabled="true"
        className="flex w-full items-center rounded-inner px-3 py-1.5 text-left text-body-sm opacity-50"
        onClick={(event) => event.preventDefault()}
      >
        {children}
      </button>
    </Tooltip>
  );
}
