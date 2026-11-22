import type { PageWidget } from "@volvel/manifest";
import { stat, text } from "@volvel/widgets-core";
import { expect, test } from "vitest";
import { type Catalog, withMoneyStart } from "./kit/inspector/model.ts";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      rows: 5,
      columns: [
        {
          name: "total",
          type: "integer",
          references: null,
          description: "What is owed, in cents.",
        },
        { name: "visits", type: "integer", references: null, description: "How many visits." },
      ],
    },
  ],
  queries: [],
  maySql: true,
};

const over = (column: string | undefined, config?: Record<string, unknown>): PageWidget => ({
  id: "s",
  type: "core/stat",
  at: { x: 0, y: 0, w: 3, h: 3 },
  data: {
    value: {
      source: {
        visual: {
          table: "invoices",
          measures: [
            column ? { fn: "sum", column, as: `sum_${column}` } : { fn: "count", as: "count" },
          ],
        },
      },
    },
  },
  ...(config ? { config } : {}),
});

test("a Stat given a column the table knows as money starts with the money format", () => {
  const next = withMoneyStart(over(undefined), over("total"), stat, catalog);
  expect(next.config?.format).toEqual({ style: "currency", currency: "USD", minorUnits: true });
});

test("a column that is not money, a format of its own, and one taken off stay as they are", () => {
  expect(withMoneyStart(over(undefined), over("visits"), stat, catalog).config).toBeUndefined();
  const own = over("total", { format: { style: "number" } });
  expect(withMoneyStart(over(undefined), own, stat, catalog)).toBe(own);
  // Nothing about the measured column changed: a format the person left off is not put back.
  const same = over("total");
  expect(withMoneyStart(same, { ...same, title: "Owed" }, stat, catalog).config).toBeUndefined();
});

test("a widget with no format setting is left alone", () => {
  const widget = { ...over("total"), type: "core/text" };
  expect(withMoneyStart(over(undefined), widget, text, catalog)).toBe(widget);
});
