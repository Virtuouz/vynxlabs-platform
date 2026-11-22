import { ChevronRight, Eye, EyeOff, GripVertical } from "lucide-react";
import type { ComponentType, ReactNode, RefObject } from "react";
import { LIFTED, useSortable } from "./useSortable.ts";

export interface SortableItem {
  id: string;
  label: string;
  /** Under the label: "from Client code". */
  sub?: string;
  /** On the right: "Text", "$123.45". */
  value?: ReactNode;
  /** With an eye toggle: hidden. */
  hidden?: boolean;
  /** Before the label: the kind of thing the row is. */
  icon?: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" }>;
}

const focus = "outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-focus";

/**
 * Rows with a drag handle, an optional eye, a value and a chevron. Reorder by dragging the
 * handle (see `useSortable`: the row follows the pointer, the others slide, it settles into
 * place), or with the keyboard: Alt+Up and Alt+Down on a row or its handle (Up and Down alone
 * on the handle). Each move is said to screen readers.
 */
export function SortableRows({
  items,
  onReorder,
  onOpen,
  onToggleHidden,
  activeId,
  label,
}: {
  items: readonly SortableItem[];
  /** The ids in their new order. */
  onReorder: (ids: string[]) => void;
  /** A click on a row opens it (a column's editor). */
  onOpen?: (id: string) => void;
  /** Shows the eye on each row. */
  onToggleHidden?: (id: string, hidden: boolean) => void;
  activeId?: string | undefined;
  /** Names the list. */
  label: string;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const sort = useSortable({
    ids: items.map((item) => item.id),
    onReorder: (ids) => onReorder(ids),
    nameOf: (id) => byId.get(id)?.label ?? "",
  });

  return (
    <>
      <ul
        ref={sort.list as RefObject<HTMLUListElement>}
        aria-label={label}
        className="m-0 list-none divide-y divide-line p-0"
      >
        {items.map((item) => {
          const id = item.id;
          const active = id === activeId;
          return (
            <li
              key={id}
              {...sort.row(id)}
              data-active={active ? "" : undefined}
              onKeyDown={(event) => sort.rowKeyDown(event, id)}
              className={`relative flex min-h-10 items-center before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-action before:opacity-0 data-[active]:bg-selected data-[active]:before:opacity-100 ${LIFTED}`}
            >
              <button
                type="button"
                {...sort.handle(id)}
                aria-label={`Reorder ${item.label}. Alt and the up or down arrow move it.`}
                className={`grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center text-ink-subtle hover:text-ink ${focus}`}
              >
                <GripVertical aria-hidden="true" size={14} />
              </button>
              {onToggleHidden ? (
                <button
                  type="button"
                  aria-pressed={!item.hidden}
                  aria-label={`${item.hidden ? "Show" : "Hide"} ${item.label}`}
                  onClick={() => onToggleHidden(id, !item.hidden)}
                  className={`grid h-10 w-7 shrink-0 cursor-pointer place-items-center text-ink-muted hover:text-ink ${focus}`}
                >
                  {item.hidden ? (
                    <EyeOff aria-hidden="true" size={14} />
                  ) : (
                    <Eye aria-hidden="true" size={14} />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                data-main=""
                onClick={onOpen ? () => onOpen(id) : undefined}
                disabled={!onOpen}
                className={`flex min-h-10 min-w-0 flex-1 items-center gap-3 py-1.5 pr-3 pl-1 text-left text-body-sm disabled:cursor-default ${
                  onOpen ? "cursor-pointer hover:bg-selected" : ""
                } ${item.hidden ? "text-ink-muted" : "text-ink"} ${focus}`}
              >
                {item.icon ? (
                  <item.icon aria-hidden size={14} className="shrink-0 text-ink-muted" />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.sub ? (
                    <span className="block truncate text-meta text-ink-muted">{item.sub}</span>
                  ) : null}
                </span>
                {item.value !== undefined ? (
                  <span className="shrink-0 text-meta text-ink-muted">{item.value}</span>
                ) : null}
                {onOpen ? (
                  <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-ink-muted" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div role="status" aria-live="polite" className="sr-only">
        {sort.said}
      </div>
    </>
  );
}
