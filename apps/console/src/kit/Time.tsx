import { Tooltip } from "@volvel/ui";
import { ago, clock, fullTime, stamp, type When } from "./format.ts";

/**
 * A time on screen (07 §7.3): "5m ago" or "16:38:54", never wrapping, with
 * its full local time, UTC and age shown on hover.
 */
export function Time({
  value,
  mode = "clock",
  className = "",
}: {
  value: When;
  /** `ago` for lists, `clock` for a time to the second, `stamp` for one shape on every line. */
  mode?: "ago" | "clock" | "stamp";
  className?: string;
}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return <span className={className}>—</span>;
  const text = mode === "ago" ? ago(date) : mode === "stamp" ? stamp(date) : clock(date);
  return (
    <Tooltip label={fullTime(date)}>
      <time dateTime={date.toISOString()} className={`whitespace-nowrap tabular-nums ${className}`}>
        {text}
      </time>
    </Tooltip>
  );
}
