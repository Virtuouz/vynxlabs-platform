import type { PageWidget } from "@vynxlabs/manifest";
import { describe, expect, test } from "vitest";
import {
  all,
  heading,
  linkDefaults,
  linkFilter,
  nextBucket,
  sortOf,
  summaryRows,
} from "./links.ts";

const at = { x: 0, y: 0, w: 6, h: 6 };
const widget = (more: Partial<PageWidget>): PageWidget => ({
  id: "w",
  type: "table",
  table: "orders",
  at,
  ...more,
});
const customers = widget({ id: "customers", table: "customers" });

describe("what a widget shows because of the row chosen in another", () => {
  test("a widget that follows nothing has no condition, and one that follows waits for a choice", () => {
    expect(linkFilter(widget({}), undefined, undefined)).toBeUndefined();
    const follows = widget({ link: { from: "customers", type: "refersTo", via: "customer" } });
    expect(linkFilter(follows, customers, undefined)).toBe("waiting");
    expect(linkFilter(follows, undefined, { id: "c1" })).toBe("waiting");
  });

  test("the chosen row itself", () => {
    expect(
      linkFilter(widget({ link: { from: "list", type: "same" } }), widget({ id: "list" }), {
        id: "o1",
      }),
    ).toEqual({ column: "id", op: "eq", value: "o1" });
  });

  test("the rows that refer to the chosen row, and what a new row among them is given", () => {
    const orders = widget({ link: { from: "customers", type: "refersTo", via: "customer" } });
    expect(linkFilter(orders, customers, { id: "c1" })).toEqual({
      column: "customer",
      op: "eq",
      value: "c1",
    });
    expect(linkDefaults(orders, { id: "c1" })).toEqual({ customer: "c1" });
    expect(linkDefaults(orders, undefined)).toEqual({});
    expect(linkDefaults(widget({ link: { from: "list", type: "same" } }), { id: "o1" })).toEqual(
      {},
    );
  });

  test("the row the chosen row refers to, or nothing when it refers to none", () => {
    const buyer = widget({
      table: "customers",
      link: { from: "orders", type: "referredBy", via: "customer" },
    });
    const orders = widget({ id: "orders" });
    expect(linkFilter(buyer, orders, { id: "o1", customer: "c9" })).toEqual({
      column: "id",
      op: "eq",
      value: "c9",
    });
    expect(linkFilter(buyer, orders, { id: "o1", customer: null })).toBe("nothing");
  });

  test("the rows behind a line of totals, a period as its first moment up to the next", () => {
    const totals = widget({
      id: "totals",
      summary: {
        groupBy: [{ column: "status" }, { column: "placed", bucket: "month" }],
        aggregates: [{ fn: "count", as: "orders" }],
      },
    });
    const behind = widget({ link: { from: "totals", type: "group" } });
    expect(linkFilter(behind, totals, { status: "open", placed: "2026-01-01", orders: 3 })).toEqual(
      {
        and: [
          { column: "status", op: "eq", value: "open" },
          { column: "placed", op: "gte", value: "2026-01-01" },
          { column: "placed", op: "lt", value: "2026-02-01" },
        ],
      },
    );
    // A group of rows with no value is the rows with no value.
    expect(linkFilter(behind, totals, { status: null, placed: null })).toEqual({
      and: [
        { column: "status", op: "is_null" },
        { column: "placed", op: "is_null" },
      ],
    });
    // Totals of everything are behind every row.
    const whole = widget({
      id: "totals",
      summary: { groupBy: [], aggregates: [{ fn: "count", as: "n" }] },
    });
    expect(linkFilter(behind, whole, { n: 4 })).toBeUndefined();
  });

  test("periods end where the next begins, in dates and in times", () => {
    expect(nextBucket("2026-01-31", "day")).toBe("2026-02-01");
    expect(nextBucket("2026-12-28", "week")).toBe("2027-01-04");
    expect(nextBucket("2026-12-01", "month")).toBe("2027-01-01");
    expect(nextBucket("2024-01-01", "year")).toBe("2025-01-01");
    expect(nextBucket("2026-01-01T00:00:00.000Z", "month")).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("totals and names", () => {
  const summary = {
    groupBy: [{ column: "status" }, { column: "placed", bucket: "month" as const }],
    aggregates: [
      { fn: "count" as const, as: "orders" },
      { fn: "sum" as const, column: "total", as: "value" },
    ],
  };

  test("a summary's lines become rows under the names its widget uses", () => {
    expect(
      summaryRows(summary, [
        {
          by: { status: "open", "placed:month": "2026-01-01" },
          values: { count: 2, "sum:total": 30 },
        },
      ]),
    ).toEqual([
      { status: "open", placed: "2026-01-01", orders: 2, value: 30, id: '["open","2026-01-01"]' },
    ]);
  });

  test("a sort is written as the API takes it", () => {
    expect(
      sortOf(widget({ sort: [{ column: "number" }, { column: "total", desc: true }] })),
    ).toEqual(["number", "-total"]);
    expect(
      sortOf(widget({ summary, sort: [{ column: "value", desc: true }, { column: "placed" }] })),
    ).toEqual(["-sum:total", "placed:month"]);
  });

  test("conditions join, and a name reads as a heading", () => {
    expect(all([undefined, undefined])).toBeUndefined();
    expect(all([{ column: "a" }, undefined])).toEqual({ column: "a" });
    expect(all([{ column: "a" }, { column: "b" }])).toEqual({
      and: [{ column: "a" }, { column: "b" }],
    });
    expect(heading("customer_id")).toBe("Customer id");
  });
});
