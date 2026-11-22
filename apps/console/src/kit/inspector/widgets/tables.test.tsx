// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Page, PageWidget } from "@volvel/manifest";
import { list, table } from "@volvel/widgets-core";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { show } from "../../../testing.tsx";
import type { Env } from "../controls.tsx";
import { type Catalog, configOf } from "../model.ts";
import { shownAs, tidyColumn } from "./columnModel.ts";
import { clearColumnRequest, requestColumn } from "./columnRequest.ts";
import { ListDisplay } from "./listDrawer.tsx";
import { SlotsControl } from "./slots.tsx";
import { TableActions, TableDisplay } from "./tableDrawer.tsx";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "number", type: "text", references: null },
        { name: "client", type: "text", references: null },
        { name: "total", type: "number", references: null },
        { name: "status", type: "enum", references: null },
        { name: "issued", type: "date", references: null },
        { name: "notes", type: "text", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};
const info = {
  name: "invoices",
  columns: [
    { name: "number", type: "text", required: false, values: [] },
    { name: "client", type: "text", required: false, values: [] },
    { name: "total", type: "number", required: false, values: [] },
    { name: "status", type: "enum", required: false, values: ["Paid", "Unpaid", "Void"] },
    { name: "issued", type: "date", required: false, values: [] },
    { name: "notes", type: "text", required: false, values: [] },
  ],
};
const rows = [{ id: "1", number: "INV-9339", client: "C-1001", total: 113, status: "Unpaid" }];
const place = { x: 0, y: 0, w: 12, h: 8 };
const data = { rows: { source: { visual: { table: "invoices" } } } };
const pages: Page[] = [
  {
    id: "invoice-detail",
    title: "Invoice detail",
    kind: "sheet",
    record: { table: "invoices" },
    widgets: [],
  },
];

let written: PageWidget[];
beforeEach(() => {
  written = [];
});
afterEach(() => {
  clearColumnRequest();
  cleanup();
});

function Harness({
  start,
  definition,
  children,
}: {
  start: PageWidget;
  definition: Env["definition"];
  children: (env: Env) => React.ReactNode;
}) {
  const [widget, setWidget] = useState(start);
  const write = (next: PageWidget) => {
    written.push(next);
    setWidget(next);
  };
  const env: Env = {
    definition,
    widget,
    surface: "app",
    filters: [],
    neighbours: [],
    catalog,
    config: configOf(definition, widget),
    write,
    pages,
    flows: [],
    scripts: [],
    widgets: [widget],
    writeAll: () => {},
  };
  return <>{children(env)}</>;
}

const tableWidget = (config: Record<string, unknown> = {}): PageWidget => ({
  id: "tbl",
  type: "core/table",
  at: place,
  data,
  config,
});
const last = () => written.at(-1) as PageWidget;
const columnsOf = () => (last().config?.columns ?? []) as { column: string }[];

const columns = [
  { column: "number" },
  { column: "client", label: "Client code" },
  { column: "total" },
  { column: "status" },
  { column: "issued" },
  { column: "notes", hidden: true },
];

function showTable(config: Record<string, unknown> = { columns }, extra?: React.ReactNode) {
  return show(
    <Harness start={tableWidget(config)} definition={table}>
      {(env) => (
        <>
          <TableDisplay env={env} info={info} rows={rows} />
          {extra}
        </>
      )}
    </Harness>,
  );
}

describe("table columns", () => {
  test("lists each column with what it is shown as, and says how many are shown", () => {
    showTable();
    expect(screen.getByText("5 of 6 shown")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Columns" });
    expect(within(list).getByText("from Client")).toBeTruthy();
    expect(within(list).getByText("123.45")).toBeTruthy();
    expect(within(list).getByText("Nov 20")).toBeTruthy();
    expect(within(list).getByText("Long text")).toBeTruthy();
    expect(screen.getByText(/Clicking a heading on the page opens the same thing/)).toBeTruthy();
  });

  test("the eye hides a column and shows it again", () => {
    showTable();
    fireEvent.click(screen.getByRole("button", { name: "Hide Number" }));
    expect(last().config?.columns).toContainEqual({ column: "number", hidden: true });
    fireEvent.click(screen.getByRole("button", { name: "Show Number" }));
    expect(columnsOf().find((one) => one.column === "number")).toEqual({ column: "number" });
  });

  test("Alt and an arrow reorder the columns", () => {
    showTable();
    const handle = screen.getByRole("button", { name: /Reorder Number/ });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(
      columnsOf()
        .map((one) => one.column)
        .slice(0, 2),
    ).toEqual(["client", "number"]);
  });

  test("+ Column adds one that is not in the list", async () => {
    showTable({ columns: columns.filter((one) => one.column !== "issued") });
    fireEvent.click(screen.getByRole("button", { name: "Column" }));
    fireEvent.click(await screen.findByRole("button", { name: "Issued" }));
    expect(columnsOf().at(-1)).toEqual({ column: "issued" });
  });

  test("a row opens the column editor, and it writes each field", async () => {
    showTable();
    fireEvent.click(screen.getByRole("button", { name: /^Total/ }));
    const editor = await screen.findByRole("dialog");
    expect(within(editor).getByText("Column · Total")).toBeTruthy();
    fireEvent.change(within(editor).getByLabelText("Heading"), { target: { value: "Amount" } });
    expect(columnsOf().find((one) => one.column === "total")).toMatchObject({ label: "Amount" });
    fireEvent.click(within(editor).getByRole("radio", { name: "Right" }));
    fireEvent.click(within(editor).getByRole("radio", { name: "Fixed" }));
    fireEvent.click(within(editor).getByRole("switch", { name: "Show a total at the bottom" }));
    fireEvent.click(within(editor).getByRole("switch", { name: "Hide on phones" }));
    fireEvent.click(within(editor).getByRole("switch", { name: "Sort by clicking the heading" }));
    expect(columnsOf().find((one) => one.column === "total")).toEqual({
      column: "total",
      label: "Amount",
      align: "right",
      width: "fixed",
      total: true,
      phone: false,
      sortable: false,
    });
  });

  test("a number is shown as a format", async () => {
    showTable();
    fireEvent.click(screen.getByRole("button", { name: /^Total/ }));
    const editor = await screen.findByRole("dialog");
    fireEvent.click(within(editor).getByRole("button", { name: /Format/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /^Money(?!,)/ }));
    expect(columnsOf().find((one) => one.column === "total")).toMatchObject({
      format: { style: "currency" },
    });
  });

  test("a choice shown as a badge gets a colour for each of its values", async () => {
    showTable();
    fireEvent.click(screen.getByRole("button", { name: /^Status/ }));
    const editor = await screen.findByRole("dialog");
    expect(within(editor).queryByText("Badge colors")).toBeNull();
    fireEvent.click(within(editor).getByRole("radio", { name: "Badge" }));
    expect(within(editor).getByText("Badge colors")).toBeTruthy();
    for (const value of ["Paid", "Unpaid", "Void"]) {
      expect(within(editor).getByRole("button", { name: `Color of ${value}` })).toBeTruthy();
    }
    // A value's badge, with a chevron, opens a small menu of tones.
    fireEvent.click(within(editor).getByRole("button", { name: "Color of Paid" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Green" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Color of Unpaid" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Amber" }));
    expect(columnsOf().find((one) => one.column === "status")).toEqual({
      column: "status",
      as: "badge",
      badges: { Paid: "success", Unpaid: "attention" },
    });
    expect(within(editor).getByText(/Values come from the column's choices/)).toBeTruthy();
    // "Automatic" takes a value's colour back.
    fireEvent.click(within(editor).getByRole("button", { name: "Color of Paid" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Automatic" }));
    expect(columnsOf().find((one) => one.column === "status")).toMatchObject({
      badges: { Unpaid: "attention" },
    });
  });

  test("a click on the heading on the canvas opens the same editor beside it, with the row lit", async () => {
    showTable(
      { columns },
      <div data-widget-cell="tbl">
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Status</th>
            </tr>
          </thead>
        </table>
      </div>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => requestColumn("tbl", "status"));
    const editor = await screen.findByRole("dialog");
    expect(within(editor).getByText("Column · Status")).toBeTruthy();
    expect(document.querySelector("[data-column-anchor='status']")).toBeTruthy();
    const row = screen.getByRole("button", { name: /^Status/ }).closest("li");
    expect(row?.hasAttribute("data-active")).toBe(true);
    // It is the same editor: a change is written the same way.
    fireEvent.change(within(editor).getByLabelText("Heading"), { target: { value: "State" } });
    expect(columnsOf().find((one) => one.column === "status")).toMatchObject({ label: "State" });
    fireEvent.click(within(editor).getByRole("button", { name: /^Close/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("the look: row height, rows at a time, when empty, stripes", async () => {
    showTable();
    fireEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(last().config?.rowHeight).toBe("compact");
    expect(screen.getByText("25, then pages")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /When empty/ }));
    fireEvent.change(await screen.findByLabelText("What the table says"), {
      target: { value: "No invoices match" },
    });
    expect(last().config?.empty).toBe("No invoices match");
    fireEvent.click(screen.getByRole("switch", { name: "Stripe rows" }));
    expect(last().config?.stripes).toBe(true);
  });
});

describe("table actions", () => {
  const withActions = (): PageWidget => ({
    ...tableWidget({
      rowActions: [
        {
          id: "mark-paid",
          label: "Mark paid",
          action: {
            when: [{ field: "status", test: "equals", value: "Unpaid" }],
            steps: [],
          },
        },
        { id: "void", label: "Void", action: { confirm: { message: "Void it?" }, steps: [] } },
      ],
      buttons: [{ id: "new", label: "New invoice", action: { steps: [] } }],
    }),
    on: { rowClick: { steps: [{ do: "open", page: "invoice-detail", record: "event" }] } },
  });

  test("shows what a click does, the row actions with when, the buttons and selecting rows", () => {
    show(
      <Harness start={withActions()} definition={table}>
        {(env) => <TableActions env={env} />}
      </Harness>,
    );
    expect(screen.getByText("Open Invoice detail")).toBeTruthy();
    expect(screen.getByText("Side sheet")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Mark paid/ }).textContent).toContain(
      "Only when Status",
    );
    expect(screen.getByRole("button", { name: /Void/ }).textContent).toContain("Asks to confirm");
    expect(screen.getByRole("button", { name: /New invoice/ })).toBeTruthy();
    expect(screen.getByText(/Replaces the separate action group/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Let people select several rows" }));
    expect(last().config?.select).toBe(true);
  });

  test("+ Row action and + Button add one, and its editor can remove it", async () => {
    show(
      <Harness start={withActions()} definition={table}>
        {(env) => <TableActions env={env} />}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Row action" }));
    const added = (last().config?.rowActions ?? []) as { id: string }[];
    expect(added).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Button" }));
    expect((last().config?.buttons ?? []) as unknown[]).toHaveLength(2);
    fireEvent.click(await screen.findByRole("button", { name: /^Remove / }));
    expect((last().config?.buttons ?? []) as unknown[]).toHaveLength(1);
  });

  test("a table whose click does nothing says so", () => {
    show(
      <Harness start={tableWidget()} definition={table}>
        {(env) => <TableActions env={env} />}
      </Harness>,
    );
    expect(screen.getByRole("button", { name: /Do/ }).textContent).toContain("Nothing");
  });
});

describe("list slots", () => {
  const listWidget = (config: Record<string, unknown>): PageWidget => ({
    id: "open",
    type: "core/list",
    at: place,
    data,
    config,
  });
  const slots = { title: "number", subtitle: "client", right: "total", badge: "status" };

  test("draws the sample row's values in labelled slots, and a row for each", () => {
    show(
      <Harness start={listWidget(slots)} definition={list}>
        {(env) => <ListDisplay env={env} info={info} rows={rows} />}
      </Harness>,
    );
    const preview = screen.getByTestId("slots-preview");
    expect(within(preview).getByText("INV-9339")).toBeTruthy();
    expect(within(preview).getByText("C-1001")).toBeTruthy();
    expect(within(preview).getByText("Unpaid")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Title\s*Number/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Picture\s*None/ })).toBeTruthy();
    expect(screen.getByText(/Empty slots take no space/)).toBeTruthy();
  });

  test("a slot in the preview and its row open the same picker, and it writes the column", async () => {
    show(
      <Harness start={listWidget(slots)} definition={list}>
        {(env) => <ListDisplay env={env} info={info} rows={rows} />}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Right: 113/ }));
    let picker = await screen.findByRole("list", { name: "Column for Right" });
    fireEvent.click(within(picker).getByRole("button", { name: "Number" }));
    expect(last().config?.right).toBe("number");
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Column for Right" })).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Right\s*Number/ }));
    picker = await screen.findByRole("list", { name: "Column for Right" });
    fireEvent.click(within(picker).getByRole("button", { name: "None" }));
    expect(last().config?.right).toBeUndefined();
  });

  test("an empty slot is offered under the sample, and a picture takes the place when set", async () => {
    show(
      <Harness start={listWidget(slots)} definition={list}>
        {(env) => <ListDisplay env={env} info={info} rows={rows} />}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Picture" }));
    const picker = await screen.findByRole("list", { name: "Column for Picture" });
    fireEvent.click(within(picker).getByRole("button", { name: "Notes" }));
    expect(last().config?.picture).toBe("notes");
    expect(screen.queryByRole("button", { name: "Picture" })).toBeNull();
  });

  test("Rows: List or Cards", () => {
    show(
      <Harness start={listWidget(slots)} definition={list}>
        {(env) => <ListDisplay env={env} info={info} rows={rows} />}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
    expect(last().config?.look).toBe("cards");
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(last().config?.look).toBe("list");
  });

  test("SlotsControl draws one slot as a row", async () => {
    show(
      <Harness start={listWidget(slots)} definition={list}>
        {(env) => {
          const setting = {
            name: "subtitle",
            hint: list.config.properties.subtitle?.["x-volvel"] as never,
            schema: list.config.properties.subtitle as never,
          };
          return <SlotsControl env={env} setting={setting} />;
        }}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Under the title/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    expect(last().config?.subtitle).toBe("notes");
  });
});

describe("the model and the registry", () => {
  test("what a column is shown as", () => {
    expect(shownAs({ column: "status", as: "badge" }, undefined)).toBe("Badge");
    expect(
      shownAs({ column: "total", format: { style: "currency", currency: "USD" } }, undefined),
    ).toBe("$123.45");
    expect(shownAs({ column: "issued" }, { name: "issued", type: "date", choices: [] })).toBe(
      "Nov 20",
    );
  });
  test("a column is written with its defaults left out", () => {
    expect(
      tidyColumn({
        column: "a",
        as: "text",
        align: "auto",
        width: "auto",
        sortable: true,
        phone: true,
      }),
    ).toEqual({ column: "a" });
  });
});
