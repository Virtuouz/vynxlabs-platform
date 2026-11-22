import { ChevronRight, Eye, EyeOff, GripVertical } from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

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

const moved = (ids: readonly string[], from: number, to: number) => {
  const next = [...ids];
  const [one] = next.splice(from, 1);
  if (one !== undefined) next.splice(to, 0, one);
  return next;
};

/**
 * Rows with a drag handle, an optional eye, a value and a chevron. Reorder by dragging the
 * handle, or with the keyboard: Alt+Up and Alt+Down on a row or its handle (Up and Down alone
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
  const [said, setSaid] = useState("");
  const [drag, setDrag] = useState<{ id: string; order: string[] } | undefined>();
  const rows = useRef(new Map<string, HTMLElement>());
  const refocus = useRef<{ id: string; part: string } | undefined>(undefined);
  const byId = new Map(items.map((item) => [item.id, item]));
  const order = drag?.order ?? items.map((item) => item.id);

  // A reorder may remake the row's element: put the focus back where it was.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after every reorder
  useEffect(() => {
    const again = refocus.current;
    if (!again) return;
    refocus.current = undefined;
    rows.current.get(again.id)?.querySelector<HTMLElement>(`[data-${again.part}]`)?.focus();
  }, [items]);

  const keyboardMove = (event: KeyboardEvent, id: string, plain: boolean) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (!event.altKey && !plain) return;
    event.preventDefault();
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(id);
    const to = Math.min(ids.length - 1, Math.max(0, from + (event.key === "ArrowUp" ? -1 : 1)));
    if (to === from) return;
    refocus.current = {
      id,
      part: (event.target as HTMLElement).closest("[data-handle]") ? "handle" : "main",
    };
    setSaid(`Moved ${byId.get(id)?.label ?? ""} to position ${to + 1} of ${ids.length}`);
    onReorder(moved(ids, from, to));
  };

  const start = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id, order: items.map((item) => item.id) });
  };
  const over = (event: PointerEvent) => {
    if (!drag) return;
    // Where the pointer is among the other rows' middles decides the place.
    const others = drag.order.filter((id) => id !== drag.id);
    let to = 0;
    for (const id of others) {
      const box = rows.current.get(id)?.getBoundingClientRect();
      if (box && event.clientY > box.top + box.height / 2) to += 1;
    }
    const next = [...others];
    next.splice(to, 0, drag.id);
    if (next.join() !== drag.order.join()) setDrag({ id: drag.id, order: next });
  };
  const end = () => {
    if (!drag) return;
    const next = drag.order;
    setDrag(undefined);
    if (next.join() !== items.map((item) => item.id).join()) {
      setSaid(
        `Moved ${byId.get(drag.id)?.label ?? ""} to position ${next.indexOf(drag.id) + 1} of ${next.length}`,
      );
      onReorder(next);
    }
  };

  return (
    <>
      <ul aria-label={label} className="m-0 list-none divide-y divide-line p-0">
        {order.map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          const active = id === activeId;
          const dragging = drag?.id === id;
          return (
            <li
              key={id}
              ref={(node) => {
                if (node) rows.current.set(id, node);
                else rows.current.delete(id);
              }}
              data-active={active ? "" : undefined}
              onKeyDown={(event) => {
                if (!(event.target as HTMLElement).closest("[data-handle]")) {
                  keyboardMove(event, id, false);
                }
              }}
              className={`relative flex min-h-10 items-center before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-action before:opacity-0 data-[active]:bg-selected data-[active]:before:opacity-100 ${
                dragging ? "bg-raised shadow-drag" : ""
              }`}
            >
              <button
                type="button"
                data-handle=""
                aria-label={`Reorder ${item.label}. Alt and the up or down arrow move it.`}
                onPointerDown={(event) => start(event, id)}
                onPointerMove={over}
                onPointerUp={end}
                onPointerCancel={end}
                onKeyDown={(event) => keyboardMove(event, id, true)}
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
        {said}
      </div>
    </>
  );
}
