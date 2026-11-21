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

interface StatConfig {
  format?: ValueFormat;
  caption?: string;
  compareTo?: string;
  delta?: "percent" | "absolute" | "points";
  goodWhen?: "up" | "down";
}

/** One number, how it stands against the period before, and its line over time. */
export function StatView({ config, data }: WidgetViewProps<StatConfig>) {
  const summary = data.value;
  if (summary?.shape !== "summary") return null;
  const name = summary.values[0] ?? "";
  const value = summary.rows[0]?.[name];
  const earlier = summary.previous ? (summary.previous[0]?.[name] ?? null) : undefined;
  const against =
    summary.previous !== undefined
      ? comparison(value, earlier, { delta: config.delta, format: config.format })
      : undefined;
  const Mark =
    against?.direction === "up"
      ? ArrowUpRight
      : against?.direction === "down"
        ? ArrowDownRight
        : Minus;
  // Up is good news unless the figure says otherwise: fewer overdue is better.
  const good =
    against && against.direction !== "same"
      ? (against.direction === "up") === (config.goodWhen !== "down")
      : undefined;
  const caption = config.caption?.replace("{previous}", formatNumber(earlier, config.format));
  const line = trendOf(summary);
  const label = labelOf(summary.columns, name);
  return (
    <div className="my-auto flex flex-col gap-1">
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
            {/* Said once: here when the line below is in the maker's own words. */}
            {caption ? <span className="sr-only">{against.text}</span> : null}
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
      {caption || against ? (
        <span className="text-body-sm text-ink-muted">{caption ?? against?.text}</span>
      ) : null}
    </div>
  );
}
