import type { SummaryData, WidgetViewProps } from "@volvel/widgets";

/** What the Goal's configuration holds, as its definition declares it. */
export interface GoalConfig {
  target: number;
  format?: {
    style: "number" | "currency" | "percent";
    currency?: string;
    minorUnits?: boolean;
    decimals?: number;
  };
  label?: string;
  goodWhen?: "up" | "down";
  bands?: boolean;
}

/** A number from a row: totals can come back as text, from the database's exact numbers. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** A value written as its format says, in US English: `$45,000`, `12.5%`, `1,204`. */
export function formatNumber(value: number, format: GoalConfig["format"]): string {
  const scaled = format?.minorUnits ? value / 100 : value;
  const options: Intl.NumberFormatOptions =
    format?.style === "currency"
      ? { style: "currency", currency: format.currency ?? "USD", maximumFractionDigits: 0 }
      : format?.style === "percent"
        ? { style: "percent", maximumFractionDigits: 1 }
        : { maximumFractionDigits: 2 };
  if (format?.decimals !== undefined) {
    options.minimumFractionDigits = format.decimals;
    options.maximumFractionDigits = format.decimals;
  }
  try {
    return new Intl.NumberFormat("en-US", options).format(scaled);
  } catch {
    // A currency code the browser does not know: the number, and the code after it.
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(scaled)} ${format?.currency ?? ""}`.trim();
  }
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

/** Goal: one number, a bar toward a target, the share reached, and a line under it. */
export function GoalView({ config, data, emit }: WidgetViewProps<GoalConfig>) {
  const input = data.value as SummaryData | undefined;
  const name = input?.values[0];
  const found = name === undefined ? undefined : numberOf(input?.rows[0]?.[name]);
  const value = found ?? 0;
  const target = config.target;
  const share = target > 0 ? value / target : 0;
  const shown = Math.round(share * 1000) / 10;
  const band = config.bands ? bandOf(share, config.goodWhen ?? "up") : "plain";
  const fill = Math.max(0, Math.min(100, share * 100));
  return (
    <button
      type="button"
      onClick={() => emit("click", {})}
      className="flex h-full w-full cursor-pointer flex-col justify-center gap-2 border-0 bg-transparent p-0 text-left text-ink"
    >
      <span className="text-3xl font-semibold tabular-nums">
        {formatNumber(value, config.format)}
      </span>
      <span
        role="progressbar"
        aria-label="Share of the target reached"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        aria-valuetext={`${shown}% of ${formatNumber(target, config.format)}`}
        className="block h-2 w-full overflow-hidden rounded-control bg-sunken"
      >
        <span className={`block h-full ${FILL[band]}`} style={{ width: `${fill}%` }} />
      </span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-ink-muted">
        <span>{config.label ?? ""}</span>
        <span className="tabular-nums">{shown}%</span>
      </span>
    </button>
  );
}
