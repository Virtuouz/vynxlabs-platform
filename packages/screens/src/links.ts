import type { PageWidget, WidgetSummary } from "@vynxlabs/manifest";
import type { Filter, Row } from "./data.ts";

/** The name a group comes back from the API under: its column, and its bucket when it has one. */
export const groupName = (group: WidgetSummary["groupBy"][number]) =>
  group.bucket ? `${group.column}:${group.bucket}` : group.column;
/** The name a total comes back from the API under. */
export const measureName = (aggregate: WidgetSummary["aggregates"][number]) =>
  aggregate.column ? `${aggregate.fn}:${aggregate.column}` : aggregate.fn;

/** Several conditions as one. None is no condition at all. */
export function all(filters: (Filter | undefined)[]): Filter | undefined {
  const given = filters.filter((filter): filter is Filter => filter !== undefined);
  if (given.length === 0) return undefined;
  return given.length === 1 ? given[0] : { and: given };
}

/** Where the period after this one begins: the day, week, month or year that follows. */
export function nextBucket(start: string, bucket: "day" | "week" | "month" | "year"): string {
  const dateOnly = start.length === 10;
  const at = new Date(dateOnly ? `${start}T00:00:00Z` : start);
  if (bucket === "day") at.setUTCDate(at.getUTCDate() + 1);
  else if (bucket === "week") at.setUTCDate(at.getUTCDate() + 7);
  else if (bucket === "month") at.setUTCMonth(at.getUTCMonth() + 1);
  else at.setUTCFullYear(at.getUTCFullYear() + 1);
  return dateOnly ? at.toISOString().slice(0, 10) : at.toISOString();
}

/**
 * The rows a widget shows because of the row chosen in the widget it follows.
 *
 * `"waiting"` means nothing is chosen yet, and `"nothing"` that the chosen row
 * points nowhere: both show no rows, for different reasons.
 */
export function linkFilter(
  widget: PageWidget,
  source: PageWidget | undefined,
  chosen: Row | undefined,
): Filter | "waiting" | "nothing" | undefined {
  const link = widget.link;
  if (!link) return undefined;
  if (!source || !chosen) return "waiting";
  if (link.type === "same") return { column: "id", op: "eq", value: chosen.id };
  if (link.type === "refersTo") {
    return { column: link.via as string, op: "eq", value: chosen.id };
  }
  if (link.type === "referredBy") {
    const points = chosen[link.via as string];
    if (points === null || points === undefined) return "nothing";
    return { column: "id", op: "eq", value: points };
  }
  // The rows behind a line of totals: those with that line's value in each group.
  const conditions: Filter[] = [];
  for (const group of source.summary?.groupBy ?? []) {
    const value = chosen[group.column];
    if (value === null || value === undefined) {
      conditions.push({ column: group.column, op: "is_null" });
    } else if (group.bucket) {
      conditions.push({ column: group.column, op: "gte", value });
      conditions.push({
        column: group.column,
        op: "lt",
        value: nextBucket(String(value), group.bucket),
      });
    } else {
      conditions.push({ column: group.column, op: "eq", value });
    }
  }
  return all(conditions);
}

/** What a new row made in a widget is given by the row it follows. */
export function linkDefaults(widget: PageWidget, chosen: Row | undefined): Row {
  if (widget.link?.type === "refersTo" && widget.link.via && chosen?.id !== undefined) {
    return { [widget.link.via]: chosen.id };
  }
  return {};
}

/** A summary's lines as rows: each group under its column's name, each total under its own. */
export function summaryRows(
  summary: WidgetSummary,
  items: { by: Row; values: Record<string, unknown> }[],
): Row[] {
  return items.map((item) => {
    const row: Row = {};
    for (const group of summary.groupBy) row[group.column] = item.by[groupName(group)];
    for (const aggregate of summary.aggregates) {
      row[aggregate.as] = item.values[measureName(aggregate)];
    }
    // A line is known by what it groups, which no two lines share.
    row.id = JSON.stringify(summary.groupBy.map((group) => row[group.column]));
    return row;
  });
}

/** A widget's sort as the API takes it. For totals the names are the API's own. */
export function sortOf(widget: PageWidget): string[] {
  const summary = widget.summary;
  return (widget.sort ?? []).map((entry) => {
    let name = entry.column;
    if (summary) {
      const group = summary.groupBy.find((candidate) => candidate.column === entry.column);
      const aggregate = summary.aggregates.find((candidate) => candidate.as === entry.column);
      name = group ? groupName(group) : aggregate ? measureName(aggregate) : entry.column;
    }
    return entry.desc ? `-${name}` : name;
  });
}

/** A column's name as a heading: `customer_id` as "Customer id". */
export function heading(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
