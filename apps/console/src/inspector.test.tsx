// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PageFilter, PageWidget } from "@volvel/manifest";
import { defineWidget, type WidgetDefinition } from "@volvel/widgets";
import { chart, stat, text } from "@volvel/widgets-core";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { registerDrawer } from "./kit/inspector/custom.ts";
import { Inspector } from "./kit/inspector/Inspector.tsx";
import {
  bindFilter,
  type Catalog,
  clampPlace,
  settleOnGrid,
  tabsOf,
  withoutWidget,
} from "./kit/inspector/model.ts";
import { EditOnPage } from "./kit/markdown/onThePage.ts";
import { show } from "./testing.tsx";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "number", type: "text", references: null },
        { name: "total", type: "number", references: null },
        { name: "status", type: "enum", references: null },
        { name: "issued_at", type: "timestamp", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};

const place = { x: 0, y: 0, w: 6, h: 6 };
/** The visual query of a widget's `rows` input. */
const queryOf = (widget: PageWidget | undefined) => {
  const source = widget?.data?.rows?.source;
  if (!source || !("visual" in source)) throw new Error("it reads no table");
  return source.visual;
};
const chartWidget = (): PageWidget => ({
  id: "by-week",
  type: "core/chart",
  title: "Invoiced by week",
  at: place,
  config: { mark: "bar", legend: "auto" },
  data: {
    rows: {
      source: {
        visual: {
          table: "invoices",
          measures: [{ fn: "count", as: "count" }],
          groupBy: [{ column: "issued_at", bucket: "week" }],
        },
      },
    },
  },
});

/** A tab by its name: a tab with something set says so after its name. */
const tabByName = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });
const tabNames = () =>
  screen.getAllByRole("tab").map((one) => (one.textContent ?? "").replace(/, has settings$/, ""));
/** Opens the row of a setting in the drawer, and returns its editor. */
const openRow = (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
  return screen.findByRole("dialog");
};

/** The inspector around a widget that is kept, as the editor keeps one. */
let written: PageWidget[];
function Harness({
  start,
  definition,
  surface = "app",
  filters = [],
  groups = [],
  endUserGroups = [],
}: {
  start: PageWidget;
  definition: WidgetDefinition | undefined;
  surface?: "app" | "dashboard";
  filters?: PageFilter[];
  groups?: string[];
  endUserGroups?: string[];
}) {
  const [widget, setWidget] = useState(start);
  return (
    <Inspector
      widget={widget}
      definition={definition}
      surface={surface}
      filters={filters}
      catalog={catalog}
      groups={groups}
      endUserGroups={endUserGroups}
      onChange={(next) => {
        written.push(next);
        setWidget(next);
      }}
      onDuplicate={() => {}}
      onRemove={() => {}}
      rowRules={(table) => `/t/t/workspaces/w/tables/${table}?view=definition`}
    />
  );
}

beforeEach(() => {
  written = [];
  // The catalog is given; nothing here reads the workspace.
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("every drawer has the same header, the tabs its widget has, and its settings in groups", () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  // The header: the name, the kind, and a ⋯ menu.
  expect(screen.getByRole("heading", { name: "Invoiced by week" })).toBeTruthy();
  expect(screen.getByText("Chart")).toBeTruthy();
  expect(screen.getByRole("button", { name: "More about Invoiced by week" })).toBeTruthy();
  expect(tabNames()).toEqual(["Data", "Display", "Actions", "Rules"]);
  // The data parts are in the order the definition gives, in a group named for them.
  const panel = within(screen.getByRole("tabpanel"));
  expect(panel.getByRole("heading", { name: "Data" })).toBeTruthy();
  const text = screen.getByRole("tabpanel").textContent ?? "";
  const at = (name: string) => text.indexOf(name);
  expect(at("Rows it uses")).toBeLessThan(at("What it shows"));
  expect(at("Source")).toBeLessThan(at("Only include"));
  expect(at("Only include")).toBeLessThan(at("Sorted by"));
  expect(text).not.toContain("More data options");
  // The source is the table the widget reads, as a row.
  expect(panel.getByRole("button", { name: /Source\s*Invoices/ })).toBeTruthy();
  // The repeated note about size and position is gone: Layout is in the ⋯ menu.
  expect(screen.queryByText(/Size and position live on the page/)).toBeNull();
});

test("a dot marks a tab that has something set, and none marks one that has nothing", () => {
  const empty: PageWidget = { id: "by-week", type: "core/chart", at: place };
  show(<Harness start={empty} definition={chart} />);
  expect(screen.queryAllByText(/has settings/)).toHaveLength(0);
  cleanup();
  // Data bound, a setting off its default, an action and a rule each light their tab.
  const set: PageWidget = {
    ...chartWidget(),
    title: "Weekly",
    config: { mark: "line" },
    on: { click: { do: [{ do: "say", message: "Hi" }] } as never },
    rules: { showWhen: [{ left: "this.status", op: "eq", value: "paid" }] as never },
  };
  show(<Harness start={set} definition={chart} />);
  for (const name of ["Data", "Display", "Actions", "Rules"]) {
    expect(tabByName(name).textContent).toContain("has settings");
  }
});

test("settings are drawn in the group their hint names, in order, and a row opens its editor", async () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(tabByName("Display"));
  const headings = within(screen.getByRole("tabpanel"))
    .getAllByRole("heading")
    .map((one) => one.textContent);
  // "Title" is every widget's; the hints' groups follow in the order of their first setting.
  expect(headings[0]).toBe("Title");
  expect(headings.indexOf("Chart type")).toBeLessThan(headings.indexOf("Look"));
  // The numbers' format is a row with its value; opening it shows the control, and it writes.
  const row = screen.getByRole("button", { name: /^Numbers/ });
  expect(row.textContent).toContain("As it comes");
  fireEvent.click(row);
  const editor = await screen.findByRole("dialog");
  fireEvent.click(within(editor).getByRole("button", { name: /As it comes/ }));
  fireEvent.change(within(editor).getByLabelText("Written as"), { target: { value: "percent" } });
  expect((written.at(-1) as PageWidget).config?.format).toEqual({ style: "percent" });
});

test("a Title row writes the title, and says what it is now", async () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(tabByName("Display"));
  expect(screen.getByRole("button", { name: /^Title/ }).textContent).toContain("Invoiced by week");
  await openRow("Title");
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Weekly" } });
  expect((written.at(-1) as PageWidget).title).toBe("Weekly");
});

test("a widget type's registered piece is drawn in its group, in order, and hides the setting it replaces", () => {
  const off = registerDrawer("core/chart", {
    tab: "display",
    group: "Mine",
    order: -1,
    hides: ["mark"],
    render: () => <p>Custom piece</p>,
  });
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(tabByName("Display"));
  const panel = within(screen.getByRole("tabpanel"));
  expect(panel.getByText("Custom piece")).toBeTruthy();
  expect(panel.queryByLabelText("Bar")).toBeNull();
  const headings = panel.getAllByRole("heading").map((one) => one.textContent);
  expect(headings.indexOf("Mine")).toBeLessThan(headings.indexOf("Look"));
  off();
});

/** Opens the editor of the row with this label, in the portal beside it. */
const openData = async (name: RegExp) => {
  fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name }));
  return within(await screen.findByRole("dialog"));
};

test("choosing Sum of Total as the value writes the first measure", async () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  const editor = await openData(/^Measure/);
  fireEvent.change(editor.getByLabelText("What it works out"), { target: { value: "sum" } });
  const last = written.at(-1) as PageWidget;
  // A sum is of a number: the first one the table has is chosen, and the value is named for what it is.
  expect(queryOf(last).measures?.[0]).toEqual({ fn: "sum", column: "total", as: "sum_total" });
  expect(editor.getByLabelText("Column it works on")).toBeTruthy();
  // The row says it in words, and the breakdown is left as it was.
  expect(screen.getByRole("button", { name: /Measure\s*Sum of Total/ })).toBeTruthy();
  expect(queryOf(last).groupBy).toEqual([{ column: "issued_at", bucket: "week" }]);
});

test("a widget that named the value by its old name names it by the new one", async () => {
  const start = chartWidget();
  start.config = { ...start.config, y: "count" };
  show(<Harness start={start} definition={chart} />);
  const editor = await openData(/^Measure/);
  fireEvent.change(editor.getByLabelText("What it works out"), { target: { value: "sum" } });
  expect((written.at(-1) as PageWidget).config?.y).toBe("sum_total");
});

test("a condition is added from the dashed chip as column, test and value", async () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(screen.getByRole("button", { name: "Condition" }));
  const editor = within(await screen.findByRole("dialog"));
  // The first choice column is offered; the words are the column's own.
  expect((editor.getByLabelText("Field") as HTMLSelectElement).value).toBe("status");
  fireEvent.click(editor.getByLabelText("is not"));
  fireEvent.change(editor.getByLabelText("Value"), { target: { value: "paid" } });
  // Nothing is written until it is added.
  expect(written).toEqual([]);
  fireEvent.click(editor.getByRole("button", { name: "Add" }));
  expect(queryOf(written.at(-1)).filters).toEqual([{ column: "status", op: "ne", value: "paid" }]);
  expect(screen.getByRole("button", { name: "Status is not paid" })).toBeTruthy();
});

test("a setting that depends on another is shown only while it holds", () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(tabByName("Display"));
  // The chart is bars: they may lie down.
  expect(screen.getByLabelText("Bars lie down")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Line"));
  expect(screen.queryByLabelText("Bars lie down")).toBeNull();
  fireEvent.click(screen.getByLabelText("Bar"));
  expect(screen.getByLabelText("Bars lie down")).toBeTruthy();
  expect((written.at(-1) as PageWidget).config?.mark).toBe("bar");
});

test("a tab with nothing in it is hidden", async () => {
  const note: PageWidget = { id: "note", type: "core/text", at: { x: 0, y: 0, w: 6, h: 2 } };
  show(<Harness start={note} definition={text} />);
  // A note reads nothing and raises nothing.
  // The Text's own words tab is called Content.
  expect(tabNames()).toEqual(["Content", "Rules"]);
  expect(tabsOf(text)).toEqual(["display", "rules"]);
  // Its text is a Markdown editor with a preview.
  fireEvent.change(await screen.findByLabelText("Text"), { target: { value: "# Hello" } });
  expect(written.at(-1)?.config?.text).toBe("# Hello");
  expect(screen.getByLabelText("Preview of the text")).toBeTruthy();
});

test("a Text widget's drawer offers to write it on the page, where the canvas can", async () => {
  const note: PageWidget = { id: "note", type: "core/text", at: { x: 0, y: 0, w: 6, h: 2 } };
  const edit = vi.fn();
  show(
    <EditOnPage.Provider value={edit}>
      <Harness start={note} definition={text} />
    </EditOnPage.Provider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Edit on the page/ }));
  expect(edit).toHaveBeenCalledWith("note");
  cleanup();
  // Where there is no canvas to write on, the button is not there.
  show(<Harness start={note} definition={text} />);
  await screen.findByLabelText("Text");
  expect(screen.queryByRole("button", { name: /Edit on the page/ })).toBeNull();
});

test("a widget from a pack no code here knows is drawn from its definition", () => {
  const labs = defineWidget({
    type: "labs/x",
    version: "0.1.0",
    title: "Gauge",
    description: "A dial",
    category: "understand",
    icon: "gauge",
    surfaces: ["app", "dashboard"],
    data: {},
    config: {
      type: "object",
      properties: {
        size: {
          type: "integer",
          minimum: 1,
          maximum: 9,
          "x-volvel": { tab: "display", control: "number", label: "Size", order: 1 },
        },
        loud: {
          type: "boolean",
          "x-volvel": { tab: "display", control: "switch", label: "Loud", order: 2 },
        },
        shade: {
          enum: ["warm", "cool"],
          "x-volvel": {
            tab: "display",
            control: "segmented",
            label: "Shade",
            choices: { warm: "Warm", cool: "Cool" },
            when: { loud: true },
            order: 3,
          },
        },
      },
    },
    events: { tap: { gives: "nothing", label: "When it is tapped" } },
    layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
  });
  show(
    <Harness
      start={{ id: "g", type: "labs/x", at: { x: 0, y: 0, w: 3, h: 3 } }}
      definition={labs}
    />,
  );
  // The pack is named beside its kind.
  expect(screen.getByText("Gauge · Labs pack")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Size/ }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Size" }), { target: { value: "5" } });
  expect(written.at(-1)?.config?.size).toBe(5);
  expect(screen.queryByLabelText("Warm")).toBeNull();
  fireEvent.click(screen.getByLabelText("Loud"));
  expect(written.at(-1)?.config?.loud).toBe(true);
  expect(screen.getByLabelText("Warm")).toBeTruthy();
  // Its event is listed in Actions, read only.
  fireEvent.click(tabByName("Actions"));
  expect(screen.getByText("When it is tapped")).toBeTruthy();
});

test("a widget no pack declares is said so, and can be removed", () => {
  show(
    <Harness
      start={{ id: "g", type: "labs/gone", at: { x: 0, y: 0, w: 3, h: 3 } }}
      definition={undefined}
    />,
  );
  expect(screen.getByText(/There is no widget called “labs\/gone”/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Remove it/ })).toBeTruthy();
});

test("Rules says who sees it and where the row rules are, and that hiding is not security", () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(tabByName("Rules"));
  expect(screen.getByText("Always")).toBeTruthy();
  expect(screen.getByText("Everyone who can open the app")).toBeTruthy();
  expect(screen.getByText(/Hiding a widget isn’t security/)).toBeTruthy();
  const link = screen.getByRole("link", { name: "Open row rules" });
  expect(link.getAttribute("href")).toBe("/t/t/workspaces/w/tables/invoices?view=definition");
});

test("Layout gives the exact column, row, width and height, held to what the widget allows", async () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(screen.getByRole("button", { name: "More about Invoiced by week" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Layout/ }));
  expect(screen.getByRole("button", { name: /Back to settings/ })).toBeTruthy();
  // A chart is at least 3 wide: a width of 1 is held at 3. At column 11 a width of 6 would run off.
  fireEvent.change(screen.getByLabelText("Width"), { target: { value: "1" } });
  expect(written.at(-1)?.at.w).toBe(3);
  fireEvent.change(screen.getByLabelText("Column"), { target: { value: "12" } });
  expect(written.at(-1)?.at).toMatchObject({ x: 9, w: 3 });
  fireEvent.click(screen.getByRole("button", { name: /Back to settings/ }));
  await waitFor(() => expect(tabByName("Data")).toBeTruthy());
});

const openLayout = async () => {
  fireEvent.click(screen.getByRole("button", { name: "More about Invoiced by week" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Layout/ }));
};

test("Layout writes a tablet and a phone as Automatic or Custom, what narrow screens do, and a priority", async () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  await openLayout();
  expect(screen.getByRole("heading", { name: "Invoiced by week" })).toBeTruthy();
  expect(screen.getByText("Chart · Layout")).toBeTruthy();
  // Both start Automatic: nothing is stored.
  expect(written.length).toBe(0);
  // Custom stores the place the automatic one was; the phone's is one full-width row.
  fireEvent.click(within(screen.getByRole("group", { name: "Phone" })).getByText("Custom"));
  expect(written.at(-1)?.layout?.phone?.at).toEqual({ x: 0, y: 0, w: 12, h: 6 });
  fireEvent.click(within(screen.getByRole("group", { name: "Tablet" })).getByText("Custom"));
  expect(written.at(-1)?.layout?.tablet?.at).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  // A custom place has numbers of its own, held to what the widget allows.
  fireEvent.change(screen.getByLabelText("Phone width"), { target: { value: "1" } });
  expect(written.at(-1)?.layout?.phone?.at.w).toBe(3);
  // Automatic takes it away again, and leaves the other alone.
  fireEvent.click(within(screen.getByRole("group", { name: "Phone" })).getByText("Automatic"));
  expect(written.at(-1)?.layout?.phone).toBeUndefined();
  expect(written.at(-1)?.layout?.tablet).toBeDefined();
  fireEvent.click(within(screen.getByRole("group", { name: "Tablet" })).getByText("Automatic"));
  expect(written.at(-1)?.layout).toBeUndefined();
  fireEvent.click(
    within(screen.getByRole("group", { name: "On narrow screens" })).getByText("Stack"),
  );
  expect(written.at(-1)?.layout?.narrow).toBe("stack");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Priority" }), {
    target: { value: "2" },
  });
  expect(written.at(-1)?.layout).toEqual({ narrow: "stack", priority: 2 });
});

test("a place typed in Layout is settled as the canvas settles it", async () => {
  const other: PageWidget = { id: "other", type: "core/text", at: { x: 0, y: 6, w: 6, h: 2 } };
  const all = [chartWidget(), other];
  const settled: PageWidget[][] = [];
  show(
    <Inspector
      widget={all[0] as PageWidget}
      definition={chart}
      surface="app"
      filters={[]}
      catalog={catalog}
      widgets={all}
      onChange={() => {}}
      onChangeWidgets={(next) => settled.push(next)}
      onDuplicate={() => {}}
      onRemove={() => {}}
    />,
  );
  await openLayout();
  // Moved down onto the other widget: that one is pushed out of the way, and rises above.
  fireEvent.change(screen.getByLabelText("Row"), { target: { value: "7" } });
  const next = settled.at(-1) as PageWidget[];
  expect(next.find((one) => one.id === "by-week")?.at.y).toBe(6);
  // What was under it rises into the room it leaves.
  expect(next.find((one) => one.id === "other")?.at.y).toBe(0);
});

test("a choice with numbers writes numbers, and tiles, a position, an icon and groups write what they show", async () => {
  const labs = defineWidget({
    type: "labs/y",
    version: "0.1.0",
    title: "Thing",
    description: "A thing",
    category: "understand",
    icon: "gauge",
    surfaces: ["app", "dashboard"],
    data: {},
    defaults: { across: 1, place: "middle-center" },
    config: {
      type: "object",
      properties: {
        across: {
          enum: [1, 2, 3],
          "x-volvel": {
            tab: "display",
            group: "Look",
            control: "segmented",
            label: "Fields across",
            choices: { "1": "1", "2": "2", "3": "3" },
          },
        },
        look: {
          enum: ["plain", "note"],
          "x-volvel": {
            tab: "display",
            group: "Look",
            control: "tiles",
            label: "Style",
            choices: { plain: "Plain", note: "Note" },
          },
        },
        place: {
          enum: ["top-left", "middle-center", "bottom-right"],
          "x-volvel": {
            tab: "display",
            group: "Look",
            control: "position",
            label: "Position in its cell",
          },
        },
        icon: {
          type: "string",
          "x-volvel": { tab: "display", group: "Look", control: "icon", label: "Icon" },
        },
        who: {
          type: "array",
          items: { type: "string" },
          "x-volvel": { tab: "display", group: "Who", control: "groups", label: "Who" },
        },
      },
    },
    events: {},
    layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
  });
  show(
    <Harness
      start={{ id: "t", type: "labs/y", at: { x: 0, y: 0, w: 3, h: 3 } }}
      definition={labs}
      groups={["Billing"]}
      endUserGroups={["Pet owners"]}
    />,
  );
  fireEvent.click(tabByName("Display"));
  fireEvent.click(screen.getByLabelText("2"));
  expect(written.at(-1)?.config?.across).toBe(2);
  fireEvent.click(screen.getByLabelText("Note"));
  expect(written.at(-1)?.config?.look).toBe("note");
  fireEvent.click(screen.getByRole("radio", { name: "Bottom right" }));
  expect(written.at(-1)?.config?.place).toBe("bottom-right");
  // The icon is a row that opens a picker of the curated icons, shown by name.
  fireEvent.click(screen.getByRole("button", { name: /^Icon/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Star" }));
  expect(written.at(-1)?.config?.icon).toBe("star");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // Groups: member and end-user groups by their names.
  fireEvent.click(screen.getByRole("button", { name: /^Who/ }));
  fireEvent.click(await screen.findByLabelText("Pet owners"));
  fireEvent.click(screen.getByLabelText("Billing"));
  expect(written.at(-1)?.config?.who).toEqual(["Pet owners", "Billing"]);
});

test("a stat's money format is said in a line and shown with an example", async () => {
  const figure: PageWidget = {
    id: "owed",
    type: "core/stat",
    at: { x: 0, y: 0, w: 3, h: 3 },
    config: { format: { style: "currency", currency: "USD", decimals: 2 } },
  };
  show(<Harness start={figure} definition={stat} />);
  fireEvent.click(tabByName("Display"));
  // The row says it in a line; its editor shows the example.
  const row = screen.getByRole("button", { name: /^Numbers/ });
  expect(row.textContent).toContain("Money · USD · 2 decimals");
  fireEvent.click(row);
  expect(await screen.findByText("Shown as $43,120.00")).toBeTruthy();
});

// ----- What the model does with a page -----

test("a filter is bound to every data input whose table has its column", () => {
  const filter: PageFilter = { name: "issued_at", label: "Issued", type: "date_range" };
  const bound = bindFilter(chartWidget(), filter, catalog);
  expect(bound.data?.rows?.filters).toEqual([{ filter: "issued_at", column: "issued_at" }]);
  // A table without the column is left alone, and an input already bound is not bound twice.
  expect(bindFilter(bound, filter, catalog)).toBe(bound);
  const other = bindFilter(chartWidget(), { name: "no_such", type: "text" }, catalog);
  expect(other.data?.rows?.filters).toBeUndefined();
});

test("a place is held to the definition's sizes and the twelve columns", () => {
  expect(clampPlace(chart, { x: 11, y: 2, w: 6, h: 6 })).toEqual({ x: 6, y: 2, w: 6, h: 6 });
  expect(clampPlace(chart, { x: 0, y: -4, w: 1, h: 99 })).toEqual({ x: 0, y: 0, w: 3, h: 40 });
});

test("what a widget is placed on moves down out of its way, and what is under a removed widget rises", () => {
  const a: PageWidget = { id: "a", type: "core/text", at: { x: 0, y: 0, w: 6, h: 2 } };
  const b: PageWidget = { id: "b", type: "core/text", at: { x: 0, y: 2, w: 6, h: 2 } };
  const c: PageWidget = { id: "c", type: "core/text", at: { x: 0, y: 4, w: 6, h: 2 } };
  const moved = settleOnGrid([a, { ...b, at: { ...b.at, y: 0 } }, c], "b");
  expect(moved.map((one) => [one.id, one.at.y])).toEqual([
    ["a", 2],
    ["b", 0],
    ["c", 4],
  ]);
  expect(withoutWidget([a, b, c], "a").map((one) => [one.id, one.at.y])).toEqual([
    ["b", 0],
    ["c", 2],
  ]);
});

test("a widget added to a page follows its filters as the page's other widgets on that table do", async () => {
  const { bindFilter } = await import("./kit/inspector/model.ts");
  const catalog = {
    tables: [
      {
        path: "loans",
        columns: [
          { name: "lent_on", type: "date" },
          { name: "fee", type: "integer" },
        ],
      },
    ],
    queries: [],
    sql: false,
  } as never;
  const neighbour = {
    id: "fees",
    type: "core/stat",
    at: { x: 0, y: 0, w: 3, h: 3 },
    data: {
      value: {
        source: {
          visual: { table: "loans", measures: [{ fn: "sum", column: "fee", as: "fees" }] },
        },
        filters: [{ filter: "lent", column: "lent_on" }],
      },
    },
  } as never;
  const fresh = {
    id: "pivot",
    type: "core/pivot",
    at: { x: 0, y: 3, w: 6, h: 7 },
    data: {
      rows: { source: { visual: { table: "loans", measures: [{ fn: "count", as: "n" }] } } },
    },
  } as never;
  const lent = { name: "lent", label: "Lent", type: "date_range" } as never;
  // The filter is called "lent" and no column is: the page already says it narrows lent_on.
  expect(bindFilter(fresh, lent, catalog, [neighbour]).data?.rows?.filters).toEqual([
    { filter: "lent", column: "lent_on" },
  ]);
  expect(bindFilter(fresh, lent, catalog).data?.rows?.filters).toBeUndefined();
});
