import {
  formatNumber,
  numberOf,
  type SummaryData,
  type ValueFormat,
  type WidgetViewProps,
} from "@volvel/widgets";

export { formatNumber };

/** What the Goal's configuration holds, as its definition declares it. */
export interface GoalConfig {
  target?: number;
  /** A column of the result that holds the goal; wins over `target`. */
  goalFrom?: string;
  /** `green`: the bar turns green once the goal is reached. Left out: it does not. */
  reached?: "green" | "none";
  /** Left out: shown. */
  percent?: boolean;
  format?: ValueFormat;
  label?: string;
  goodWhen?: "up" | "down";
  bands?: boolean;
}

type Band = "good" | "close" | "behind";

/** How well it is going: for "up", reaching the target is good; for "down", staying under it. */
function bandOf(share: number, goodWhen: "up" | "down"): Band {
  if (goodWhen === "down") return share <= 0.75 ? "good" : share <= 1 ? "close" : "behind";
  return share >= 0.75 ? "good" : share >= 0.4 ? "close" : "behind";
}

const FILL: Record<Band | "plain", string> = {
  good: "bg-success",
  close: "bg-attention",
  behind: "bg-danger",
  plain: "bg-action",
};

/** How the bar is coloured: green once reached when the goal says so, else by how close, else plain. */
export function goalBand(share: number, config: GoalConfig): Band | "plain" {
  if (config.reached === "green" && share >= 1 && config.goodWhen !== "down") return "good";
  return config.bands ? bandOf(share, config.goodWhen ?? "up") : "plain";
}

/** Goal: one number, a bar toward a target, the share reached, and a line under it. */
export function GoalView({ config, data, emit }: WidgetViewProps<GoalConfig>) {
  const input = data.value as SummaryData | undefined;
  const name = input?.values[0];
  const found = name === undefined ? undefined : numberOf(input?.rows[0]?.[name]);
  const value = found ?? 0;
  const from = config.goalFrom;
  const fromColumn = from === undefined ? undefined : numberOf(input?.rows[0]?.[from]);
  const target = fromColumn ?? config.target ?? 0;
  const share = target > 0 ? value / target : 0;
  const shown = Math.round(share * 1000) / 10;
  const band = goalBand(share, config);
  const fill = Math.max(0, Math.min(100, share * 100));
  return (
    <button
      type="button"
      onClick={() => emit("click", {})}
      className="flex w-full cursor-pointer flex-col gap-1.5 border-0 bg-transparent p-0 text-left text-ink"
    >
      <span
        // Money to the cent fits a narrow cell only at the smaller size: by the cell's width, not its columns.
        className="text-display font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums @[14rem]/cell:text-display-lg @[17rem]/cell:text-[28px]/[34px]"
      >
        {formatNumber(value, config.format)}
      </span>
      <span
        role="progressbar"
        aria-label="Share of the target reached"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        aria-valuetext={`${shown}% of ${formatNumber(target, config.format)}`}
        className="block h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <span className={`block h-full ${FILL[band]}`} style={{ width: `${fill}%` }} />
      </span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px] text-ink-muted">
        <span>{config.label ?? ""}</span>
        {config.percent === false ? null : <span className="tabular-nums">{shown}%</span>}
      </span>
    </button>
  );
}
