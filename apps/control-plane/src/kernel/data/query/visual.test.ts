import { describe, expect, test } from "vitest";
import { lastRange } from "./filters.js";
import { compileVisual, type VisualCatalog, VisualRefused } from "./visual.js";

const day = (text: string) => new Date(`${text}T15:30:00Z`);

describe("the days `last` counts", () => {
  test("are counted back from today, today included, and the first day counts", () => {
    expect(lastRange(1, "day", day("2026-11-21"))).toEqual({
      from: "2026-11-21",
      to: "2026-11-21",
    });
    expect(lastRange(30, "day", day("2026-11-21"))).toEqual({
      from: "2026-10-23",
      to: "2026-11-21",
    });
    expect(lastRange(2, "week", day("2026-11-21"))).toEqual({
      from: "2026-11-08",
      to: "2026-11-21",
    });
    expect(lastRange(1, "month", day("2026-11-21"))).toEqual({
      from: "2026-10-22",
      to: "2026-11-21",
    });
    expect(lastRange(1, "quarter", day("2026-11-21"))).toEqual({
      from: "2026-08-22",
      to: "2026-11-21",
    });
    expect(lastRange(1, "year", day("2026-11-21"))).toEqual({
      from: "2025-11-22",
      to: "2026-11-21",
    });
  });

  test("count calendar months, from a short month too, and the same days a page's last 30 days does", () => {
    expect(lastRange(1, "month", day("2026-03-31"))).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(lastRange(1, "year", day("2028-02-29"))).toEqual({
      from: "2027-03-01",
      to: "2028-02-29",
    });
    expect(lastRange(1, "month", day("2026-01-15"))).toEqual({
      from: "2025-12-16",
      to: "2026-01-15",
    });
  });
});

const catalog: VisualCatalog = new Map([
  [
    "loans",
    {
      columns: new Map([
        ["due", { type: "date", references: null }],
        ["fee", { type: "integer", references: null }],
        ["note", { type: "text", references: null }],
        ["device", { type: "reference", references: "devices" }],
      ]),
    },
  ],
  ["devices", { columns: new Map([["bought", { type: "timestamp", references: null }]]) }],
]);
const compile = (filters: object[], joins?: string[]) =>
  compileVisual(
    { table: "loans", columns: ["fee"], filters: filters as never, ...(joins ? { joins } : {}) },
    catalog,
    [],
    day("2026-11-21"),
  );
const refused = (filters: object[]) => {
  try {
    compile(filters);
  } catch (error) {
    if (error instanceof VisualRefused) return `${error.path} ${error.message}`;
    throw error;
  }
  throw new Error("was allowed");
};

describe("the operators `last` and `between` as SQL", () => {
  test("last is from the first day counted to the end of today, both as bound values", () => {
    const written = compile([{ column: "due", op: "last", value: { count: 30, unit: "day" } }]);
    expect(written.sql).toContain('(t."due" >= $1::date and t."due" < $2::date)');
    expect(written.parameters).toEqual(["2026-10-23", "2026-11-22"]);
  });

  test("between days includes the last day whole, and between numbers includes both", () => {
    const days = compile([{ column: "due", op: "between", value: ["2026-11-01", "2026-11-10"] }]);
    expect(days.parameters).toEqual(["2026-11-01", "2026-11-11"]);
    const numbers = compile([{ column: "fee", op: "between", value: [5, 30] }]);
    expect(numbers.sql).toContain('(t."fee" >= $1 and t."fee" <= $2)');
    expect(numbers.parameters).toEqual([5, 30]);
  });

  test("a joined column of a table it follows is read the same way", () => {
    const written = compile(
      [{ column: "device.bought", op: "last", value: { count: 1, unit: "week" } }],
      ["device"],
    );
    expect(written.sql).toContain('"j_device"."bought" >= $1::date');
    expect(written.parameters).toEqual(["2026-11-15", "2026-11-22"]);
  });

  test("a value that is not what the operator takes, or a column it does not fit, is refused saying where", () => {
    expect(refused([{ column: "due", op: "last", value: { count: 0, unit: "day" } }])).toContain(
      "/filters/0/value",
    );
    expect(refused([{ column: "due", op: "last", value: { count: 3, unit: "hour" } }])).toContain(
      '"last" needs',
    );
    expect(refused([{ column: "due", op: "last" }])).toContain("needs a value");
    expect(refused([{ column: "fee", op: "last", value: { count: 3, unit: "day" } }])).toContain(
      "is for a date or a time",
    );
    expect(
      refused([{ column: "due", op: "between", value: ["2026-11-10", "2026-11-01"] }]),
    ).toContain("ends before it begins");
    expect(
      refused([{ column: "due", op: "between", value: ["2026-11-01'; drop", "2026-11-02"] }]),
    ).toContain('"between" needs');
    expect(refused([{ column: "due", op: "between", value: [1, 2] }])).toContain("do not fit");
    expect(refused([{ column: "note", op: "between", value: [1, 2] }])).toContain("do not fit");
    expect(refused([{ column: "fee", op: "between", value: [1] }])).toContain('"between" needs');
  });
});
