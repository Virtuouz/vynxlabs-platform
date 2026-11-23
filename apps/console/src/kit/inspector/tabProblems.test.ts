import type { PageWidget } from "@volvel/manifest";
import { chart, table } from "@volvel/widgets-core";
import { expect, test } from "vitest";
import type { Catalog } from "./model.ts";
import { actionFix, inTab, refusalsFor, tabProblems } from "./tabProblems.ts";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "number", type: "text", references: null },
        { name: "total", type: "number", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};
const at = { x: 0, y: 0, w: 6, h: 4 };
const read = (visual: object): NonNullable<PageWidget["data"]> =>
  ({ rows: { source: { visual } } }) as never;

test("nothing wrong, nothing to fix: whatever is set", () => {
  const widget: PageWidget = {
    id: "t",
    type: "core/table",
    at,
    title: "Invoices",
    data: read({ table: "invoices", columns: ["number"] }),
    on: { click: { steps: [{ do: "say", message: "hi" }] } as never },
  };
  expect(tabProblems({ widget, definition: table, catalog })).toEqual([]);
});

test("a table or a column that is gone is the Data tab's", () => {
  const gone: PageWidget = { id: "t", type: "core/table", at, data: read({ table: "nope" }) };
  expect(inTab(tabProblems({ widget: gone, definition: table, catalog }), "data")).toEqual([
    "Source: the table nope no longer exists.",
  ]);
  const column: PageWidget = {
    id: "t",
    type: "core/table",
    at,
    data: read({ table: "invoices", columns: ["number", "paid_on"] }),
  };
  expect(inTab(tabProblems({ widget: column, definition: table, catalog }), "data")).toEqual([
    "Columns: paid_on is not in invoices any more.",
  ]);
  // Until the workspace's tables are read, nothing can be said to be gone.
  expect(
    tabProblems({ widget: gone, definition: table, catalog: { ...catalog, tables: [] } }),
  ).toEqual([]);
});

test("a summary with no values is the Data tab's; a list with nothing placed is Display's", () => {
  const stat: PageWidget = {
    id: "c",
    type: "core/chart",
    at,
    data: read({ table: "invoices" }),
  };
  expect(inTab(tabProblems({ widget: stat, definition: chart, catalog }), "data")[0]).toMatch(
    /needs a value worked out/,
  );
});

test("an action with no steps, or with an unlabelled button, is the Actions tab's", () => {
  const widget: PageWidget = {
    id: "t",
    type: "core/table",
    at,
    on: { click: { steps: [] } as never },
    config: { rowActions: [{ id: "a", action: { steps: [{ do: "say", message: "x" }] } }] },
  };
  const found = inTab(tabProblems({ widget, definition: table, catalog }), "actions");
  expect(found).toContain("When click has no steps yet.");
  expect(found.some((one) => /Row action 1 has no label/.test(one))).toBe(true);
});

test("a group that is gone is the Rules tab's, when the groups are known", () => {
  const widget: PageWidget = {
    id: "t",
    type: "core/table",
    at,
    rules: { seenBy: { groups: ["groups/ghosts"] } } as never,
  };
  expect(tabProblems({ widget, definition: table, catalog, groups: undefined })).toEqual([]);
  expect(
    inTab(tabProblems({ widget, definition: table, catalog, groups: ["groups/staff"] }), "rules"),
  ).toHaveLength(1);
});

test("what the server refused is put on the tab its place is fixed in", () => {
  const pages = [
    { id: "home", title: "Home", widgets: [{ id: "t", type: "core/table", at }] },
  ] as never;
  const refused = refusalsFor(
    [
      {
        path: "/body/pages/0/widgets/0/config/rowActions/0/action/steps",
        message: "must NOT have fewer than 1 items",
      },
      {
        path: "/body/pages/0/widgets/0/config/density",
        message: "must be equal to one of the allowed values",
      },
      { path: "/body/pages/1/widgets/0/config/x", message: "elsewhere" },
    ],
    pages,
    "home",
    "t",
  );
  expect(refused).toHaveLength(2);
  const widget: PageWidget = { id: "t", type: "core/table", at };
  const found = tabProblems({ widget, definition: table, catalog, refusals: refused });
  expect(found.map((one) => one.tab)).toEqual(["actions", "display"]);
});

test("an action that starts a flow or script without what it needs says so before publishing", () => {
  const action = (input: object) =>
    ({
      steps: [
        { do: "flow", path: "flows/strict", input },
        { do: "script", path: "strict-script" },
      ],
    }) as never;
  const world = {
    catalog,
    flows: [{ path: "flows/strict", manualInput: { required: ["why"] } }],
    scripts: [{ path: "strict-script", inputSchema: { required: ["why"] } }],
  };
  expect(actionFix(action({}), world)).toContain("starts flows/strict without why, which it needs");
  expect(actionFix({ steps: [{ do: "script", path: "strict-script" }] } as never, world)).toContain(
    "runs strict-script without why, which it needs",
  );
  expect(
    actionFix(
      { steps: [{ do: "flow", path: "flows/strict", input: { why: { asked: "why" } } }] } as never,
      world,
    ),
  ).toBeUndefined();
});
