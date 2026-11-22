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
  const { config, data, emit, size } = props;
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
  // Nothing before it to compare with is said in words, not as a figure that cannot be one.
  const nothingBefore = against !== undefined && against.short === "new";
  return (
    <div
      // From the top of the card, so that figures in a row share a baseline whatever is under them.
      className={`flex flex-col ${pressable ? `${PRESSABLE} -m-2 rounded-control p-2` : ""}`}
      // A number that something listens to is pressed: it opens the rows behind it, or does what the page says.
      {...(pressable ? { role: "button", ...press(true, () => emit("click", {})) } : {})}
    >
      <span
        // Money to the cent fits a narrow cell only at the smaller size: by the cell's width, not its columns.
        className="text-display font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums @[14rem]/cell:text-display-lg @[17rem]/cell:text-[28px]/[34px]"
      >
        {formatNumber(value, config.format)}
      </span>
      {against || caption ? (
        // One line, as the boards draw it: the change, then the caption. The caption wins the
        // room; with none, the period is named there. The whole sentence is the tooltip.
        <span
          title={against?.text}
          className="mt-1 flex min-w-0 items-start gap-x-1.5 text-[12.5px] text-ink-muted"
        >
          {against && !nothingBefore ? (
            <span
              className={`inline-flex shrink-0 items-center gap-0.5 font-medium tabular-nums ${
                good === undefined ? "" : good ? "text-success" : "text-danger"
              }`}
            >
              <Mark aria-hidden="true" size={14} />
              <span aria-hidden="true">{against.short}</span>
            </span>
          ) : null}
          <span
            aria-hidden={against ? "true" : undefined}
            className={`min-w-0 ${size.narrow ? "" : "truncate"}`}
            title={caption ?? undefined}
          >
            {caption ||
              (nothingBefore
                ? "Nothing in the period before"
                : against?.direction === "same"
                  ? "same as the period before"
                  : "vs the period before")}
          </span>
          {against ? (
            <span className="sr-only">
              {caption ? against.text + ". " + caption : against.text}
            </span>
          ) : null}
        </span>
      ) : null}
      {line.length > 1 ? (
        <Sparkline
          values={line}
          label={trendWords(label, line, config.format)}
          className="my-1 text-action"
        />
      ) : null}
    </div>
  );
}
