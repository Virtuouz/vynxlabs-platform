import type { WidgetData } from "@volvel/widgets";
import type { WireData } from "./types.ts";

/** What the endpoint gave, as a view is given it. A rows input with a next page gets a `more` that asks for it. */
export function toWidgetData(wire: WireData, more?: () => void): WidgetData {
  if (wire.shape === "rows") {
    const { next, followed: _followed, ...rest } = wire;
    return { ...rest, ...(next !== undefined && more ? { more } : {}) };
  }
  const { followed: _followed, ...rest } = wire;
  return rest;
}

/** Whether a read has nothing to draw: no rows, no groups, or no record. A figure with no groups is never empty. */
export function isEmpty(inputs: Readonly<Record<string, WireData>>): boolean {
  const all = Object.values(inputs);
  if (all.length === 0) return false;
  return all.every((wire) => {
    // A record input with no record is for the view to draw: a create form, or a detail that says nothing is open.
    if (wire.shape === "record") return false;
    if (wire.shape === "summary" && wire.breakdowns.length === 0) return false;
    return wire.rows.length === 0;
  });
}
