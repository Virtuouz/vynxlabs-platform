import { Sparkline } from "@volvel/ui";
import { ArrowDownRight, ArrowUpRight, Minus } from "@volvel/ui/icons";
import type { WidgetViewProps } from "@volvel/widgets";
import {
  comparison,
  formatNumber,
  labelOf,
  trendOf,
  trendWords,
  type ValueFormat,
} from "./format.ts";
import { listensTo, PRESSABLE, press } from "./press.tsx";

interface StatConfig {
  format?: ValueFormat;
  caption?: string;
  /** Switched off: the period before is not drawn, whatever `compareTo` says. */
  compare?: boolean;
  compareTo?: string;
  delta?: "percent" | "absolute" | "points";
  goodWhen?: "up" | "down";
}

/** Whether a change is good news: up is, unless the figure says going up is bad. Undefined for no change. */
export function changeTone(
  direction: "up" | "down" | "same",
  goodWhen: "up" | "down" | undefined,
): "good" | "bad" | undefined {
  if (direction === "same") return undefined;
  return (direction === "up") === (goodWhen !== "down") ? "good" : "bad";
}

/** One number, how it stands against the period before, and its line over time. */
export function StatView(props: WidgetViewProps<StatConfig>) {
  const { config, data, emit } = props;
  const summary = data.value;
  if (summary?.shape !== "summary") return null;
  const name = summary.values[0] ?? "";
  const value = summary.rows[0]?.[name];
  const earlier = summary.previous ? (summary.previous[0]?.[name] ?? null) : undefined;
  const against =
    summary.previous !== undefined && config.compare !== false
      ? comparison(value, earlier, { delta: config.delta, format: config.format })
      : undefined;
  const Mark =
    against?.direction === "up"
      ? ArrowUpRight
      : against?.direction === "down"
        ? ArrowDownRight
        : Minus;
  // Up is good news unless the figure says otherwise: fewer overdue is better.
  const tone = against ? changeTone(against.direction, config.goodWhen) : undefined;
  const good = tone === undefined ? undefined : tone === "good";
  const caption = config.caption?.replace("{previous}", formatNumber(earlier, config.format));
  const line = trendOf(summary);
  const label = labelOf(summary.columns, name);
  const pressable = listensTo(props, "click");
  return (
    <div
      className={`my-auto flex flex-col gap-1 ${
        pressable ? `${PRESSABLE} -m-2 rounded-control p-2` : ""
      }`}
      // A number that something listens to is pressed: it opens the rows behind it, or does what the page says.
      {...(pressable ? { role: "button", ...press(true, () => emit("click", {})) } : {})}
    >
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          // Money to the cent fits a narrow cell only at the smaller size: by the cell's width, not its columns.
          className="text-display font-semibold tabular-nums @[14rem]/cell:text-display-lg"
        >
          {formatNumber(value, config.format)}
        </span>
        {against ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-control px-1.5 py-0.5 text-body-sm font-medium tabular-nums ${
              good === undefined
                ? "bg-sunken text-ink-muted"
                : good
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger"
            }`}
          >
            <Mark aria-hidden="true" size={14} />
            <span aria-hidden="true">{against.short}</span>
            {/* The sentence is read aloud here, once; the line below is its short form to look at. */}
            <span className="sr-only">{against.text}</span>
          </span>
        ) : null}
      </span>
      {line.length > 1 ? (
        <Sparkline
          values={line}
          label={trendWords(label, line, config.format)}
          className="my-1 text-action"
        />
      ) : null}
      {caption ? (
        <span className="text-body-sm text-ink-muted">{caption}</span>
      ) : against ? (
        <span aria-hidden="true" className="text-body-sm text-ink-muted">
          {against.direction === "same" ? "same as the period before" : "vs the period before"}
        </span>
      ) : null}
    </div>
  );
}
