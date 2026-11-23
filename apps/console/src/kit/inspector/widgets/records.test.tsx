// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Page, PageWidget } from "@volvel/manifest";
import type { WidgetDefinition } from "@volvel/widgets";
import { actions, button, detail, filter, form, section, tabs, text } from "@volvel/widgets-core";
import { type ComponentType, useState } from "react";
import { afterEach, expect, test } from "vitest";
import type { Env } from "../controls.tsx";
import { type Catalog, onThePagesRecord, tableOfInput } from "../model.ts";
import { ActionsDisplaySection, buttonLine } from "./actionsDrawer.tsx";
import { ButtonDisplaySection } from "./buttonDrawer.tsx";
import { DetailDataSection, DetailDisplaySection } from "./detailDrawer.tsx";
import { rowsFromIds } from "./fieldsList.tsx";
import { FilterDisplaySection, filterLine, narrowedBy } from "./filterDrawer.tsx";
import { FormDisplaySection } from "./formDrawer.tsx";
import { relaidOut, SectionDisplaySection } from "./sectionDrawer.tsx";
import { TabsDisplaySection } from "./tabsDrawer.tsx";
import { TextContentSection } from "./textDrawer.tsx";

afterEach(cleanup);

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "number", type: "text", references: null },
        { name: "client", type: "text", references: "clients" },
        { name: "notes", type: "text", references: null },
        { name: "total", type: "number", references: null },
        { name: "status", type: "enum", references: null },
        { name: "issued_at", type: "timestamp", references: null },
      ],
    },
    {
      name: "clients",
      columns: [
        { name: "name", type: "text", references: null },
        { name: "email", type: "text", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};

const table = (id: string, extra: Partial<PageWidget> = {}): PageWidget => ({
  id,
  type: "core/table",
  title: id,
  at: { x: 0, y: 0, w: 6, h: 4 },
  data: { rows: { source: { visual: { table: "invoices" } } } },
  ...extra,
});

/** Draws one section over a page's widgets, and keeps what it writes, as the editor does. */
function Harness({
  definition,
  start,
  others = [],
  page,
  Section,
  seen,
  props = {},
}: {
  definition: WidgetDefinition;
  start: PageWidget;
  others?: PageWidget[];
  page?: Page;
  // biome-ignore lint/suspicious/noExplicitAny: each section has its own extra props
  Section: ComponentType<any>;
  seen: { widgets: PageWidget[] };
  props?: Record<string, unknown>;
}) {
  const [widgets, setWidgets] = useState<PageWidget[]>([start, ...others]);
  seen.widgets = widgets;
  const widget = widgets.find((one) => one.id === start.id) as PageWidget;
  const env: Env = {
    definition,
    widget,
    surface: "app",
    filters: [],
    neighbours: widgets.filter((one) => one.id !== start.id),
    catalog,
    config: { ...(definition.defaults ?? {}), ...(widget.config ?? {}) },
    write: (next) => setWidgets((all) => all.map((one) => (one.id === next.id ? next : one))),
    page,
    pages: page ? [page] : [],
    flows: [],
    scripts: [],
    widgets,
    writeAll: (next) => setWidgets(next),
  };
  return <Section env={env} {...props} />;
}

const mine = (seen: { widgets: PageWidget[] }, id = "w") => {
  const widget = seen.widgets.find((one) => one.id === id) as PageWidget;
  return { ...widget, config: widget.config ?? {} };
};

function mount(
  definition: WidgetDefinition,
  start: Partial<PageWidget>,
  Section: ComponentType<{ env: Env }>,
  extra: { others?: PageWidget[]; page?: Page; props?: Record<string, unknown> } = {},
) {
  const seen = { widgets: [] as PageWidget[] };
  render(
    <Harness
      definition={definition}
      start={{ id: "w", type: definition.type, at: { x: 0, y: 0, w: 6, h: 4 }, ...start }}
      Section={Section}
      seen={seen}
      {...extra}
    />,
  );
  return seen;
}

// ---------------------------------------------------------------------------
// Record detail

test("a record detail's record comes from the row selected in a table, once chosen", () => {
  const seen = mount(detail, {}, DetailDataSection, { others: [table("t1")] });
  fireEvent.click(screen.getByRole("radio", { name: /The row selected in a table/ }));
  expect(mine(seen).data?.record?.source).toEqual({ selected: "t1" });
});

test("the record this page was opened with is offered only where a record opens the page", () => {
  mount(detail, {}, DetailDataSection);
  expect(
    (
      screen.getByRole("radio", {
        name: /The record this page was opened with/,
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  cleanup();
  const record: Page = {
    id: "p",
    title: "Invoice",
    kind: "record",
    record: { table: "invoices" },
    widgets: [],
  } as unknown as Page;
  const seen = mount(detail, {}, DetailDataSection, { page: record });
  fireEvent.click(screen.getByRole("radio", { name: /The record this page was opened with/ }));
  expect(mine(seen).data?.record?.source).toEqual({ record: "this" });
});

test("the current user's own record picks the table and the email column", () => {
  const seen = mount(detail, {}, DetailDataSection);
  fireEvent.click(screen.getByRole("radio", { name: /The current user.s own record/ }));
  expect(mine(seen).data?.record?.source).toEqual({ own: { table: "invoices", by: "number" } });
  fireEvent.change(screen.getByLabelText("Table"), { target: { value: "clients" } });
  expect(mine(seen).data?.record?.source).toEqual({ own: { table: "clients", by: "email" } });
});

test("fields dragged below a section header join the section; above it, none", () => {
  const rows = [
    { column: "a" },
    { column: "b", section: "Notes" },
    { column: "c", section: "Notes" },
  ];
  expect(rowsFromIds(rows, ["field:a", "field:b", "section:Notes", "field:c"])).toEqual([
    { column: "a" },
    { column: "b" },
    { column: "c", section: "Notes" },
  ]);
  expect(rowsFromIds(rows, ["section:Notes", "field:c", "field:a", "field:b"])).toEqual([
    { column: "c", section: "Notes" },
    { column: "a", section: "Notes" },
    { column: "b", section: "Notes" },
  ]);
});

test("the fields are rows with their kind, a section header, and a field editor", () => {
  const seen = mount(
    detail,
    {
      data: { record: { source: { visual: { table: "invoices" } } } },
      config: {
        fields: [{ column: "client" }, { column: "total" }, { column: "notes", section: "Notes" }],
      },
    },
    DetailDisplaySection,
  );
  expect(screen.getByText("SECTION · NOTES")).toBeTruthy();
  expect(screen.getByText("Picker")).toBeTruthy();
  expect(screen.getByText(/more columns? (is|are) hidden/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Total/ }));
  fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Amount" } });
  expect((mine(seen).config.fields as { label?: string }[])[1]?.label).toBe("Amount");
  fireEvent.click(screen.getByRole("checkbox", { name: "Hidden" }));
  expect((mine(seen).config.fields as { hidden?: boolean }[])[1]?.hidden).toBe(true);
});

test("fields across and editing in place are written", () => {
  const seen = mount(detail, {}, DetailDisplaySection);
  fireEvent.click(screen.getByRole("radio", { name: "3" }));
  expect(mine(seen).config.across).toBe(3);
  fireEvent.click(screen.getByRole("switch", { name: "Let people edit fields in place" }));
  expect(mine(seen).config.edit).toBe(true);
});

const sheet: Page = {
  id: "sheet",
  title: "Invoice sheet",
  kind: "sheet",
  record: { table: "invoices" },
  widgets: [],
};

test("a detail wired to the record the page opens with lists that table's fields, to hide, section and reorder", () => {
  const seen = mount(
    detail,
    { data: { record: { source: { record: "this" } } } },
    DetailDisplaySection,
    { page: sheet },
  );
  const list = screen.getByRole("list", { name: "Fields" });
  expect(list.textContent).toContain("Number");
  expect(list.textContent).toContain("Total");
  // A section is added: it starts on the last field and is written.
  fireEvent.click(screen.getByRole("button", { name: /Field or section/ }));
  fireEvent.change(screen.getByLabelText("New section"), { target: { value: "Money" } });
  fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
  const written = mine(seen).config.fields as { column: string; section?: string }[];
  expect(written.length).toBeGreaterThan(3);
  expect(written.at(-1)?.section).toBe("Money");
});

test("a new record detail or an edit form starts on the record the page opens with; a plain page leaves it alone", () => {
  const added = (type: string, config?: Record<string, unknown>): PageWidget => ({
    id: "w",
    type,
    at: { x: 0, y: 0, w: 6, h: 4 },
    ...(config ? { config } : {}),
  });
  const wired = onThePagesRecord(added("core/detail"), sheet);
  expect(wired.data?.record?.source).toEqual({ record: "this" });
  expect(onThePagesRecord(added("core/detail"), { ...sheet, kind: "page" }).data).toBeUndefined();
  expect(onThePagesRecord(added("core/form", { mode: "create" }), sheet).data).toBeUndefined();
  expect(
    onThePagesRecord(added("core/form", { mode: "edit" }), sheet).data?.record?.source,
  ).toEqual({ record: "this" });
  // Back to making records, the form reads the table again.
  expect(
    onThePagesRecord({ ...wired, type: "core/form", config: { mode: "create" } }, sheet).data
      ?.record?.source,
  ).toEqual({ visual: { table: "invoices" } });
  // Wired to something else already: left alone.
  const own = { ...added("core/detail"), data: { record: { source: { selected: "t1" } } } };
  expect(onThePagesRecord(own, sheet)).toBe(own);
});

test("the table a record input reads is found whichever way it is wired", () => {
  expect(tableOfInput({ source: { record: "this" } }, sheet)).toBe("invoices");
  expect(tableOfInput({ source: { own: { table: "clients", by: "email" } } }, undefined)).toBe(
    "clients",
  );
  expect(tableOfInput({ source: { selected: "t1" } }, undefined, [table("t1")])).toBe("invoices");
  expect(tableOfInput({ source: { record: "this" } }, undefined)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Form

test("a form says what Submit says, and what happens after saving", () => {
  const seen = mount(
    form,
    {
      data: { record: { source: { visual: { table: "invoices" } } } },
      config: {
        mode: "create",
        fields: [{ column: "client", required: true }, { column: "issued_at" }],
        submit: { steps: [{ do: "create", table: "invoices", set: {} }] },
      },
    },
    FormDisplaySection,
  );
  expect(screen.getByText("Required · picker")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Submit says/ }));
  fireEvent.change(screen.getByLabelText("Submit says"), { target: { value: "Create invoice" } });
  expect(mine(seen).config.submitLabel).toBe("Create invoice");
  fireEvent.click(screen.getByRole("button", { name: /After saving/ }));
  fireEvent.change(screen.getByLabelText("Say"), { target: { value: "Invoice created" } });
  fireEvent.click(screen.getByRole("switch", { name: "Close the sheet or dialog" }));
  expect((mine(seen).config.submit as { steps: unknown[] }).steps).toEqual([
    { do: "create", table: "invoices", set: {} },
    { do: "message", text: "Invoice created", tone: "success" },
    { do: "close" },
  ]);
});

// ---------------------------------------------------------------------------
// Button and action group

test("a button's style, full width and position are written", () => {
  const seen = mount(button, { config: { label: "Mark paid" } }, ButtonDisplaySection);
  fireEvent.click(screen.getByRole("radio", { name: "Danger" }));
  expect(mine(seen).config.tone).toBe("danger");
  fireEvent.click(screen.getByRole("radio", { name: "Quiet" }));
  expect(mine(seen).config.tone).toBe("quiet");
  fireEvent.click(screen.getByRole("switch", { name: "Full width" }));
  expect(mine(seen).config.full).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Bottom right" }));
  expect(mine(seen).config.place).toBe("bottom-right");
});

test("a button's label and icon are written", () => {
  const seen = mount(button, { config: { label: "Mark paid" } }, ButtonDisplaySection);
  fireEvent.click(screen.getByRole("button", { name: /Says/ }));
  fireEvent.change(screen.getByLabelText("Says"), { target: { value: "Paid" } });
  expect(mine(seen).config.label).toBe("Paid");
  fireEvent.click(screen.getByRole("button", { name: /Icon/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Check" }));
  expect(mine(seen).config.icon).toBe("check");
});

const group = (): Partial<PageWidget> => ({
  config: {
    actions: [
      {
        id: "paid",
        label: "Mark paid",
        tone: "primary",
        action: { steps: [], when: [{ field: "status", test: "is", value: "Unpaid" }] },
      },
      { id: "send", label: "Send invoice", tone: "default", action: { steps: [] } },
      { id: "void", label: "Void", tone: "danger", action: { steps: [] } },
    ],
    showUpTo: 2,
  },
});

test("an action group's buttons say their tone, when, and the menu they are in", () => {
  mount(actions, group(), ActionsDisplaySection);
  expect(screen.getByText("Main · only when Unpaid")).toBeTruthy();
  expect(screen.getByText("Danger · in the ⋯ menu")).toBeTruthy();
  expect(buttonLine({ id: "x", label: "x", action: { steps: [] } }, 0, 3)).toBe("Normal");
});

test("an action group adds a button, opens it, and lines up", () => {
  const seen = mount(actions, group(), ActionsDisplaySection);
  fireEvent.click(screen.getByRole("radio", { name: "Spread" }));
  expect(mine(seen).config.lineUp).toBe("spread");
  fireEvent.click(screen.getByRole("radio", { name: "Top center" }));
  expect(mine(seen).config.place).toBe("top-center");
  fireEvent.click(screen.getByRole("button", { name: /Button$/ }));
  expect((mine(seen).config.actions as unknown[]).length).toBe(4);
  // The new button's own view, with a way back.
  expect(screen.getByRole("tab", { name: /Display/ })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /Actions/ })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /Rules/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Danger" }));
  expect((mine(seen).config.actions as { tone?: string }[])[3]?.tone).toBe("danger");
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("radio", { name: "Left" })).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Section and tabs

test("reordering what a section holds lays the widgets out again, in order", () => {
  const held = (id: string, w: number): PageWidget => ({
    id,
    type: "core/stat",
    at: { x: 0, y: 0, w, h: 2 },
    in: { widget: "w" },
  });
  const widgets = [
    { id: "w", type: "core/section", at: { x: 0, y: 0, w: 12, h: 6 } } as PageWidget,
    held("a", 6),
    held("b", 6),
    held("c", 6),
  ];
  const next = relaidOut(widgets, "w", ["c", "a", "b"]);
  expect(next.filter((one) => one.in).map((one) => [one.id, one.at.x, one.at.y])).toEqual([
    ["c", 0, 0],
    ["a", 6, 0],
    ["b", 0, 2],
  ]);
});

test("a section lists what it holds, selects on a click, and writes its look", () => {
  const picked: string[] = [];
  const inside: PageWidget = {
    id: "n",
    type: "core/stat",
    title: "Invoiced",
    at: { x: 0, y: 0, w: 3, h: 2 },
    in: { widget: "w" },
  };
  const seen = mount(section, { title: "The numbers" }, SectionDisplaySection, {
    others: [inside],
    props: { onSelectWidget: (id: string) => picked.push(id) },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Invoiced/ }));
  expect(picked).toEqual(["n"]);
  fireEvent.click(screen.getByRole("radio", { name: "Card" }));
  expect(mine(seen).config.look).toBe("card");
  fireEvent.click(screen.getByRole("switch", { name: "Can be collapsed" }));
  expect(mine(seen).config.folds).toBe(true);
});

test("tabs say what each holds; its chip sets which opens first; new tabs are added", () => {
  const seen = mount(
    tabs,
    {
      config: {
        tabs: [
          { id: "invoices", title: "Invoices" },
          { id: "visits", title: "Visits" },
        ],
      },
    },
    TabsDisplaySection,
    {
      others: [
        {
          id: "a",
          type: "core/stat",
          at: { x: 0, y: 0, w: 3, h: 2 },
          in: { widget: "w", tab: "invoices" },
        },
      ],
    },
  );
  expect(screen.getByText("1 widget")).toBeTruthy();
  expect(screen.getByText("Empty")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open Visits first" }));
  expect(mine(seen).config.opensFirst).toBe("visits");
  fireEvent.click(screen.getByRole("button", { name: /Tab$/ }));
  expect((mine(seen).config.tabs as unknown[]).length).toBe(3);
  fireEvent.click(screen.getByRole("radio", { name: "Pills" }));
  expect(mine(seen).config.look).toBe("pills");
  fireEvent.click(screen.getByRole("switch", { name: "Remember the last tab" }));
  expect(mine(seen).config.remember).toBe(true);
});

// ---------------------------------------------------------------------------
// Search and filter

const holder = (): Partial<PageWidget> => ({
  config: {
    filters: [
      { name: "search", label: "Search invoices", type: "search" },
      { name: "issued_at", label: "Issued", type: "date_range", default: "last_30_days" },
    ],
    sit: "row",
  },
});

test("every filter says in one line what it does", () => {
  const withSearch = table("t1", {
    data: {
      rows: {
        source: { visual: { table: "invoices" } },
        filters: [{ filter: "search", columns: ["number", "client"] }],
      },
    },
  });
  mount(filter, holder(), FilterDisplaySection, { others: [withSearch] });
  expect(screen.getByText("Looks in Number, Client")).toBeTruthy();
  expect(screen.getByText("Date range · Last 30 days")).toBeTruthy();
  expect(filterLine([], { name: "x", type: "choice" } as Parameters<typeof filterLine>[1])).toBe(
    "Choice · Any",
  );
});

test("a filter's editor lists every widget that could follow it, and toggles the binding", () => {
  const seen = mount(filter, holder(), FilterDisplaySection, {
    others: [table("t1"), table("t2")],
  });
  fireEvent.click(screen.getByRole("button", { name: /^Issued/ }));
  const list = screen.getByRole("list", { name: "Widgets this filter narrows" });
  const boxes = within(list).getAllByRole("checkbox");
  expect(boxes.map((one) => (one as HTMLInputElement).checked)).toEqual([false, false]);
  fireEvent.click(within(list).getByRole("checkbox", { name: /^t1/ }));
  expect(mine(seen, "t1").data?.rows?.filters).toEqual([
    { filter: "issued_at", column: "issued_at" },
  ]);
  expect(mine(seen, "t2").data?.rows?.filters).toBeUndefined();
  fireEvent.click(within(list).getByRole("checkbox", { name: /^t1/ }));
  expect(mine(seen, "t1").data?.rows?.filters).toBeUndefined();
  expect(narrowedBy.length).toBeGreaterThan(0);
});

test("filters sit in a row or behind a button", () => {
  const seen = mount(filter, holder(), FilterDisplaySection);
  fireEvent.click(screen.getByRole("radio", { name: "Behind a button" }));
  expect(mine(seen).config.sit).toBe("button");
});

// ---------------------------------------------------------------------------
// Text

test("a text's style is chosen by looking at it, and its words show rendered", async () => {
  const seen = mount(
    text,
    { config: { text: "Every amount is in **dollars**." } },
    TextContentSection,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Warning" }));
  expect(mine(seen).config.look).toBe("warning");
  fireEvent.click(screen.getByRole("radio", { name: "Plain" }));
  expect(mine(seen).config.look).toBeUndefined();
  expect(await screen.findByText("dollars")).toBeTruthy();
  expect(screen.getByText(/For steps, tabs and folds/)).toBeTruthy();
});

test("a field set to money still has its Format row", () => {
  mount(
    detail,
    {
      data: { record: { source: { visual: { table: "invoices" } } } },
      config: {
        fields: [
          { column: "total", format: { style: "currency", currency: "USD", minorUnits: true } },
        ],
      },
    },
    DetailDisplaySection,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Total/ }));
  expect(screen.getByText("Format")).toBeTruthy();
});

test("clearing a section's name to retype it keeps the section and its fields", () => {
  const seen = mount(
    detail,
    {
      data: { record: { source: { visual: { table: "invoices" } } } },
      config: { fields: [{ column: "client" }, { column: "notes", section: "Notes" }] },
    },
    DetailDisplaySection,
  );
  fireEvent.click(screen.getAllByRole("button", { name: /SECTION · NOTES/ }).at(-1) as HTMLElement);
  const name = screen.getByLabelText("Name");
  fireEvent.change(name, { target: { value: "" } });
  const sections = () => (mine(seen).config.fields as { section?: string }[]).map((f) => f.section);
  expect(sections()).toEqual([undefined, "Notes"]);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "C" } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Cost" } });
  expect(sections()).toEqual([undefined, "Cost"]);
});

test("setting After saving changes the close and the message in place, and does not move them past an open", () => {
  const seen = mount(
    form,
    {
      data: { record: { source: { visual: { table: "invoices" } } } },
      config: {
        mode: "create",
        fields: [{ column: "client" }],
        submit: {
          steps: [
            { do: "create", table: "invoices", set: {} },
            { do: "close" },
            { do: "open", page: "p" },
            { do: "message", text: "Opened", tone: "info" },
          ],
        },
      },
    },
    FormDisplaySection,
  );
  fireEvent.click(screen.getByRole("button", { name: /After saving/ }));
  fireEvent.change(screen.getByLabelText("Say"), { target: { value: "Made" } });
  expect((mine(seen).config.submit as { steps: unknown[] }).steps).toEqual([
    { do: "create", table: "invoices", set: {} },
    { do: "close" },
    { do: "open", page: "p" },
    { do: "message", text: "Made", tone: "info" },
  ]);
});
