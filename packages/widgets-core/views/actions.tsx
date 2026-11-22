import { Button, Menu } from "@volvel/ui";
import { Ellipsis, LoaderCircle } from "@volvel/ui/icons";
import type { WidgetViewProps } from "@volvel/widgets";
import { useLayoutEffect, useRef, useState } from "react";
import { NamedIcon, placeOf, type Tone, VARIANT } from "./look.tsx";
import { CANNOT_NOW, useRunning } from "./press.tsx";

interface ActionsConfig {
  actions: {
    id: string;
    label: string;
    tone?: Tone;
    icon?: string;
    action: unknown;
  }[];
  lineUp?: "left" | "right" | "spread";
  showUpTo?: number;
  place?: string;
}

/** The space between buttons, in pixels: `gap-2`. */
const GAP = 8;

/**
 * How many of the buttons, from the first, fit in `room` pixels when the rest go under the
 * \u22ef menu, and never more than `limit` ("Show up to"). Not measured yet (a width of
 * nothing) is as many as `limit` allows: nothing is hidden on a guess.
 */
export function fitCount(
  room: number,
  widths: readonly number[],
  more: number,
  limit = Number.POSITIVE_INFINITY,
): number {
  const all = widths.length;
  if (room <= 0 || widths.some((one) => one <= 0)) return Math.min(all, limit);
  const row = (count: number) =>
    widths.slice(0, count).reduce((sum, one) => sum + one, 0) + GAP * Math.max(0, count - 1);
  if (limit >= all && row(all) <= room) return all;
  let count = Math.min(all - 1, limit);
  while (count > 0 && row(count) + GAP + more > room) count -= 1;
  return count;
}

/**
 * Action group: related buttons in a row, the first the main one. Each runs its action
 * through the host, with the page's record when the page is open on one; it is disabled,
 * with the reason, when its conditions do not hold, and shows it is under way. What does not
 * fit the widget's width, or pass `showUpTo`, goes in the \u22ef menu, which a keyboard reaches like
 * any menu. It lines up left, right or spread, and stands in its cell by `place`.
 */
export function ActionsView({ config, act, can, why, building }: WidgetViewProps<ActionsConfig>) {
  const { running, run } = useRunning();
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  const [sizes, setSizes] = useState<{ items: number[]; more: number }>({ items: [], more: 0 });
  const items = config.actions;
  const labels = items.map((one) => one.label).join("\u0000");
  // The widths the buttons would have in a row, and the room the row has, kept as either changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again when the labels change
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => {
      setRoom(node.getBoundingClientRect().width);
      const widths = [...(layer.current?.children ?? [])].map(
        (one) => one.getBoundingClientRect().width,
      );
      setSizes({ items: widths.slice(0, -1), more: widths.at(-1) ?? 0 });
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const watching = new ResizeObserver(measure);
    watching.observe(node);
    return () => watching.disconnect();
  }, [labels]);

  const inert = building || !act;
  const limit =
    typeof config.showUpTo === "number" && config.showUpTo >= 1
      ? Math.floor(config.showUpTo)
      : Number.POSITIVE_INFINITY;
  const shown = fitCount(room, sizes.items, sizes.more, limit);
  const lineUp = config.lineUp ?? "left";
  const spot = placeOf(config.place);
  // Spread and Right say the row's side; Left leaves it to the place's column.
  const side =
    lineUp === "spread" ? "justify-between" : lineUp === "right" ? "justify-end" : spot.justify;
  const where = (index: number) => `config/actions/${index}/action`;
  const allowed = (index: number) => (inert ? false : (can?.(where(index)) ?? true));
  const reason = (index: number) => why?.(where(index)) ?? CANNOT_NOW;
  // The page's record, when it is open on one, is the host's to give: the action runs with it.
  const press = (id: string, index: number) => void run(id, () => act?.(where(index)));
  const visible = items.slice(0, shown);
  const hidden = items.slice(shown);
  const variantOf = (index: number) =>
    VARIANT[items[index]?.tone ?? (index === 0 ? "primary" : "default")];
  const pending = hidden.some((one) => one.id === running);

  return (
    <div
      ref={box}
      data-actions=""
      data-line-up={lineUp}
      className={`relative flex h-full w-full ${spot.items} gap-2 ${side}`}
    >
      {visible.map((one, index) =>
        inert ? (
          <Button
            key={one.id}
            variant={variantOf(index)}
            tabIndex={-1}
            aria-disabled="true"
            className="cursor-default"
          >
            <NamedIcon name={one.icon} />
            {one.label}
          </Button>
        ) : (
          <Button
            key={one.id}
            variant={variantOf(index)}
            disabled={!allowed(index) || running !== undefined}
            loading={running === one.id}
            tooltip={allowed(index) ? undefined : reason(index)}
            onClick={() => press(one.id, index)}
          >
            <NamedIcon name={one.icon} />
            {one.label}
          </Button>
        ),
      )}
      {hidden.length > 0 ? (
        <Menu
          align={lineUp === "right" || spot.justify === "justify-end" ? "end" : "start"}
          ariaLabel="More"
          triggerClassName="inline-flex h-control aspect-square items-center justify-center rounded-control border border-line-control bg-surface font-medium text-ink hover:bg-sunken focus-visible:outline-2 focus-visible:outline-action"
          label={
            pending ? (
              <LoaderCircle aria-hidden="true" size={14} className="shrink-0 animate-spin" />
            ) : (
              <Ellipsis aria-hidden="true" size={16} />
            )
          }
          items={hidden.map((one, offset) => {
            const index = shown + offset;
            const ok = allowed(index) && running === undefined;
            return {
              label: one.label,
              danger: one.tone === "danger",
              ...(one.icon ? { icon: <NamedIcon name={one.icon} size={14} /> } : {}),
              // A menu item that may not be pressed says why beside it, and does nothing.
              ...(allowed(index) || inert
                ? {}
                : { detail: <span className="text-meta text-ink-muted">{reason(index)}</span> }),
              onSelect: () => {
                if (ok) press(one.id, index);
              },
            };
          })}
        />
      ) : null}
      {/* What the row would measure with every button in it: never seen, never reached. */}
      <div
        ref={layer}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 flex w-max gap-2"
      >
        {items.map((one, index) => (
          <Button
            key={one.id}
            data-measure={one.id}
            variant={variantOf(index)}
            tabIndex={-1}
            className="shrink-0"
          >
            <NamedIcon name={one.icon} />
            {one.label}
          </Button>
        ))}
        <Button
          data-measure="more"
          variant="secondary"
          tabIndex={-1}
          className="aspect-square shrink-0 px-0"
        >
          <Ellipsis aria-hidden="true" size={16} />
        </Button>
      </div>
    </div>
  );
}
