import type { PageWidget } from "@volvel/manifest";
import { expect, test } from "vitest";
import { toCsv } from "./export.ts";
import { resultOf } from "./Frame.tsx";
import type { WireData } from "./types.ts";

const read: Record<string, WireData> = {
  rows: {
    shape: "rows",
    columns: [
      { name: "id", type: "uuid", label: "Id" },
      { name: "number", type: "text", label: "Number" },
      { name: "total", type: "number", label: "Total" },
      { name: "secret", type: "text", label: "Internal code" },
    ],
    rows: [
      { id: "a", number: "INV-1", total: 452000, secret: "x" },
      { id: "b", number: "INV-2", total: 1999, secret: "y" },
    ],
  },
};
const table = (columns: object[]) =>
  ({
    id: "t",
    type: "core/table",
    at: { x: 0, y: 0, w: 12, h: 6 },
    config: { columns },
  }) as PageWidget;

test("a table is downloaded as it is shown: its columns, order and headings, money in units (WID-Q2, D36)", () => {
  const widget = table([
    {
      column: "total",
      label: "Amount due",
      format: { style: "currency", currency: "USD", minorUnits: true },
    },
    { column: "number" },
    { column: "secret", hidden: true },
  ]);
  expect(toCsv(resultOf(read, widget) as never)).toBe(
    ["Amount due,Number", "4520,INV-1", "19.99,INV-2"].join("\r\n"),
  );
  // Without the widget it is as read, every column.
  expect(resultOf(read)?.columns).toHaveLength(4);
});
