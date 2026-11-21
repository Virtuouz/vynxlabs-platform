import { defineWidget, WidgetRegistry } from "@volvel/widgets";
import { coreRegistry } from "@volvel/widgets-core";
import { describe, expect, it } from "vitest";
import { registerPlatformKinds } from "./kinds.js";
import {
  checkDashboard,
  checkInterface,
  type InterfaceBody,
  newWidget,
  type PageWidget,
} from "./page.js";
import { KindRegistry } from "./registry.js";
import type { TableBody } from "./table.js";

const invoices: TableBody = {
  columns: {
    total: { type: "integer" },
    issued: { type: "date" },
    status: { type: "enum", values: ["paid", "unpaid"] },
    clinic: { type: "text" },
  },
} as unknown as TableBody;
const tableOf = (path: string) => (path === "invoices" ? invoices : undefined);

const chart: PageWidget = {
  id: "by-week",
  type: "core/chart",
  title: "Invoiced by week",
  at: { x: 0, y: 0, w: 8, h: 5 },
  data: {
    rows: {
      source: {
        visual: {
          table: "invoices",
          measures: [{ fn: "sum", column: "total", as: "total" }],
          groupBy: [{ column: "issued", bucket: "week" }],
        },
      },
      filters: [{ filter: "issued", column: "issued" }],
    },
  },
  config: { mark: "line", format: { style: "currency", minorUnits: true } },
};

const body = (widgets: PageWidget[]): InterfaceBody => ({
  title: "Clinic performance",
  pages: [
    {
      id: "money",
      title: "Money",
      filters: [{ name: "issued", type: "date_range", default: "last_30_days" }],
      widgets,
    },
  ],
});

const messages = (widgets: PageWidget[]) =>
  checkInterface(body(widgets), tableOf).map((issue) => `${issue.path} ${issue.message}`);

describe("pages", () => {
  it("passes the schema and the checks for a chart of the sum of Total by week", () => {
    const kinds = new KindRegistry();
    registerPlatformKinds(kinds);
    const result = kinds.validateManifest({
      kind: "interface",
      schemaVersion: 2,
      path: "screens/performance",
      workspace: "sandbox",
      ownership: "code",
      body: body([chart]),
    });
    expect(result.ok).toBe(true);
    expect(messages([chart])).toEqual([]);
  });

  it("refuses a type no pack declares, and draws nothing else of it", () => {
    expect(messages([{ ...chart, type: "core/gauge" }])).toEqual([
      '/body/pages/0/widgets/0/type there is no widget called "core/gauge"',
    ]);
  });

  it("checks config against the definition", () => {
    expect(messages([{ ...chart, config: { mark: "donut" } }])[0]).toMatch(/\/config\/mark/);
  });

  it("refuses SQL on an app's page, and allows it on a dashboard", () => {
    const sql: PageWidget = { ...chart, data: { rows: { source: { sql: "select 1 as n" } } } };
    expect(messages([sql])).toEqual([
      "/body/pages/0/widgets/0/data/rows/source SQL is written on dashboards, not on an app's page",
    ]);
    expect(checkDashboard({ widgets: [sql] }, tableOf)).toEqual([]);
  });

  it("counts values and breakdowns as the definition says", () => {
    const stat: PageWidget = {
      id: "unpaid",
      type: "core/stat",
      at: { x: 0, y: 0, w: 3, h: 3 },
      data: {
        value: {
          source: {
            visual: {
              table: "invoices",
              measures: [
                { fn: "sum", column: "total", as: "a" },
                { fn: "count", as: "b" },
              ],
            },
          },
        },
      },
    };
    expect(messages([stat])).toEqual([
      "/body/pages/0/widgets/0/data/value/source/visual/measures works out one value",
    ]);
  });

  it("names a column the table doesn't have, and a filter the page doesn't have", () => {
    const wrong: PageWidget = {
      ...chart,
      data: {
        rows: {
          source: {
            visual: {
              table: "invoices",
              measures: [{ fn: "sum", column: "totl", as: "t" }],
              groupBy: [{ column: "issued" }],
            },
          },
          filters: [{ filter: "clinic", column: "clinic" }],
        },
      },
    };
    expect(messages([wrong])).toEqual([
      '/body/pages/0/widgets/0/data/rows/source/visual/measures/0/column there is no column "totl" in the table "invoices"',
      '/body/pages/0/widgets/0/data/rows/filters/0/filter the page has no filter "clinic"',
    ]);
  });

  it("asks for a widget's data, and keeps it within its smallest size", () => {
    const { data: _data, ...bare } = chart;
    expect(messages([{ ...bare, at: { x: 0, y: 0, w: 2, h: 2 } }])).toEqual([
      "/body/pages/0/widgets/0/at Chart is at least 3 wide and 4 high",
      "/body/pages/0/widgets/0/data/rows Chart needs a source to show",
    ]);
  });

  it("knows a pack's widget only when it is in the registry it is checked against", () => {
    const goal = defineWidget({
      type: "trial/goal",
      version: "0.1.0",
      title: "Goal",
      description: "Progress toward a target",
      category: "understand",
      icon: "target",
      surfaces: ["app", "dashboard"],
      data: {},
      config: { type: "object", properties: {}, additionalProperties: false },
      events: {},
      layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
    });
    const widget: PageWidget = { id: "goal", type: "trial/goal", at: { x: 0, y: 0, w: 3, h: 3 } };
    expect(messages([widget])).toHaveLength(1);
    const registry = coreRegistry().add(goal);
    expect(checkInterface(body([widget]), tableOf, registry)).toEqual([]);
    expect(new WidgetRegistry([goal]).list("dashboard").map((d) => d.type)).toEqual(["trial/goal"]);
  });

  it("places a new widget at its default size below the others", () => {
    const definition = coreRegistry().get("core/stat");
    expect(definition && newWidget(definition, "s", [chart])).toEqual({
      id: "s",
      type: "core/stat",
      title: "Stat",
      at: { x: 0, y: 5, w: 3, h: 3 },
    });
  });
});
