import type { WidgetData } from "@volvel/widgets";
import type { WireData } from "./types.ts";

/** What the endpoint gave, as a view is given it. A rows input with a next page gets a `more` that asks for it. */
export function toWidgetData(wire: WireData, more?: () => void): WidgetData {
  if (wire.shape === "rows") {
    const { next, ...rest } = wire;
    return { ...rest, ...(next !== undefined && more ? { more } : {}) };
  }
  return wire;
}

/** Whether a read has nothing to draw: no rows, no groups, or no record. A figure with no groups is never empty. */
export function isEmpty(inputs: Readonly<Record<string, WireData>>): boolean {
  const all = Object.values(inputs);
  if (all.length === 0) return false;
  return all.every((wire) => {
    if (wire.shape === "record") return wire.record === null;
    if (wire.shape === "summary" && wire.breakdowns.length === 0) return false;
    return wire.rows.length === 0;
  });
}
