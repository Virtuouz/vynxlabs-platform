import { childrenOf, type PageWidget, tabsOf, topLevel } from "@volvel/manifest";
import { isContainer } from "@volvel/manifest/parts";
import { LIFTED, useSortable } from "@volvel/ui";
import { GripVertical, Link2 } from "lucide-react";
import type { ComponentProps, CSSProperties, KeyboardEvent, ReactNode } from "react";
import { nameOf, registryRoles } from "./containers.ts";
import { reading, reordered, siblingsOf, stepped } from "./outline.ts";
import { definitionOf } from "./registry.ts";
import { outlineIcon } from "./widgetIcons.ts";

/**
 * "On this page" (board 1): each widget a row with a drag handle and its type's icon, a container's
 * widgets nested under it (by tab for Tabs). A row is dragged by its handle to reorder it among the
 * widgets on its own grid (it follows the pointer and the others slide: `useSortable`), and Alt+↑ and Alt+↓ do the same from the keyboard; both change the
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
  /** A drag let go: `ids` are one grid's widgets in their new order, and `id` is the one that moved. */
  const dropped = (ids: string[], id: string) => {
    const at = ids.indexOf(id);
    const next =
      at > 0
        ? reordered(widgets, id, ids[at - 1] as string, "after")
        : reordered(widgets, id, ids[1] as string, "before");
    move(id, next, `moving ${nameOf(by(id) as PageWidget)}`);
  };

  const row = (one: PageWidget, inside: boolean, grip: Grip) => {
    const Icon = outlineIcon(definitionOf(one.type)?.icon);
    const here = one.id === selected;
    return (
      <div
        data-outline-row={one.id}
        data-nested={inside ? "" : undefined}
        className={`group relative flex items-center rounded-inner ${
          here ? "bg-selected text-action" : "text-ink hover:bg-sunken"
        }`}
      >
        {readOnly ? null : (
          <button
            type="button"
            {...grip}
            // For the pointer: the row beside it is the keyboard's, and moves with Alt and the arrows.
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => onSelect(one.id)}
            className={`grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded-inner text-ink-subtle opacity-60 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus ${
              inside ? "ml-3" : "ml-0.5"
            }`}
          >
            <GripVertical aria-hidden="true" size={14} />
          </button>
        )}
        <button
          type="button"
          aria-current={here ? "true" : undefined}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          onClick={() => onSelect(one.id)}
          onKeyDown={(event) => keys(event, one)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-inner py-1 pr-2 text-left text-body-sm ${
            readOnly ? (inside ? "pl-4" : "pl-1") : "pl-1"
          }`}
        >
          <Icon aria-hidden="true" size={14} className="shrink-0 text-ink-muted" />
          <span className="truncate">{nameOf(one)}</span>
        </button>
      </div>
    );
  };

  return (
    <SortableList
      items={reading(topLevel(widgets as PageWidget[]))}
      onDropped={dropped}
      readOnly={readOnly}
      render={(one, grip) => (
        <>
          {row(one, false, grip)}
          {isContainer(one, registryRoles) ? (
            <Held
              container={one}
              widgets={widgets}
              row={row}
              onDropped={dropped}
              readOnly={readOnly}
            />
          ) : null}
          {one.type === "core/actions" ? (
            <Buttons group={one} onSelect={() => onSelect(one.id)} />
          ) : null}
        </>
      )}
    />
  );
}

type Grip = Omit<ComponentProps<"button">, "ref" | "style"> & { style?: CSSProperties };

/**
 * The widgets of one grid, as a list whose rows are moved by their handles. Each is lifted and
 * follows the pointer, the others slide aside, and it settles where it is let go.
 */
function SortableList({
  items,
  onDropped,
  readOnly,
  render,
}: {
  items: readonly PageWidget[];
  onDropped: (ids: string[], id: string) => void;
  readOnly: boolean;
  render: (one: PageWidget, grip: Grip) => ReactNode;
}) {
  const sort = useSortable({
    ids: items.map((one) => one.id),
    onReorder: onDropped,
    nameOf: (id) => nameOf(items.find((one) => one.id === id) as PageWidget),
  });
  return (
    <ul ref={sort.list} className="m-0 flex list-none flex-col gap-0.5 p-0">
      {items.map((one) => (
        <li key={one.id} {...sort.row(one.id)} className={`rounded-inner ${LIFTED}`}>
          {render(one, readOnly ? {} : (sort.handle(one.id) as Grip))}
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
  onDropped,
  readOnly,
}: {
  container: PageWidget;
  widgets: readonly PageWidget[];
  row: (widget: PageWidget, inside: boolean, grip: Grip) => ReactNode;
  onDropped: (ids: string[], id: string) => void;
  readOnly: boolean;
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
            <SortableList
              items={group.items}
              onDropped={onDropped}
              readOnly={readOnly}
              render={(one, grip) => row(one, true, grip)}
            />
          </li>
        ))}
    </ul>
  );
}

/** The buttons an Action group holds, under it (board 4): choosing one chooses the group. */
function Buttons({ group, onSelect }: { group: PageWidget; onSelect: () => void }) {
  const buttons = Array.isArray(group.config?.actions)
    ? (group.config.actions as { id: string; label?: string }[])
    : [];
  if (buttons.length === 0) return null;
  return (
    <ul
      className="m-0 flex list-none flex-col gap-0.5 p-0"
      aria-label={`Buttons of ${nameOf(group)}`}
    >
      {buttons.map((one) => (
        <li key={one.id}>
          <button
            type="button"
            onClick={onSelect}
            className="flex w-full min-w-0 items-center gap-2 rounded-inner py-1 pr-2 pl-8 text-left text-body-sm text-ink hover:bg-sunken"
          >
            <Link2 aria-hidden="true" size={14} className="shrink-0 text-ink-muted" />
            <span className="truncate">{one.label || one.id}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
