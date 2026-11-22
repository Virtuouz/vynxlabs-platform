/**
 * The steps of an action as a numbered vertical timeline (board 4): each step a card with its icon
 * on a rail. A card collapses to one line ("2 · Update this invoice: Status…", board 17) and opens
 * in place. Cards are put in order by dragging the handle, or with Alt and the up or down arrow
 * on the handle or the card (the arrow alone on the handle); each move is said to screen readers.
 * The "Ask to confirm" card is always first and stays where it is.
 */

import { useSortable } from "@volvel/ui";
import { ChevronDown, ChevronRight, GripVertical, X } from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";

export interface TimelineItem {
  key: string;
  /** What it is called: "Update the record". */
  title: string;
  /** One line for when the card is collapsed: "Update this invoice: Status". */
  summary: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
  /** The card's inside, drawn only while it is open. */
  body: ReactNode;
  /**
   * The step written as one sentence, drawn under its name whether the card is open or not
   * ("Set [Clinic] to the clicked [clinic]"): chips that open small editors, or plain words.
   * Left out, the card is one line when closed and the form when open.
   */
  sentence?: ReactNode;
  /** With a sentence: the card opens on a click to show `body`, for what the chips do not reach. */
  more?: boolean;
  /** Whether it may be put in another place. The confirmation may not. */
  fixed?: boolean;
  onRemove: () => void;
}

const focus = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

export function StepTimeline({
  items,
  onReorder,
  label,
  startCollapsed = true,
}: {
  items: readonly TimelineItem[];
  /** The keys of the movable cards in their new order. */
  onReorder: (keys: string[]) => void;
  label: string;
  /** Cards that are there at first are drawn closed; a card added later opens by itself. */
  startCollapsed?: boolean;
}) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(
    () => new Set(startCollapsed ? items.map((item) => item.key) : []),
  );
  const byKey = new Map(items.map((item) => [item.key, item]));
  const movable = items.filter((item) => !item.fixed).map((item) => item.key);
  const sort = useSortable<HTMLOListElement>({
    ids: movable,
    onReorder: (keys) => onReorder(keys),
    nameOf: (key) => byKey.get(key)?.title ?? "the step",
    focus: "[data-handle]",
  });
  const shown = items;
  const numberOf = (key: string) => items.findIndex((item) => item.key === key) + 1;

  const toggle = (key: string) =>
    setClosed((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <>
      <ol ref={sort.list} aria-label={label} className="m-0 flex list-none flex-col p-0">
        {shown.map((item, at) => {
          const n = numberOf(item.key);
          const open = !closed.has(item.key);
          const Icon = item.icon;
          return (
            <li
              key={item.key}
              {...(item.fixed ? {} : sort.row(item.key))}
              onKeyDown={(event) => {
                if (!item.fixed) sort.rowKeyDown(event, item.key);
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
              <div className="group mb-2 min-w-0 flex-1 rounded-panel border border-line bg-surface in-data-[dragging]:bg-raised in-data-[dragging]:shadow-drag">
                <div className="flex items-center gap-1">
                  {item.sentence !== undefined ? (
                    <button
                      type="button"
                      aria-expanded={item.more ? open : undefined}
                      aria-label={`Step ${n}: ${item.title}${item.more ? (open ? ", close it" : ", open it") : ""}`}
                      disabled={!item.more}
                      onClick={() => toggle(item.key)}
                      className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-panel px-3 text-left text-body-sm disabled:cursor-default ${item.more ? "cursor-pointer" : ""} ${focus}`}
                    >
                      <span aria-hidden="true" className="text-ink-muted">
                        {n}
                      </span>
                      <span className="min-w-0 truncate font-semibold text-ink">{item.title}</span>
                    </button>
                  ) : (
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
                  )}
                  {item.fixed ? null : (
                    <button
                      type="button"
                      {...sort.handle(item.key)}
                      aria-label={`Reorder step ${n}. Alt and the up or down arrow move it.`}
                      className={`grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-inner text-ink-subtle hover:text-ink ${focus}`}
                    >
                      <GripVertical aria-hidden="true" size={14} />
                    </button>
                  )}
                  {/* Remove is not always drawn: it shows while the card is pointed at or has focus. */}
                  <button
                    type="button"
                    aria-label={`Remove step ${n}`}
                    onClick={item.onRemove}
                    className={`mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-inner text-ink-muted opacity-0 hover:text-ink focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${focus}`}
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                </div>
                {item.sentence !== undefined ? (
                  <div className="px-3 pb-3 text-body-sm text-ink">{item.sentence}</div>
                ) : null}
                {open && (item.sentence === undefined || item.more) ? (
                  <div className="flex flex-col gap-2 px-3 pb-3">{item.body}</div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div role="status" aria-live="polite" className="sr-only">
        {sort.said}
      </div>
    </>
  );
}
