import { describe, expect, it } from "vitest";
import { checkInterface, type InterfaceBody, type PageWidget } from "./page.js";
import type { TableBody } from "./table.js";

const invoices = {
  columns: {
    total: { type: "integer" },
    issued: { type: "date" },
    status: { type: "enum", values: ["paid", "unpaid"] },
  },
} as unknown as TableBody;
const tableOf = (path: string) => (path === "invoices" ? invoices : undefined);

const said = (filters: object[]) => {
  const widget: PageWidget = {
    id: "a",
    type: "core/table",
    at: { x: 0, y: 0, w: 8, h: 5 },
    data: {
      rows: { source: { visual: { table: "invoices", filters: filters as never } } },
    },
  };
  const body: InterfaceBody = {
    title: "Money",
    pages: [{ id: "money", title: "Money", widgets: [widget] }],
  } as InterfaceBody;
  return checkInterface(body, tableOf).map((one) => `${one.path} ${one.message}`);
};
const path = "/body/pages/0/widgets/0/data/rows/source/visual/filters/0";

describe("the conditions `last` and `between`", () => {
  it("take a count and a unit, and two days or two numbers, for the columns they fit", () => {
    expect(said([{ column: "issued", op: "last", value: { count: 30, unit: "day" } }])).toEqual([]);
    expect(
      said([{ column: "issued", op: "between", value: ["2026-01-01", "2026-01-31"] }]),
    ).toEqual([]);
    expect(said([{ column: "total", op: "between", value: [10, 20] }])).toEqual([]);
  });

  it("refuse a value of the wrong shape", () => {
    for (const value of [
      { count: 0, unit: "day" },
      { count: 1001, unit: "day" },
      { count: 1.5, unit: "day" },
      { count: 3, unit: "decade" },
      "30 days",
      undefined,
    ]) {
      expect(said([{ column: "issued", op: "last", value }])[0]).toContain(`${path} "last" needs`);
    }
    for (const value of [["2026-01-01"], ["2026-02-30", "2026-03-01"], ["a", "b"], [1, "2"], 5]) {
      expect(said([{ column: "issued", op: "between", value }])[0]).toContain(
        `${path} "between" needs`,
      );
    }
    expect(
      said([{ column: "issued", op: "between", value: ["2026-02-01", "2026-01-01"] }]),
    ).toEqual([`${path} "between" ends before it begins`]);
  });

  it("refuse a column they do not fit", () => {
    expect(said([{ column: "total", op: "last", value: { count: 2, unit: "week" } }])).toEqual([
      `${path} "last" is for a date or a time, and "total" is of type integer`,
    ]);
    expect(said([{ column: "issued", op: "between", value: [1, 2] }])).toEqual([
      `${path} numbers do not fit a column of type date`,
    ]);
    expect(said([{ column: "total", op: "between", value: ["2026-01-01", "2026-01-02"] }])).toEqual(
      [`${path} days do not fit a column of type integer`],
    );
    expect(said([{ column: "status", op: "between", value: [1, 2] }])).toEqual([
      `${path} numbers do not fit a column of type enum`,
    ]);
  });
});
