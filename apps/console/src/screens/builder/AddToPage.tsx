import { Dialog, Kbd, TextField } from "@volvel/ui";
import {
  CATEGORIES,
  CATEGORY_TITLES,
  type Surface,
  type WidgetDefinition,
  WidgetRegistry,
} from "@volvel/widgets";
import {
  ChartColumn,
  Grid3x3,
  Hash,
  List,
  type LucideIcon,
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
};

export const widgetIcon = (name: string): LucideIcon => ICONS[name] ?? Puzzle;

/**
 * "Add to page": what can be put on the page, by what it is for. A widget is
 * added at the end of the page; to put it somewhere else, drag it there once it is on the page. It
 * lists what is registered for this kind of page, so a pack's widget is here
 * the day the pack is.
 */
export function AddToPage({
  open,
  onClose,
  surface,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  surface: Surface;
  onAdd: (definition: WidgetDefinition) => void;
}) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const matches = (definition: WidgetDefinition) =>
    needle === "" ||
    [definition.title, definition.description, CATEGORY_TITLES[definition.category], WidgetRegistry.packOf(definition.type)]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  const found = offeredOn(surface).filter(matches);
  const add = (definition: WidgetDefinition) => {
    onAdd(definition);
    setSearch("");
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
          <div className="min-w-0 flex-1" onKeyDown={(event) => {
            const first = found[0];
            if (event.key === "Enter" && first) {
              event.preventDefault();
              add(first);
            }
          }}>
            <TextField
              name="add-to-page-search"
              label="Find something to add"
              labelHidden
              required={false}
              value={search}
              onChange={setSearch}
            />
          </div>
          <Kbd>esc</Kbd>
        </div>
        {found.length === 0 ? (
          <p className="m-0 text-ink-muted">
            Nothing here is called that. Try a word for what it shows, such as “chart” or “records”.
          </p>
        ) : (
          CATEGORIES.map((category) => {
            const here = found.filter((definition) => definition.category === category);
            if (here.length === 0) return null;
            return (
              <section key={category} aria-label={CATEGORY_TITLES[category]} className="flex flex-col gap-1">
                <h3 className="m-0 text-label text-ink-subtle uppercase">{CATEGORY_TITLES[category]}</h3>
                <ul className="m-0 flex list-none flex-col p-0">
                  {here.map((definition) => {
                    const Icon = widgetIcon(definition.icon);
                    const pack = WidgetRegistry.packOf(definition.type);
                    return (
                      <li key={definition.type}>
                        <button
                          type="button"
                          onClick={() => add(definition)}
                          className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-action-soft"
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
                            <span className="text-body-sm text-ink-muted">{definition.description}</span>
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
          Click to place at the end of the page, then drag it where you want it.
        </p>
      </div>
    </Dialog>
  );
}
