import { describe, expect, test } from "vitest";
import type { BundleManifest } from "./bundle.js";
import { checkBundleManifests } from "./bundle-check.js";
import type { InterfacePage, PageWidget } from "./interface.js";

const manifest = (kind: string, path: string, body: object): BundleManifest =>
  ({ kind, path, schemaVersion: 1, ownership: "ui", body }) as BundleManifest;

const customers = manifest("table", "customers", {
  columns: { name: { type: "text", required: true }, tier: { type: "text" } },
});
const orders = manifest("table", "orders", {
  columns: {
    number: { type: "text", required: true },
    total: { type: "number" },
    status: { type: "text" },
    placed: { type: "date" },
    extra: { type: "json" },
    customer: { type: "reference", references: "customers" },
  },
});
const at = { x: 0, y: 0, w: 6, h: 6 };
const widget = (id: string, more: Partial<PageWidget>): PageWidget => ({
  id,
  type: "table",
  table: "orders",
  at,
  ...more,
});
/** The problems of one page of widgets, over the two tables. */
const problems = (widgets: PageWidget[], extra: BundleManifest[] = [customers, orders]) =>
  checkBundleManifests([
    ...extra,
    manifest("interface", "screens/sales", {
      title: "Sales",
      pages: [{ id: "main", title: "Main", widgets } satisfies InterfacePage],
    }),
  ]);

describe("an interface", () => {
  test("a page of linked widgets over two tables holds together", () => {
    expect(
      problems([
        widget("customers", {
          table: "customers",
          fields: [{ column: "name" }, { column: "tier", label: "Tier" }],
          sort: [{ column: "name" }],
        }),
        // The orders of the customer chosen, with the customer shown by name.
        widget("orders", {
          fields: [
            { column: "number", editable: true },
            { column: "customer", show: "name" },
            { column: "created_at" },
          ],
          filter: { and: [{ column: "total", op: "gt", value: 0 }, { column: "status" }] },
          link: { from: "customers", type: "refersTo", via: "customer" },
          options: { allowAdd: true },
        }),
        // One order, beside the list it was chosen in, and the customer it points at.
        widget("order", { type: "card", link: { from: "orders", type: "same" } }),
        widget("buyer", {
          type: "card",
          table: "customers",
          link: { from: "orders", type: "referredBy", via: "customer" },
        }),
        // Totals by status, a chart of them by month, and the rows behind a chosen line.
        widget("by_status", {
          summary: {
            groupBy: [{ column: "status" }],
            aggregates: [
              { fn: "count", as: "orders" },
              { fn: "sum", column: "total", as: "value" },
            ],
          },
          fields: [{ column: "status" }, { column: "value", label: "Value" }],
          sort: [{ column: "value", desc: true }],
        }),
        widget("behind", { link: { from: "by_status", type: "group" } }),
        widget("trend", {
          type: "chart",
          summary: {
            groupBy: [{ column: "placed", bucket: "month" }, { column: "status" }],
            aggregates: [{ fn: "sum", column: "total", as: "value" }],
          },
          options: { mark: "line", x: "placed", y: "value", series: "status" },
          link: { from: "customers", type: "refersTo", via: "customer" },
        }),
        widget("add", {
          type: "form",
          fields: [{ column: "number" }, { column: "total" }],
          link: { from: "customers", type: "refersTo", via: "customer" },
          options: { submitLabel: "Add order", success: "Added." },
        }),
        { id: "note", type: "text", at, options: { text: "Orders by customer." } },
      ]),
    ).toEqual([]);
  });

  test("what a widget names must be there", () => {
    const said = (widgets: PageWidget[]) => problems(widgets).join("\n");
    expect(said([widget("a", { fields: [{ column: "nope" }] })])).toContain(
      'there is no column "nope" in the table "orders"',
    );
    expect(said([widget("a", { sort: [{ column: "nope" }] })])).toContain("there is no column");
    expect(said([widget("a", { filter: { column: "nope", op: "eq", value: 1 } })])).toContain(
      "there is no column",
    );
    expect(said([widget("a", { filter: { column: "total", op: "like", value: 1 } })])).toContain(
      'there is no operator "like"',
    );
    expect(said([widget("a", { fields: [{ column: "number", show: "name" }] })])).toContain(
      '"number" does not refer to another table',
    );
    expect(said([widget("a", { fields: [{ column: "customer", show: "nope" }] })])).toContain(
      'there is no column "nope" in the table "customers"',
    );
    expect(said([widget("a", {}), widget("a", {})])).toContain('"a" is used twice');
    expect(said([{ id: "t", type: "text", at }])).toContain("a text widget needs its text");
    expect(said([{ id: "t", type: "card", at }])).toContain("a card widget needs a table");
    expect(said([widget("f", { type: "form" })])).toContain("a form needs at least one field");
    // A table that is in no bundle was made in the console, and is not checked here.
    expect(
      problems([widget("a", { table: "made/in-console", fields: [{ column: "x" }] })]),
    ).toEqual([]);
    // A path that is something else is.
    expect(
      problems(
        [widget("a", { table: "screens/other" })],
        [
          manifest("interface", "screens/other", {
            title: "Other",
            pages: [{ id: "p", title: "P", widgets: [] }],
          }),
        ],
      ).join("\n"),
    ).toContain('shows "screens/other", which is an interface, not a table');
  });

  test("totals are of things that can be totalled, and a chart draws what its widget has", () => {
    const summary = (more: object) =>
      problems([
        widget("s", {
          summary: {
            groupBy: [{ column: "status" }],
            aggregates: [{ fn: "count", as: "n" }],
            ...more,
          },
        }),
      ]).join("\n");
    expect(summary({ aggregates: [{ fn: "sum", column: "status", as: "n" }] })).toContain(
      '"sum" works on numbers, and "status" holds text',
    );
    expect(summary({ aggregates: [{ fn: "avg", as: "n" }] })).toContain('"avg" needs a column');
    expect(summary({ groupBy: [{ column: "extra" }] })).toContain(
      "rows cannot be grouped by a json column",
    );
    expect(summary({ groupBy: [{ column: "status", bucket: "month" }] })).toContain(
      '"status" is not a date or a time',
    );
    expect(summary({ aggregates: [{ fn: "count", as: "status" }] })).toContain(
      "two of its groups and totals have the same name",
    );
    expect(
      problems([
        widget("s", {
          summary: { groupBy: [{ column: "status" }], aggregates: [{ fn: "count", as: "n" }] },
          fields: [{ column: "total" }],
        }),
      ]).join("\n"),
    ).toContain('"total" is not one of this widget\'s groups or totals');
    expect(
      problems([
        widget("c", {
          type: "card",
          summary: { groupBy: [], aggregates: [{ fn: "count", as: "n" }] },
        }),
      ]).join("\n"),
    ).toContain("only a table, a chart or a figure can show totals");
    expect(problems([widget("c", { type: "chart" })]).join("\n")).toContain(
      "a chart needs a shape",
    );
    expect(
      problems([
        widget("c", { type: "chart", options: { mark: "bar", x: "status", y: "nope" } }),
      ]).join("\n"),
    ).toContain('there is no column "nope"');
  });

  test("a link must be one that can be followed", () => {
    const linked = (
      link: NonNullable<PageWidget["link"]>,
      source: Partial<PageWidget> = {},
      more = {},
    ) =>
      problems([
        widget("src", { table: "customers", ...source }),
        widget("dst", { link, ...more }),
      ]).join("\n");
    expect(linked({ from: "nobody", type: "same" })).toContain('there is no other widget "nobody"');
    expect(linked({ from: "dst", type: "same" })).toContain('there is no other widget "dst"');
    expect(linked({ from: "src", type: "same" })).toContain('"src" is over another table');
    expect(linked({ from: "src", type: "refersTo" })).toContain(
      "says which column joins the two tables",
    );
    expect(linked({ from: "src", type: "refersTo", via: "number" })).toContain(
      '"number" of "orders" does not refer to the table "customers"',
    );
    expect(linked({ from: "src", type: "referredBy", via: "customer" })).toContain(
      'there is no column "customer" in the table "customers"',
    );
    expect(linked({ from: "src", type: "group" })).toContain('"src" shows rows, not totals');
    expect(
      linked({ from: "src", type: "same" }, { type: "form", fields: [{ column: "name" }] }),
    ).toContain("a row cannot be chosen in a form widget");
    const totals = {
      table: "orders",
      summary: { groupBy: [{ column: "status" }], aggregates: [{ fn: "count" as const, as: "n" }] },
    };
    expect(linked({ from: "src", type: "same" }, totals)).toContain(
      'shows totals, which only a "group" link can follow',
    );
    expect(linked({ from: "src", type: "group" }, totals, totals)).toContain(
      "totals cannot follow a line of other totals",
    );
    // Two widgets that each follow the other would never settle.
    expect(
      problems([
        widget("a", { link: { from: "b", type: "same" } }),
        widget("b", { link: { from: "a", type: "same" } }),
      ]).join("\n"),
    ).toContain("its links go round in a circle");
  });

  test("an app serves files of its own or an interface, and the interface must be there", () => {
    const screen = manifest("interface", "screens/sales", {
      title: "Sales",
      pages: [{ id: "main", title: "Main", widgets: [] }],
    });
    expect(
      checkBundleManifests([
        screen,
        manifest("app", "sales", { title: "Sales", interface: "screens/sales" }),
      ]),
    ).toEqual([]);
    expect(
      checkBundleManifests([
        manifest("app", "sales", { title: "Sales", interface: "screens/gone" }),
      ]).join("\n"),
    ).toContain('interface refers to "screens/gone", which is not an interface');
    // Neither, and both, are refused.
    expect(checkBundleManifests([manifest("app", "sales", { title: "Sales" })])).not.toEqual([]);
    expect(
      checkBundleManifests([
        screen,
        manifest("app", "sales", {
          title: "Sales",
          entry: "index.html",
          interface: "screens/sales",
        }),
      ]),
    ).not.toEqual([]);
  });

  test("an interface has limits", () => {
    const pages = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ id: `p${index}`, title: "P", widgets: [] }));
    const check = (body: object) => checkBundleManifests([manifest("interface", "s", body)]);
    expect(check({ title: "S", pages: pages(20) })).toEqual([]);
    expect(check({ title: "S", pages: pages(21) })).not.toEqual([]);
    expect(check({ title: "S", pages: [] })).not.toEqual([]);
    expect(check({ title: "S", pages: [...pages(1), ...pages(1)] }).join("\n")).toContain(
      '"p0" is used twice',
    );
    const many = Array.from({ length: 13 }, (_, index) => widget(`w${index}`, {}));
    expect(check({ title: "S", pages: [{ id: "p", title: "P", widgets: many }] })).not.toEqual([]);
    expect(
      check({
        title: "S",
        pages: [
          {
            id: "p",
            title: "P",
            widgets: [{ ...widget("w", {}), at: { x: 12, y: 0, w: 1, h: 1 } }],
          },
        ],
      }),
    ).not.toEqual([]);
    expect(
      check({
        title: "S",
        pages: [{ id: "p", title: "P", widgets: [{ ...widget("w", {}), script: "x" }] }],
      }),
    ).not.toEqual([]);
  });
});
