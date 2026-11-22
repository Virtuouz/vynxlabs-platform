import { childrenOf, type PageWidget, tabsOf, topLevel } from "@volvel/manifest";
import { isContainer } from "@volvel/manifest/parts";
import { useFlip } from "@volvel/ui";
import { GripVertical } from "lucide-react";
import { type DragEvent, type KeyboardEvent, useState } from "react";
import { nameOf, registryRoles } from "./containers.ts";
import { reading, reordered, siblingsOf, stepped } from "./outline.ts";
import { definitionOf } from "./registry.ts";
import { outlineIcon } from "./widgetIcons.ts";

/**
 * "On this page" (board 1): each widget a row with a drag handle and its type's icon, a container's
 * widgets nested under it (by tab for Tabs). A row is dragged in the list to reorder it among the
 * widgets on its own grid, and Alt+↑ and Alt+↓ do the same from the keyboard; both change the
 * widgets' places exactly as moving them on the page does.
 */
export function Outline({
  widgets,
  selected,
  onSelect,
  onReorder,
  onSaid,
  readOnly = false,
}: {
  widgets: readonly PageWidget[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  /** The widgets as they are once one is moved, with words for Undo. */
  onReorder: (next: PageWidget[], label: string) => void;
  /** What happened, for a screen reader. */
  onSaid: (words: string) => void;
  /** Rows are chosen, never moved. */
  readOnly?: boolean;
}) {
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<{ id: string; side: "before" | "after" }>();
  // What is moved is seen to move: the widgets in the order they are in now.
  const flip = useFlip<HTMLUListElement>(
    widgets.map((one) => `${one.id}@${one.at.y},${one.at.x}`).join("|"),
  );
  const by = (id: string) => widgets.find((one) => one.id === id);

  const move = (id: string, next: PageWidget[] | undefined, label: string) => {
    if (!next) return false;
    onReorder(next, label);
    const group = siblingsOf(next, id);
    const at = group.findIndex((one) => one.id === id);
    onSaid(`${nameOf(by(id) as PageWidget)} is now ${at + 1} of ${group.length}.`);
    return true;
  };
  const keys = (event: KeyboardEvent, one: PageWidget) => {
    if (readOnly || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const by1 = event.key === "ArrowUp" ? -1 : 1;
    move(one.id, stepped(widgets, one.id, by1), `moving ${nameOf(one)}`);
  };
  const drop = (event: DragEvent, one: PageWidget) => {
    event.preventDefault();
    if (!readOnly && dragging && over)
      move(
        dragging,
        reordered(widgets, dragging, one.id, over.side),
        `moving ${nameOf(by(dragging) as PageWidget)}`,
      );
    setDragging(undefined);
    setOver(undefined);
  };
  const hover = (event: DragEvent, one: PageWidget) => {
    const from = dragging ? by(dragging) : undefined;
    // Only among the widgets on its own grid: the page's, or one tab of one container.
    if (
      !from ||
      from.id === one.id ||
      from.in?.widget !== one.in?.widget ||
      from.in?.tab !== one.in?.tab
    )
      return;
    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const side = event.clientY < box.top + box.height / 2 ? "before" : "after";
    if (over?.id !== one.id || over.side !== side) setOver({ id: one.id, side });
  };

  const row = (one: PageWidget, inside: boolean) => {
    const Icon = outlineIcon(definitionOf(one.type)?.icon);
    const here = one.id === selected;
    const line = over?.id === one.id ? over.side : undefined;
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: the row is a drop target; its button is what is operated
      <div
        draggable={!readOnly}
        data-outline-row={one.id}
        data-nested={inside ? "" : undefined}
        onDragStart={(event) => {
          setDragging(one.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", one.id);
        }}
        onDragEnd={() => {
          setDragging(undefined);
          setOver(undefined);
        }}
        onDragOver={(event) => hover(event, one)}
        onDrop={(event) => drop(event, one)}
        className={`group relative flex items-center rounded-inner ${
          dragging === one.id ? "opacity-50" : ""
        } ${here ? "bg-selected text-action" : "text-ink hover:bg-sunken"}`}
      >
        {line ? (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-1 h-0.5 rounded bg-action ${
              line === "before" ? "-top-px" : "-bottom-px"
            }`}
          />
        ) : null}
        <button
          type="button"
          aria-current={here ? "true" : undefined}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          onClick={() => onSelect(one.id)}
          onKeyDown={(event) => keys(event, one)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-inner py-1 pr-2 text-left text-body-sm ${
            inside ? "pl-4" : "pl-1"
          }`}
        >
          {readOnly ? null : (
            <GripVertical
              aria-hidden="true"
              size={14}
              className="shrink-0 cursor-grab text-ink-subtle opacity-60 group-hover:opacity-100"
            />
          )}
          <Icon aria-hidden="true" size={14} className="shrink-0 text-ink-muted" />
          <span className="truncate">{nameOf(one)}</span>
        </button>
      </div>
    );
  };

  return (
    <ul ref={flip} className="m-0 flex list-none flex-col gap-0.5 p-0">
      {reading(topLevel(widgets as PageWidget[])).map((one) => (
        <li key={one.id} data-flip-key={one.id}>
          {row(one, false)}
          {isContainer(one, registryRoles) ? (
            <Held container={one} widgets={widgets} row={row} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** What a container holds, under it: by tab for Tabs, each tab with its name over it. */
function Held({
  container,
  widgets,
  row,
}: {
  container: PageWidget;
  widgets: readonly PageWidget[];
  row: (widget: PageWidget, inside: boolean) => React.ReactNode;
}) {
  const tabs = tabsOf(container);
  const held = childrenOf(widgets as PageWidget[], container.id);
  if (held.length === 0) return null;
  const groups =
    tabs.length > 0
      ? [
          ...tabs.map((tab) => ({
            key: tab.id,
            title: tab.title as string | undefined,
            items: reading(held.filter((one) => one.in?.tab === tab.id)),
          })),
          {
            key: "",
            title: undefined,
            items: reading(held.filter((one) => !tabs.some((tab) => tab.id === one.in?.tab))),
          },
        ]
      : [{ key: "", title: undefined, items: reading(held) }];
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <li key={group.key}>
            {group.title ? (
              <span className="block truncate py-1 pl-8 text-meta text-ink-subtle">
                {group.title}
              </span>
            ) : null}
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {group.items.map((one) => (
                <li key={one.id} data-flip-key={one.id}>
                  {row(one, true)}
                </li>
              ))}
            </ul>
          </li>
        ))}
    </ul>
  );
}
