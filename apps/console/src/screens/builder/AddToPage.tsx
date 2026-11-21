import { Button, Dialog, Kbd, TextField } from "@volvel/ui";
import {
  CATEGORIES,
  CATEGORY_TITLES,
  type Surface,
  type WidgetDefinition,
  WidgetRegistry,
} from "@volvel/widgets";
import {
  ChartColumn,
  ClipboardList,
  Grid3x3,
  Hash,
  List,
  type LucideIcon,
  MousePointerClick,
  PanelRight,
  Puzzle,
  Table,
  Type,
} from "lucide-react";
import { useState } from "react";
import { heading } from "../../kit/inspector/model.ts";
import { offeredOn } from "./registry.ts";

/** The icons the platform's widgets name. A pack's own name is drawn as a puzzle piece. */
const ICONS: Record<string, LucideIcon> = {
  table: Table,
  list: List,
  hash: Hash,
  chart: ChartColumn,
  grid: Grid3x3,
  text: Type,
  detail: PanelRight,
  form: ClipboardList,
  button: MousePointerClick,
};

export const widgetIcon = (name: string): LucideIcon => ICONS[name] ?? Puzzle;

/** How far a pointer travels from a widget in the list before it is carried, in pixels: as far as a drag on the page. */
const CARRY_FROM = 4;

/**
 * "Add to page": what can be put on the page, by what it is for. A click adds
 * a widget at the end of the page; dragging one out of the list carries it
 * onto the page, where it lands where it is let go (the dialog closes as it is
 * picked up). The keyboard's way is the click, then the arrows. It lists what
 * is registered for this kind of page, so a pack's widget is here the day the
 * pack is.
 */
export function AddToPage({
  open,
  onClose,
  surface,
  onAdd,
  onCarry,
  suggestions,
}: {
  open: boolean;
  onClose: () => void;
  surface: Surface;
  onAdd: (definition: WidgetDefinition) => void;
  /** A widget was dragged out of the list: carry it onto the page from where the pointer is. */
  onCarry?: (definition: WidgetDefinition, from: { x: number; y: number }) => void;
  /** "This page shows Invoices. Common next steps: …": what is worth adding to what the page shows. */
  suggestions?: {
    table: string;
    items: readonly { key: string; label: string }[];
    onPick: (key: string) => void;
  };
}) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const matches = (definition: WidgetDefinition) =>
    needle === "" ||
    [
      definition.title,
      definition.description,
      CATEGORY_TITLES[definition.category],
      WidgetRegistry.packOf(definition.type),
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  const found = offeredOn(surface).filter(matches);
  const add = (definition: WidgetDefinition) => {
    onAdd(definition);
    setSearch("");
  };
  /** A press on a widget in the list that travels is a carry, not a click. A finger scrolls the list instead. */
  const pickUp = (event: React.PointerEvent<HTMLButtonElement>, definition: WidgetDefinition) => {
    if (!onCarry || event.button !== 0 || event.pointerType === "touch") return;
    const from = { x: event.clientX, y: event.clientY };
    const follow = (moving: PointerEvent) => {
      if (Math.hypot(moving.clientX - from.x, moving.clientY - from.y) < CARRY_FROM) return;
      stop();
      setSearch("");
      onCarry(definition, { x: moving.clientX, y: moving.clientY });
    };
    const stop = () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  return (
    <Dialog
      open={open}
      onClose={() => {
        setSearch("");
        onClose();
      }}
      title="Add to page"
      size="palette"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              const first = found[0];
              if (first) add(first);
            }}
          >
            <TextField
              name="add-to-page-search"
              label="Find something to add"
              labelHidden
              required={false}
              value={search}
              onChange={setSearch}
            />
          </form>
          <Kbd>esc</Kbd>
        </div>
        {suggestions && suggestions.items.length > 0 && needle === "" ? (
          <section aria-label="Next steps" className="flex flex-col gap-2">
            <p className="m-0 text-body-sm text-ink-muted">
              This page shows <strong className="font-medium text-ink">{suggestions.table}</strong>.
              Common next steps:
            </p>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {suggestions.items.map((item) => (
                <li key={item.key}>
                  <Button size="small" onClick={() => suggestions.onPick(item.key)}>
                    {item.label}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {found.length === 0 ? (
          <p className="m-0 text-ink-muted">
            Nothing here is called that. Try a word for what it shows, such as “chart” or “records”.
          </p>
        ) : (
          CATEGORIES.map((category) => {
            const here = found.filter((definition) => definition.category === category);
            if (here.length === 0) return null;
            return (
              <section
                key={category}
                aria-label={CATEGORY_TITLES[category]}
                className="flex flex-col gap-1"
              >
                <h3 className="m-0 text-label text-ink-subtle uppercase">
                  {CATEGORY_TITLES[category]}
                </h3>
                <ul className="m-0 flex list-none flex-col p-0">
                  {here.map((definition) => {
                    const Icon = widgetIcon(definition.icon);
                    const pack = WidgetRegistry.packOf(definition.type);
                    return (
                      <li key={definition.type}>
                        <button
                          type="button"
                          onClick={() => add(definition)}
                          onPointerDown={(event) => pickUp(event, definition)}
                          draggable={false}
                          className={`flex w-full items-center gap-3 rounded-control px-2 py-2 text-left select-none hover:bg-action-soft ${
                            onCarry ? "cursor-grab active:cursor-grabbing" : ""
                          }`}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-control border border-line text-ink-muted">
                            <Icon aria-hidden="true" size={16} />
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="font-medium text-ink">
                              {definition.title}
                              {pack === "core" ? null : (
                                <span className="ml-2 text-meta font-normal text-ink-muted">
                                  {heading(pack)} pack
                                </span>
                              )}
                            </span>
                            <span className="text-body-sm text-ink-muted">
                              {definition.description}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
        <p className="m-0 text-body-sm text-ink-muted">
          {onCarry
            ? "Click to place at the end of the page, or drag it onto the page where you want it."
            : "Click to place at the end of the page, then drag it where you want it."}
        </p>
      </div>
    </Dialog>
  );
}
