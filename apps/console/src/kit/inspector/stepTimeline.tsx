/**
 * The steps of an action as a numbered vertical timeline (board 4): each step a card with its icon
 * on a rail. A card collapses to one line ("2 · Update this invoice: Status…", board 17) and opens
 * in place. Cards are put in order by dragging the handle, or with Alt and the up or down arrow
 * on the handle or the card (the arrow alone on the handle); each move is said to screen readers.
 * The "Ask to confirm" card is always first and stays where it is.
 */
import { ChevronDown, ChevronRight, GripVertical, X } from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";

export interface TimelineItem {
  key: string;
  /** What it is called: "Update the record". */
  title: string;
  /** One line for when the card is collapsed: "Update this invoice: Status". */
  summary: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
  /** The card's inside, drawn only while it is open. */
  body: ReactNode;
  /** Whether it may be put in another place. The confirmation may not. */
  fixed?: boolean;
  onRemove: () => void;
}

const focus = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

export function StepTimeline({
  items,
  onReorder,
  label,
  startCollapsed = false,
}: {
  items: readonly TimelineItem[];
  /** The keys of the movable cards in their new order. */
  onReorder: (keys: string[]) => void;
  label: string;
  /** Cards that are there at first are drawn as one line. */
  startCollapsed?: boolean;
}) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(
    () => new Set(startCollapsed ? items.map((item) => item.key) : []),
  );
  const [said, setSaid] = useState("");
  const [drag, setDrag] = useState<{ key: string; order: string[] } | undefined>();
  const cards = useRef(new Map<string, HTMLElement>());
  const refocus = useRef<string | undefined>(undefined);

  const movable = items.filter((item) => !item.fixed).map((item) => item.key);
  const byKey = new Map(items.map((item) => [item.key, item]));
  // While dragging, the movable cards are drawn in the order the pointer has made.
  const fixedFirst = items.filter((item) => item.fixed);
  const shown = [
    ...fixedFirst,
    ...(drag?.order ?? movable).flatMap((key) => {
      const item = byKey.get(key);
      return item ? [item] : [];
    }),
  ];
  const numberOf = (key: string) => items.findIndex((item) => item.key === key) + 1;

  const toggle = (key: string) =>
    setClosed((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const nudge = (event: KeyboardEvent, key: string, plain: boolean) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (!event.altKey && !plain) return;
    event.preventDefault();
    const from = movable.indexOf(key);
    if (from < 0) return;
    const to = Math.min(movable.length - 1, Math.max(0, from + (event.key === "ArrowUp" ? -1 : 1)));
    if (to === from) return;
    const next = [...movable];
    next.splice(from, 1);
    next.splice(to, 0, key);
    refocus.current = key;
    setSaid(
      `Moved ${byKey.get(key)?.title ?? "the step"} to position ${to + 1} of ${movable.length}`,
    );
    onReorder(next);
  };

  const start = (event: PointerEvent<HTMLButtonElement>, key: string) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ key, order: movable });
  };
  const over = (event: PointerEvent) => {
    if (!drag) return;
    const others = drag.order.filter((key) => key !== drag.key);
    let to = 0;
    for (const key of others) {
      const box = cards.current.get(key)?.getBoundingClientRect();
      if (box && event.clientY > box.top + box.height / 2) to += 1;
    }
    const next = [...others];
    next.splice(to, 0, drag.key);
    if (next.join() !== drag.order.join()) setDrag({ key: drag.key, order: next });
  };
  const end = () => {
    if (!drag) return;
    const next = drag.order;
    setDrag(undefined);
    if (next.join() !== movable.join()) {
      setSaid(
        `Moved ${byKey.get(drag.key)?.title ?? "the step"} to position ${next.indexOf(drag.key) + 1} of ${next.length}`,
      );
      onReorder(next);
    }
  };

  return (
    <>
      <ol aria-label={label} className="m-0 flex list-none flex-col p-0">
        {shown.map((item, at) => {
          const n = numberOf(item.key);
          const open = !closed.has(item.key);
          const Icon = item.icon;
          const dragging = drag?.key === item.key;
          return (
            <li
              key={item.key}
              ref={(node) => {
                if (node) {
                  cards.current.set(item.key, node);
                  if (refocus.current === item.key) {
                    refocus.current = undefined;
                    node.querySelector<HTMLElement>("[data-handle]")?.focus();
                  }
                } else cards.current.delete(item.key);
              }}
              onKeyDown={(event) => {
                if (!item.fixed && !(event.target as HTMLElement).closest("[data-handle]")) {
                  nudge(event, item.key, false);
                }
              }}
              className="relative flex gap-3"
            >
              <div className="flex w-7 shrink-0 flex-col items-center">
                <span className="grid size-7 shrink-0 place-items-center rounded-control border border-line-strong bg-sunken text-action">
                  <Icon aria-hidden size={14} />
                </span>
                {at < shown.length - 1 ? (
                  <span aria-hidden="true" className="w-px flex-1 bg-line" />
                ) : null}
              </div>
              {/* panel-allowed: a step is a card on the rail, a box by design */}
              <div
                className={`mb-2 min-w-0 flex-1 rounded-panel border border-line bg-surface ${
                  dragging ? "bg-raised shadow-drag" : ""
                }`}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} step ${n}: ${item.title}`}
                    onClick={() => toggle(item.key)}
                    className={`flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-panel px-3 text-left text-body-sm ${focus}`}
                  >
                    {open ? (
                      <ChevronDown
                        aria-hidden="true"
                        size={14}
                        className="shrink-0 text-ink-muted"
                      />
                    ) : (
                      <ChevronRight
                        aria-hidden="true"
                        size={14}
                        className="shrink-0 text-ink-muted"
                      />
                    )}
                    <span className="sr-only">Step {n}: </span>
                    {open ? (
                      <span className="min-w-0 truncate">
                        <span aria-hidden="true" className="mr-2 text-ink-muted">
                          {n}
                        </span>
                        <span className="font-semibold text-ink">{item.title}</span>
                      </span>
                    ) : (
                      <span className="min-w-0 truncate text-ink">
                        <span aria-hidden="true" className="text-ink-muted">
                          {n} ·{" "}
                        </span>
                        {item.summary}
                      </span>
                    )}
                  </button>
                  {item.fixed ? null : (
                    <button
                      type="button"
                      data-handle=""
                      aria-label={`Reorder step ${n}. Alt and the up or down arrow move it.`}
                      onPointerDown={(event) => start(event, item.key)}
                      onPointerMove={over}
                      onPointerUp={end}
                      onPointerCancel={end}
                      onKeyDown={(event) => nudge(event, item.key, true)}
                      className={`grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-inner text-ink-subtle hover:text-ink ${focus}`}
                    >
                      <GripVertical aria-hidden="true" size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove step ${n}`}
                    onClick={item.onRemove}
                    className={`mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-inner text-ink-muted hover:text-ink ${focus}`}
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                </div>
                {open ? <div className="flex flex-col gap-2 px-3 pb-3">{item.body}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div role="status" aria-live="polite" className="sr-only">
        {said}
      </div>
    </>
  );
}
