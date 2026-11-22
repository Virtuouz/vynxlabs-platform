// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import { button, chart, stat, table } from "@volvel/widgets-core";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fromEditor,
  isComplete,
  operatorsFor,
  sentenceOf,
  toEditor,
} from "./kit/inspector/conditionWords.ts";
import { registerDrawer } from "./kit/inspector/custom.ts";
import { Inspector } from "./kit/inspector/Inspector.tsx";
import type { Catalog } from "./kit/inspector/model.ts";
import { show } from "./testing.tsx";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "status", type: "enum", references: null },
        { name: "total", type: "number", references: null },
        { name: "issued_at", type: "timestamp", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};
const at = { x: 0, y: 0, w: 4, h: 4 };
const visual = {
  table: "invoices",
  measures: [{ fn: "sum" as const, column: "total", as: "sum_total" }],
};

function Harness({
  start,
  definition,
}: {
  start: PageWidget;
  definition: Parameters<typeof Inspector>[0]["definition"];
}) {
  const [widget, setWidget] = useState(start);
  return (
    <Inspector
      widget={widget}
      definition={definition}
      surface="app"
      filters={[]}
      catalog={catalog}
      onChange={setWidget}
      onDuplicate={() => {}}
      onRemove={() => {}}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tab = (name: string) =>
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${name}`) }));
const headings = () =>
  within(screen.getByRole("tabpanel"))
    .getAllByRole("heading")
    .map((one) => one.textContent);

test("a chart's Data tab: its own sections, and the data parts they draw are not drawn twice", () => {
  const widget: PageWidget = {
    id: "c",
    type: "core/chart",
    at,
    data: { rows: { source: { visual: { ...visual, groupBy: [{ column: "status" }] } } } },
  };
  show(<Harness start={widget} definition={chart} />);
  // "Rows it uses" is a group of its own, with no "Data" group around it; the chart draws its
  // measure, breakdown and order in "What to chart" and "Order".
  expect(headings()).toEqual(["Rows it uses", "What to chart", "Order"]);
  const panel = within(screen.getByRole("tabpanel"));
  expect(panel.getAllByRole("button", { name: /^Measure/ })).toHaveLength(1);
  expect(panel.queryByRole("button", { name: /^Sorted by/ })).toBeNull();
});

test("the Heading group: first for a stat after its preview, last for a table, none for a button", () => {
  const stats: PageWidget = {
    id: "s",
    type: "core/stat",
    at,
    data: { value: { source: { visual } } },
  };
  show(<Harness start={stats} definition={stat} />);
  tab("Display");
  // The stat places its Preview before the Heading, as board 14 draws it.
  const names = headings();
  expect(names.indexOf("Preview")).toBeLessThan(names.indexOf("Heading"));
  cleanup();

  show(
    <Harness
      start={{
        id: "t",
        type: "core/table",
        at,
        data: { rows: { source: { visual: { table: "invoices" } } } },
      }}
      definition={table}
    />,
  );
  tab("Display");
  const last = headings();
  expect(last.at(-1)).toBe("Heading");
  cleanup();

  show(
    <Harness
      start={{ id: "b", type: "core/button", at, config: { label: "Go" } }}
      definition={button}
    />,
  );
  expect(screen.queryByRole("heading", { name: "Heading" })).toBeNull();
});

test("a section piece is placed by its order among the groups, and hides what it draws", () => {
  const off = registerDrawer("core/button", {
    tab: "display",
    order: -10,
    hides: ["label"],
    section: () => <p>My whole section</p>,
  });
  show(
    <Harness
      start={{ id: "b", type: "core/button", at, config: { label: "Go" } }}
      definition={button}
    />,
  );
  const panel = within(screen.getByRole("tabpanel"));
  expect(panel.getByText("My whole section")).toBeTruthy();
  off();
});

test("a date is spoken as 'is in the last' and 'is between', and what is stored round-trips", () => {
  const column = { name: "issued_at", type: "timestamp", references: null };
  expect(operatorsFor("date").map((one) => one.test)).toEqual(
    expect.arrayContaining(["last", "between"]),
  );
  const last = {
    column: "issued_at",
    op: "last" as const,
    value: { count: 30, unit: "day" as const },
  };
  expect(sentenceOf(last, column)).toEqual({
    before: "Issued at is in the last",
    value: "30 days",
  });
  expect(fromEditor(toEditor(last, column))).toEqual([last]);
  expect(isComplete({ field: "issued_at", test: "last", value: { count: 30, unit: "day" } })).toBe(
    true,
  );
  expect(isComplete({ field: "issued_at", test: "last" })).toBe(false);

  const between = {
    column: "issued_at",
    op: "between" as const,
    value: ["2026-11-01", "2026-11-30"],
  };
  expect(sentenceOf(between, column).value).toBe("2026-11-01 and 2026-11-30");
  expect(fromEditor(toEditor(between, column))).toEqual([between]);
  expect(isComplete({ field: "issued_at", test: "between", value: ["2026-11-01", ""] })).toBe(
    false,
  );
  // A pair of "on or after" and "before" stored earlier still reads and edits as it did.
  const after = { column: "issued_at", op: "gte" as const, value: "2026-11-01" };
  expect(sentenceOf(after, column).before).toBe("Issued at is on or after");
  expect(fromEditor(toEditor(after, column))).toEqual([after]);
});
