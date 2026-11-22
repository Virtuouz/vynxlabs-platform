/**
 * Section's drawer (board 18, left): its heading (the widget's title and subtitle), what it
 * holds as a list (reordering lays them out again inside the section; a click selects that
 * widget on the page), and its look. A section holds widgets, not other sections.
 */
import { childrenOf, type PageWidget } from "@volvel/manifest";
import {
  DrawerBlock,
  SegmentedControl,
  type SortableItem,
  SortableRows,
  ToggleRow,
} from "@volvel/ui";
import { heading } from "../model.ts";
import { type Env, Group, LabelledBlock, reorderBy, setConfig } from "./recordShared.tsx";

/** "core/stat" is a "Stat". */
export const kindWords = (type: string): string => heading(type.split("/")[1] ?? type);

/**
 * The widgets of a container laid out again in a new order, each after the one before it, left
 * to right on the container's twelve columns, wrapping to a new row. They also take that order
 * among the page's widgets. Sizes are kept.
 */
export function relaidOut(
  widgets: readonly PageWidget[],
  container: string,
  ids: readonly string[],
  tab?: string,
): PageWidget[] {
  const held = childrenOf(widgets, container, tab);
  const ordered = reorderBy(held, ids);
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const placed = new Map<string, PageWidget>();
  for (const one of ordered) {
    const { w, h } = one.at;
    if (x + w > 12) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    placed.set(one.id, { ...one, at: { ...one.at, x, y } });
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  // The slots the held widgets had in the page's list are filled in the new order.
  const slots = ordered.map((one) => placed.get(one.id) as PageWidget);
  let next = 0;
  return widgets.map((one) => (placed.has(one.id) ? (slots[next++] as PageWidget) : one));
}

export function SectionDisplaySection({
  env,
  onSelectWidget,
}: {
  env: Env;
  /** Selects a widget on the page: a click on a row of "Holds". */
  onSelectWidget?: (id: string) => void;
}) {
  const held = childrenOf(env.widgets, env.widget.id);
  const items: SortableItem[] = held.map((one) => ({
    id: one.id,
    label: one.title || kindWords(one.type),
    sub: kindWords(one.type),
  }));
  return (
    <>
      <Group
        label="Holds"
        note="Drag widgets on the page into the section, or out of it. Sections hold widgets, not other sections."
      >
        {items.length > 0 ? (
          <SortableRows
            label="What the section holds"
            items={items}
            onReorder={(ids) =>
              env.writeAll(
                relaidOut(env.widgets, env.widget.id, ids),
                "reordering what the section holds",
              )
            }
            {...((onSelectWidget ?? env.select)
              ? { onOpen: (onSelectWidget ?? env.select) as (id: string) => void }
              : {})}
          />
        ) : (
          <DrawerBlock>
            <p className="m-0 text-body-sm text-ink-muted">Nothing in it yet.</p>
          </DrawerBlock>
        )}
      </Group>
      <Group label="Look">
        <LabelledBlock label="Style">
          <SegmentedControl<"plain" | "card">
            label="Style"
            value={env.config.look === "card" ? "card" : "plain"}
            options={[
              { value: "plain", label: "Plain" },
              { value: "card", label: "Card" },
            ]}
            onChange={(next) => setConfig(env, "look", next, "its style")}
          />
        </LabelledBlock>
        <ToggleRow
          label="Can be collapsed"
          checked={env.config.folds === true}
          onChange={(next) => setConfig(env, "folds", next ? true : undefined, "folding")}
        />
        {env.config.folds === true ? (
          <ToggleRow
            label="Starts folded"
            checked={env.config.folded === true}
            onChange={(next) =>
              setConfig(env, "folded", next ? true : undefined, "starting folded")
            }
          />
        ) : null}
      </Group>
    </>
  );
}
