import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DashboardWidget } from "@vynxlabs/manifest";
import { describe, expect, test } from "vitest";
import {
  chartSpec,
  comparison,
  filterValue,
  filterValues,
  pivot,
  previousRange,
  type Result,
  relativeRange,
  toCsv,
  toXlsx,
} from "./screens/dashboards/model.ts";

const result = (names: [string, string][], rows: unknown[][]): Result => ({
  columns: names.map(([name, type]) => ({ name, type })),
  rows,
  truncated: false,
  tables: [],
  sql: "",
});
const sales = result(
  [
    ["month", "date"],
    ["status", "text"],
    ["loans", "number"],
    ["fees", "number"],
  ],
  [
    ["2026-10-01", "out", 2, 50],
    ["2026-10-01", "back", 1, 5],
    ["2026-11-01", "out", 3, 90],
    ["2026-11-01", "late", 1, 30],
  ],
);

describe("a range of dates by name", () => {
  const today = new Date(2026, 10, 18); // 18 November 2026

  test("stands for days counted back from today, or for the month, quarter or year today is in", () => {
    expect(relativeRange("today", today)).toEqual({ from: "2026-11-18", to: "2026-11-18" });
    expect(relativeRange("last_7_days", today)).toEqual({ from: "2026-11-12", to: "2026-11-18" });
    expect(relativeRange("last_30_days", today)).toEqual({ from: "2026-10-20", to: "2026-11-18" });
    expect(relativeRange("this_month", today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(relativeRange("last_month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(relativeRange("this_quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(relativeRange("this_year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(relativeRange("last_12_months", today)).toEqual({
      from: "2025-12-01",
      to: "2026-11-30",
    });
    // The last month of a year, and a February.
    expect(relativeRange("last_month", new Date(2027, 0, 5))).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(relativeRange("this_month", new Date(2028, 1, 10)).to).toBe("2028-02-29");
  });

  test("a filter is its setting, its default when it has none, and nothing when neither", () => {
    const when = { name: "when", type: "date_range", default: "last_7_days" } as const;
    expect(filterValue(when, undefined, today)).toEqual({ from: "2026-11-12", to: "2026-11-18" });
    expect(filterValue(when, "this_month", today)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(filterValue(when, "2026-01-01..2026-01-31", today)).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(filterValue(when, "2026-01-01..", today)).toEqual({ from: "2026-01-01" });
    // "All time" is said, so that a default can be set aside.
    expect(filterValue(when, "all", today)).toBeUndefined();
    expect(filterValue({ name: "n", type: "number" }, "12")).toBe(12);
    expect(filterValue({ name: "n", type: "number" }, "twelve")).toBeUndefined();
    expect(
      filterValues(
        [when, { name: "who", type: "text" }, { name: "kind", type: "choice", default: "av" }],
        { who: "" },
        today,
      ),
    ).toEqual({ when: { from: "2026-11-12", to: "2026-11-18" }, kind: "av" });
  });

  test("the period before is as long, and ends the day before", () => {
    expect(previousRange({ from: "2026-11-01", to: "2026-11-30" })).toEqual({
      from: "2026-10-02",
      to: "2026-10-31",
    });
    expect(previousRange({ from: "2026-11-18", to: "2026-11-18" })).toEqual({
      from: "2026-11-17",
      to: "2026-11-17",
    });
    expect(previousRange({ from: "2026-11-01" })).toBeUndefined();
  });

  test("a figure says how it stands against the period before", () => {
    expect(comparison(120, 100)).toEqual({
      direction: "up",
      text: "20% more than the period before",
    });
    expect(comparison(75, 100)).toEqual({
      direction: "down",
      text: "25% less than the period before",
    });
    expect(comparison(100, 100)?.direction).toBe("same");
    expect(comparison(5, 0)).toEqual({ direction: "up", text: "Nothing in the period before" });
    expect(comparison(0, 0)?.direction).toBe("same");
    expect(comparison(null, 100)).toBeUndefined();
    // A sum over no rows is empty: nothing in the period before, not no comparison.
    expect(comparison(80, null)?.text).toBe("Nothing in the period before");
    expect(comparison(80, undefined)).toBeUndefined();
  });
});

describe("a pivot", () => {
  test("turns rows on their side, with a total for each row, each column and all of it", () => {
    const turned = pivot(sales, { rows: ["month"], columns: ["status"], value: "fees" });
    expect(turned.columns).toEqual(["out", "back", "late"]);
    expect(turned.rows).toEqual([
      { headers: ["2026-10-01"], cells: [50, 5, null], total: 55 },
      { headers: ["2026-11-01"], cells: [90, null, 30], total: 120 },
    ]);
    expect(turned.totals).toEqual({ cells: [140, 5, 30], total: 175 });
  });

  test("works a cell out as it is told: an average, the most, or how many", () => {
    const twice = result(
      [
        ["kind", "text"],
        ["fee", "number"],
      ],
      [
        ["a", 10],
        ["a", 30],
        ["b", 5],
      ],
    );
    expect(
      pivot(twice, { rows: ["kind"], value: "fee", cell: "avg" }).rows.map((row) => row.total),
    ).toEqual([20, 5]);
    expect(
      pivot(twice, { rows: ["kind"], value: "fee", cell: "max" }).rows.map((row) => row.total),
    ).toEqual([30, 5]);
    expect(pivot(twice, { rows: ["kind"], cell: "count" }).rows.map((row) => row.total)).toEqual([
      2, 1,
    ]);
    // With nothing heading the columns there is one, and its cells are the rows' totals.
    expect(pivot(twice, { rows: ["kind"], value: "fee" }).columns).toEqual([""]);
  });
});

describe("a chart's description", () => {
  const widget = (options: NonNullable<DashboardWidget["options"]>): DashboardWidget => ({
    id: "c",
    type: "chart",
    options,
  });
  const spec = (options: NonNullable<DashboardWidget["options"]>) =>
    // biome-ignore lint/suspicious/noExplicitAny: a chart's description is inspected freely
    chartSpec(widget(options), sales) as any;

  test("puts a date along a time axis, stacks a series, or sets its bars side by side", () => {
    const stacked = spec({ mark: "bar", x: "month", y: "fees", series: "status" });
    expect(stacked.encoding.x).toMatchObject({ field: "month", type: "temporal" });
    expect(stacked.encoding.y).toMatchObject({ field: "fees", stack: true });
    expect(stacked.encoding.color.field).toBe("status");
    const grouped = spec({ mark: "bar", x: "status", y: "fees", series: "month", bars: "grouped" });
    expect(grouped.encoding.xOffset.field).toBe("month");
    expect(grouped.encoding.y.stack).toBeNull();
  });

  test("draws several columns as a series each, a line over bars, a pie and points", () => {
    const several = spec({ mark: "line", x: "month", y: ["loans", "fees"] });
    expect(several.transform).toEqual([{ fold: ["loans", "fees"], as: ["series", "value"] }]);
    expect(several.encoding.color.field).toBe("series");
    const combined = spec({ mark: "bar", x: "month", y: "fees", line: "loans" });
    expect(combined.layer).toHaveLength(2);
    expect(combined.layer[1].encoding.y.field).toBe("loans");
    expect(combined.resolve.scale.y).toBe("independent");
    expect(spec({ mark: "pie", x: "status", y: "fees" }).mark.type).toBe("arc");
    expect(spec({ mark: "scatter", x: "loans", y: "fees" }).encoding.x.type).toBe("quantitative");
    // Told nothing, it draws the first number against the first column.
    expect(spec({}).encoding).toMatchObject({ x: { field: "month" }, y: { field: "loans" } });
  });
});

describe("a result as a file", () => {
  const awkward = result(
    [
      ["name", "text"],
      ["n", "number"],
      ["note", "text"],
    ],
    [
      ['Say "hi"', 1.5, "a,b"],
      ["=SUM(A1)", null, "line\nbreak"],
      ["<&>", 0, { a: 1 }],
    ],
  );

  test("as CSV, quoted where it must be, and never read as a formula", () => {
    expect(toCsv(awkward)).toBe(
      [
        "name,n,note",
        '"Say ""hi""",1.5,"a,b"',
        `'=SUM(A1),,"line\nbreak"`,
        '<&>,0,"{""a"":1}"',
      ].join("\r\n"),
    );
  });

  test("as a spreadsheet, a zip that a reader of the format opens to the same values", () => {
    const bytes = toXlsx(awkward, "Fees: 2026");
    // A zip begins with a local file header and ends with the end of its directory.
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect([...bytes.subarray(bytes.length - 22, bytes.length - 18)]).toEqual([
      0x50, 0x4b, 0x05, 0x06,
    ]);
    // Read back by Python's zip reader, which checks each file's checksum, and by an XML parser.
    const file = join(mkdtempSync(join(tmpdir(), "vx-xlsx-")), "result.xlsx");
    writeFileSync(file, bytes);
    const read = execFileSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import sys, zipfile, json, xml.etree.ElementTree as ET",
          "z = zipfile.ZipFile(sys.argv[1])",
          "assert z.testzip() is None",
          "for name in z.namelist(): ET.fromstring(z.read(name))",
          "ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}",
          "sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))",
          "rows = [[(c.get('r'), c.get('t'), (c.find('m:v', ns).text if c.find('m:v', ns) is not None else c.find('m:is/m:t', ns).text)) for c in r.findall('m:c', ns)] for r in sheet.findall('m:sheetData/m:row', ns)]",
          "book = ET.fromstring(z.read('xl/workbook.xml'))",
          "print(json.dumps({'files': sorted(z.namelist()), 'rows': rows, 'sheet': book.find('m:sheets/m:sheet', ns).get('name')}))",
        ].join("\n"),
        file,
      ],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(read);
    expect(parsed.files).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    // A sheet's name cannot hold a colon.
    expect(parsed.sheet).toBe("Fees  2026");
    expect(parsed.rows).toEqual([
      [
        ["A1", "inlineStr", "name"],
        ["B1", "inlineStr", "n"],
        ["C1", "inlineStr", "note"],
      ],
      [
        ["A2", "inlineStr", 'Say "hi"'],
        ["B2", null, "1.5"],
        ["C2", "inlineStr", "a,b"],
      ],
      // Text is text in a spreadsheet's own format: nothing reads it as a formula. An empty cell is left out.
      [
        ["A3", "inlineStr", "=SUM(A1)"],
        ["C3", "inlineStr", "line\nbreak"],
      ],
      [
        ["A4", "inlineStr", "<&>"],
        ["B4", null, "0"],
        ["C4", "inlineStr", '{"a":1}'],
      ],
    ]);
  });
});
