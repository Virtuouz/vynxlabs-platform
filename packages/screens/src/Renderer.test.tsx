// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { InterfacePage, PageWidget } from "@volvel/manifest";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { DataClient, Filter, Row, TableInfo } from "./data.ts";
import { InterfaceRenderer, LOOKUP_BATCH, PageRenderer } from "./Renderer.tsx";

afterEach(cleanup);

const column = (name: string, type = "text", more: object = {}) => ({
  name,
  type,
  required: false,
  references: null as string | null,
  ...more,
});
const system = [
  column("id", "uuid"),
  column("created_at", "timestamp"),
  column("updated_at", "timestamp"),
];
const tables: Record<string, TableInfo> = {
  customers: {
    found: true,
    canRead: true,
    canWrite: true,
    columns: [...system, column("name", "text", { required: true })],
  },
  orders: {
    found: true,
    canRead: true,
    canWrite: true,
    columns: [
      ...system,
      column("number"),
      column("total", "number"),
      column("status"),
      column("customer", "reference", { references: "customers" }),
    ],
  },
};
const data: Record<string, Row[]> = {
  customers: [
    { id: "c1", name: "Ada" },
    { id: "c2", name: "Bo" },
  ],
  orders: [
    { id: "o1", number: "A-1", total: 10, status: "open", customer: "c1" },
    { id: "o2", number: "A-2", total: 20, status: "open", customer: "c2" },
    { id: "o3", number: "A-3", total: 5, status: "done", customer: "c1" },
  ],
};

/** Whether a row passes a filter, enough of the grammar for these tests. */
function passes(row: Row, filter: Filter | undefined): boolean {
  if (!filter) return true;
  if ("and" in filter) return filter.and.every((part) => passes(row, part));
  if ("or" in filter) return filter.or.some((part) => passes(row, part));
  const value = row[filter.column];
  if (filter.op === "in") return (filter.value as unknown[]).includes(value);
  if (filter.op === "is_null") return value === null || value === undefined;
  return value === filter.value;
}

/** A client over the rows above, that remembers what it was asked. */
function fake(rows = data) {
  const asked: { call: string; table: string; options: Any }[] = [];
  const client: DataClient = {
    find: vi.fn(async (table, options) => {
      asked.push({ call: "find", table, options });
      return {
        items: (rows[table] ?? []).filter((row) => passes(row, options.filter)),
        nextCursor: null,
      };
    }),
    aggregate: vi.fn(async (table, options) => {
      asked.push({ call: "aggregate", table, options });
      const groups = new Map<string, Row[]>();
      for (const row of (rows[table] ?? []).filter((candidate) =>
        passes(candidate, options.filter),
      )) {
        const key = String(row.status);
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      return {
        items: [...groups].map(([status, members]) => ({
          by: { status },
          values: {
            count: members.length,
            "sum:total": members.reduce((sum, row) => sum + Number(row.total), 0),
          },
        })),
        truncated: false,
      };
    }),
    insert: vi.fn(async (table, row) => {
      const made = { id: `new-${rows[table]?.length}`, ...row };
      rows[table] = [...(rows[table] ?? []), made];
      return made;
    }),
    update: vi.fn(async (_table, _id, changes) => changes),
    remove: vi.fn(async () => {}),
  };
  return { client, asked };
}
// biome-ignore lint/suspicious/noExplicitAny: what the fake was asked is inspected freely
type Any = any;

const at = { x: 0, y: 0, w: 6, h: 6 };
const widget = (id: string, more: Partial<PageWidget>): PageWidget => ({
  id,
  type: "table",
  table: "orders",
  at,
  ...more,
});
const page = (widgets: PageWidget[]): InterfacePage => ({ id: "main", title: "Main", widgets });

test("choosing a row in one widget decides what the widgets that follow it show", async () => {
  const { client, asked } = fake();
  render(
    <PageRenderer
      tables={tables}
      client={client}
      page={page([
        widget("customers", {
          table: "customers",
          title: "Customers",
          fields: [{ column: "name" }],
        }),
        widget("orders", {
          title: "Their orders",
          fields: [{ column: "number" }, { column: "total" }, { column: "customer", show: "name" }],
          link: { from: "customers", type: "refersTo", via: "customer" },
        }),
        widget("order", {
          type: "card",
          title: "The order",
          link: { from: "orders", type: "same" },
        }),
      ])}
    />,
  );
  const customers = within(await screen.findByRole("region", { name: "Customers" }));
  await customers.findByText("Ada");
  // Nothing is chosen, so the widget that follows asks for nothing and says why.
  const orders = within(screen.getByRole("region", { name: "Their orders" }));
  expect(orders.getByText("Choose a row in Customers to see what goes with it.")).toBeTruthy();
  expect(asked.filter((one) => one.table === "orders")).toEqual([]);

  fireEvent.click(customers.getAllByRole("radio", { name: "Choose this row" })[0] as HTMLElement);
  await orders.findByText("A-1");
  expect(orders.getByText("A-3")).toBeTruthy();
  expect(orders.queryByText("A-2")).toBeNull();
  expect(asked.find((one) => one.table === "orders")?.options.filter).toEqual({
    column: "customer",
    op: "eq",
    value: "c1",
  });
  // The reference is shown by the name of the customer it points at.
  await waitFor(() => expect(orders.getAllByText("Ada")).toHaveLength(2));
  // Headings are the columns' names made readable.
  expect(orders.getByRole("columnheader", { name: "Number" })).toBeTruthy();

  // The card follows the order chosen in the middle widget.
  const card = within(screen.getByRole("region", { name: "The order" }));
  expect(card.getByText("Choose a row in Their orders to see what goes with it.")).toBeTruthy();
  fireEvent.click(orders.getAllByRole("radio", { name: "Choose this row" })[1] as HTMLElement);
  await card.findByText("A-3");

  // Another customer: the orders change with it.
  fireEvent.click(customers.getAllByRole("radio", { name: "Choose this row" })[1] as HTMLElement);
  await orders.findByText("A-2");
  expect(orders.queryByText("A-1")).toBeNull();
});

test("totals are drawn as rows, and the rows behind a chosen line can be shown", async () => {
  const { client, asked } = fake();
  render(
    <PageRenderer
      tables={tables}
      client={client}
      page={page([
        widget("totals", {
          title: "By status",
          summary: {
            groupBy: [{ column: "status" }],
            aggregates: [
              { fn: "count", as: "orders" },
              { fn: "sum", column: "total", as: "value" },
            ],
          },
          sort: [{ column: "value", desc: true }],
        }),
        widget("behind", { title: "Behind", link: { from: "totals", type: "group" } }),
      ])}
    />,
  );
  const totals = within(await screen.findByRole("region", { name: "By status" }));
  await totals.findByText("open");
  expect(totals.getByRole("columnheader", { name: "Value" })).toBeTruthy();
  expect(totals.getByText("30")).toBeTruthy();
  expect(asked.find((one) => one.call === "aggregate")?.options).toMatchObject({
    group: ["status"],
    measures: ["count", "sum:total"],
    sort: ["-sum:total"],
  });
  fireEvent.click(totals.getAllByRole("radio", { name: "Choose this row" })[1] as HTMLElement);
  const behind = within(screen.getByRole("region", { name: "Behind" }));
  await behind.findByText("A-3");
  expect(behind.queryByText("A-1")).toBeNull();
});

test("a form adds a row for the chosen row, and every widget reads again", async () => {
  const rows = { customers: [...(data.customers as Row[])], orders: [...(data.orders as Row[])] };
  const { client } = fake(rows);
  render(
    <PageRenderer
      tables={tables}
      client={client}
      page={page([
        widget("customers", {
          table: "customers",
          title: "Customers",
          fields: [{ column: "name" }],
        }),
        widget("orders", {
          title: "Orders",
          fields: [{ column: "number" }],
          link: { from: "customers", type: "refersTo", via: "customer" },
        }),
        widget("add", {
          type: "form",
          title: "New order",
          fields: [{ column: "number", label: "Order number" }, { column: "total" }],
          link: { from: "customers", type: "refersTo", via: "customer" },
          options: { submitLabel: "Add order", success: "Order added." },
        }),
      ])}
    />,
  );
  const customers = within(await screen.findByRole("region", { name: "Customers" }));
  fireEvent.click((await customers.findAllByRole("radio"))[1] as HTMLElement);
  const form = within(screen.getByRole("region", { name: "New order" }));
  fireEvent.input(await form.findByLabelText("Order number"), { target: { value: "B-9" } });
  fireEvent.input(form.getByLabelText("Total"), { target: { value: "7" } });
  fireEvent.click(form.getByRole("button", { name: "Add order" }));
  await form.findByText("Order added.");
  // The new row was given the customer it was made for.
  expect(client.insert).toHaveBeenCalledWith("orders", { number: "B-9", total: 7, customer: "c2" });
  await within(screen.getByRole("region", { name: "Orders" })).findByText("B-9");
});

test("a value is changed in place when the person may, and a refusal is shown where it was typed", async () => {
  const { client } = fake();
  client.update = vi.fn(async () => {
    throw Object.assign(new Error("A value is required."), { fields: [] });
  });
  render(
    <PageRenderer
      tables={{ ...tables, customers: { ...(tables.customers as TableInfo), canWrite: false } }}
      client={client}
      page={page([
        widget("orders", { title: "Orders", fields: [{ column: "number", editable: true }] }),
        widget("customers", {
          table: "customers",
          title: "Customers",
          fields: [{ column: "name", editable: true }],
          options: { allowAdd: true, allowDelete: true },
        }),
      ])}
    />,
  );
  const orders = within(await screen.findByRole("region", { name: "Orders" }));
  fireEvent.click(await orders.findByText("A-1"));
  const input = orders.getByRole("textbox");
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await orders.findByText("A value is required.");
  expect(client.update).toHaveBeenCalledWith("orders", "o1", { number: null });
  // Someone who may not write the table is offered no way to.
  const customers = within(screen.getByRole("region", { name: "Customers" }));
  await customers.findByText("Ada");
  fireEvent.click(customers.getByText("Ada"));
  expect(customers.queryByRole("textbox")).toBeNull();
  expect(customers.queryByRole("button", { name: "Add a row" })).toBeNull();
  expect(customers.queryByRole("button", { name: "Delete" })).toBeNull();
});

test("a table that is gone, unreadable or changed says so, and the rest of the page still works", async () => {
  const { client } = fake();
  render(
    <PageRenderer
      tables={{
        ...tables,
        gone: { found: false, canRead: false, canWrite: false, columns: [] },
        closed: { found: true, canRead: false, canWrite: false, columns: [] },
      }}
      client={client}
      page={page([
        widget("a", { table: "gone", title: "Gone" }),
        widget("b", { table: "closed", title: "Closed" }),
        widget("c", { title: "Changed", fields: [{ column: "number" }, { column: "dropped" }] }),
        widget("d", { title: "Fine", fields: [{ column: "number" }] }),
        { id: "e", type: "text", title: "Note", at, options: { text: "Line one\nLine two" } },
      ])}
    />,
  );
  expect(
    within(screen.getByRole("region", { name: "Gone" })).getByText(
      /is not in this workspace any more/,
    ),
  ).toBeTruthy();
  expect(
    within(screen.getByRole("region", { name: "Closed" })).getByText(
      /You may not read the table "closed"\. Ask whoever looks after this app/,
    ),
  ).toBeTruthy();
  expect(
    within(screen.getByRole("region", { name: "Changed" })).getByText(/no longer has "dropped"/),
  ).toBeTruthy();
  await within(screen.getByRole("region", { name: "Fine" })).findByText("A-1");
  expect(within(screen.getByRole("region", { name: "Note" })).getByText(/Line one/)).toBeTruthy();
});

test("references are fetched once each, at most two hundred to a request", async () => {
  const many = Array.from({ length: 450 }, (_, index) => ({
    id: `c${index}`,
    name: `Customer ${index}`,
  }));
  const rows = {
    customers: many,
    orders: many.map((customer, index) => ({
      id: `o${index}`,
      number: `N-${index}`,
      customer: customer.id,
    })),
  };
  const { client, asked } = fake(rows);
  render(
    <PageRenderer
      tables={tables}
      client={client}
      page={page([
        widget("orders", {
          title: "Orders",
          fields: [{ column: "number" }, { column: "customer", show: "name" }],
        }),
        // A second widget over the same rows asks for none of them again.
        widget("again", { title: "Again", fields: [{ column: "customer", show: "name" }] }),
      ])}
    />,
  );
  await within(await screen.findByRole("region", { name: "Orders" })).findByText("Customer 449");
  await within(screen.getByRole("region", { name: "Again" })).findByText("Customer 0");
  const lookups = asked.filter((one) => one.table === "customers");
  expect(lookups.map((one) => one.options.filter.value.length)).toEqual([
    LOOKUP_BATCH,
    LOOKUP_BATCH,
    50,
  ]);
});

test("in the builder the chosen widget is moved by arrow keys, and resized with Shift, without a pointer", async () => {
  const { client } = fake();
  const onMove = vi.fn();
  render(
    <PageRenderer
      tables={tables}
      client={client}
      page={page([widget("orders", { title: "Orders", at: { x: 2, y: 3, w: 6, h: 6 } })])}
      editing={{ selected: "orders", onSelect: () => {}, onMove }}
    />,
  );
  const handle = within(await screen.findByRole("region", { name: "Orders" })).getByRole("button", {
    name: "Editing",
  });
  expect(handle.getAttribute("aria-keyshortcuts")).toContain("ArrowLeft");
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(onMove).toHaveBeenLastCalledWith("orders", { x: 3, y: 3, w: 6, h: 6 });
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  expect(onMove).toHaveBeenLastCalledWith("orders", { x: 2, y: 2, w: 6, h: 6 });
  fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
  expect(onMove).toHaveBeenLastCalledWith("orders", { x: 2, y: 3, w: 7, h: 6 });
  fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
  expect(onMove).toHaveBeenLastCalledWith("orders", { x: 2, y: 3, w: 6, h: 7 });
});

test("in the builder a widget is dragged by its heading and stretched by its corner, on the grid", async () => {
  const { client } = fake();
  const onMove = vi.fn();
  const onSelect = vi.fn();
  const { container } = render(
    <PageRenderer
      tables={tables}
      client={client}
      page={page([widget("orders", { title: "Orders", at: { x: 0, y: 0, w: 6, h: 6 } })])}
      editing={{ onSelect, onMove }}
    />,
  );
  const region = await screen.findByRole("region", { name: "Orders" });
  // The page is 1,188 pixels wide here, so a column is 100 pixels and a row 52.
  const grid = container.querySelector(".grid") as HTMLElement;
  grid.getBoundingClientRect = () => ({ width: 1188, left: 0, top: 0 }) as DOMRect;
  const pointer = (type: string, target: Element, x: number, y: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true }) as Any;
    Object.assign(event, { button: 0, pointerId: 1, clientX: x, clientY: y });
    target.dispatchEvent(event);
  };
  const header = region.querySelector("header") as HTMLElement;
  header.setPointerCapture = () => {};
  pointer("pointerdown", header, 10, 10);
  pointer("pointermove", header, 10 + 205, 10 + 110);
  // While it is held it is drawn where it would land.
  await waitFor(() => expect(region.style.getPropertyValue("--col")).toBe("3 / span 6"));
  pointer("pointerup", header, 10 + 205, 10 + 110);
  expect(onMove).toHaveBeenCalledWith("orders", { x: 2, y: 2, w: 6, h: 6 });
  // It cannot be dragged off the page.
  pointer("pointerdown", header, 10, 10);
  pointer("pointermove", header, 2000, -500);
  pointer("pointerup", header, 2000, -500);
  expect(onMove).toHaveBeenLastCalledWith("orders", { x: 6, y: 0, w: 6, h: 6 });

  const corner = region.querySelector('[title="Drag to change its size"]') as HTMLElement;
  corner.setPointerCapture = () => {};
  pointer("pointerdown", corner, 600, 300);
  pointer("pointermove", corner, 600 + 300, 300 - 104);
  pointer("pointerup", corner, 600 + 300, 300 - 104);
  expect(onMove).toHaveBeenLastCalledWith("orders", { x: 0, y: 0, w: 9, h: 4 });
  // Pressing Edit in the heading is not a drag, and letting go where it was changes nothing.
  onMove.mockClear();
  pointer("pointerdown", region.querySelector("header button") as HTMLElement, 10, 10);
  pointer("pointerdown", header, 10, 10);
  pointer("pointerup", header, 10, 10);
  expect(onMove).not.toHaveBeenCalled();
  fireEvent.click(within(region).getByRole("button", { name: "Edit" }));
  expect(onSelect).toHaveBeenCalledWith("orders");
});

test("an interface with several pages shows them as tabs, and one page as itself", async () => {
  const { client } = fake();
  const body = {
    title: "Sales",
    pages: [
      {
        id: "orders",
        title: "Orders",
        widgets: [widget("o", { title: "All orders", fields: [{ column: "number" }] })],
      },
      {
        id: "people",
        title: "People",
        widgets: [widget("c", { table: "customers", title: "All customers" })],
      },
    ],
  };
  const onPage = vi.fn();
  const { rerender } = render(
    <InterfaceRenderer body={body} tables={tables} client={client} onPage={onPage} />,
  );
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Orders", "People"]);
  await screen.findByText("A-1");
  fireEvent.click(screen.getByRole("tab", { name: "People" }));
  await screen.findByText("Ada");
  expect(onPage).toHaveBeenCalledWith("people");
  rerender(
    <InterfaceRenderer
      body={{ ...body, pages: body.pages.slice(0, 1) }}
      tables={tables}
      client={client}
    />,
  );
  expect(screen.queryByRole("tab")).toBeNull();
  rerender(
    <InterfaceRenderer body={{ title: "Empty", pages: [] }} tables={tables} client={client} />,
  );
  expect(screen.getByText("This app has no pages yet.")).toBeTruthy();
});

test("a figure narrows its own rows, writes its number as money, and names itself once", async () => {
  const { client, asked } = fake();
  render(
    <PageRenderer
      tables={tables}
      client={client}
      page={page([
        widget("owed", {
          type: "figure",
          title: "Owed on open orders",
          summary: { groupBy: [], aggregates: [{ fn: "sum", column: "total", as: "owed" }] },
          filter: { column: "status", value: "open" },
          options: { format: { style: "currency", minorUnits: true } },
        }),
      ])}
    />,
  );
  const region = screen.getByRole("region", { name: "Owed on open orders" });
  // Only the open orders: 10 and 20 cents.
  expect(await within(region).findByText("$0.30")).toBeTruthy();
  expect(asked.find((one) => one.call === "aggregate")?.options.filter).toEqual({
    column: "status",
    value: "open",
  });
  expect(within(region).getAllByText(/Owed/)).toHaveLength(1);
});

test("a field with a format is written in it, in US English", async () => {
  const { client } = fake({
    ...data,
    orders: [{ id: "o9", number: "A-9", total: 123456, status: "open", customer: "c1" }],
  });
  render(
    <PageRenderer
      tables={tables}
      client={client}
      page={page([
        widget("orders", {
          title: "Orders",
          fields: [
            { column: "number" },
            { column: "total", format: { style: "currency", currency: "USD", minorUnits: true } },
          ],
        }),
      ])}
    />,
  );
  expect(await screen.findByText("$1,234.56")).toBeTruthy();
});

test("a filter on one value lists the values the column holds, and narrows every widget", async () => {
  const { client, asked } = fake();
  render(
    <PageRenderer
      tables={tables}
      client={client}
      page={{
        ...page([widget("orders", { title: "Orders", fields: [{ column: "number" }] })]),
        filters: [{ id: "status", label: "Status", column: "status", type: "value" }],
      }}
    />,
  );
  const choose = (await screen.findByRole("combobox", { name: "Status" })) as HTMLSelectElement;
  await waitFor(() => expect(choose.disabled).toBe(false));
  expect([...choose.options].map((option) => option.textContent)).toEqual(["All", "open", "done"]);
  fireEvent.change(choose, { target: { value: "done" } });
  await waitFor(() =>
    expect(screen.getByRole("region", { name: "Orders" }).textContent).not.toContain("A-1"),
  );
  expect(asked.filter((one) => one.call === "find").at(-1)?.options.filter).toEqual({
    column: "status",
    op: "eq",
    value: "done",
  });
});

describe("actions", () => {
  const remind = {
    label: "Remind",
    target: { kind: "script" as const, path: "orders/remind" },
    input: { order: "selection.orders.number", channel: { value: "sms" } },
    confirm: "Send a reminder for {{selection.orders.number}}?",
    enabledWhen: "selection.orders.id",
  };
  const targets = {
    "script:orders/remind": {
      canStart: true,
      description: "A reminder is on its way.",
      inputSchema: {
        type: "object",
        properties: {
          order: { type: "string" },
          channel: { type: "string" },
          note: { type: "string", title: "Note" },
        },
        required: ["order", "channel", "note"],
      },
    },
    "flow:orders/refund": { canStart: false, description: null, inputSchema: null },
  };
  const starting = () => {
    const { client, asked } = fake();
    const started: { target: unknown; input: unknown }[] = [];
    client.start = vi.fn(async (target, input) => {
      started.push({ target, input });
      return { kind: target.kind, id: "run-1" };
    });
    client.run = vi.fn(async () => ({ status: "succeeded", output: { sent: true } }));
    return { client, asked, started };
  };

  test("an action maps the chosen row, asks for what is missing, confirms with the row's value, starts, and reads the page again", async () => {
    const { client, asked, started } = starting();
    render(
      <PageRenderer
        tables={tables}
        client={client}
        targets={targets}
        page={page([
          widget("orders", { title: "Orders", fields: [{ column: "number" }] }),
          { id: "remind", type: "action", title: "Remind", at, action: remind },
        ])}
      />,
    );
    const orders = within(await screen.findByRole("region", { name: "Orders" }));
    await orders.findByText("A-1");
    // Nothing chosen yet: the action waits for a row.
    const button = screen.getByRole("button", { name: "Remind" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // The orders widget lets a row be chosen, because the action reads it.
    fireEvent.click(orders.getAllByRole("radio", { name: "Choose this row" })[1] as HTMLElement);
    await waitFor(() => expect(button.disabled).toBe(false));
    const reads = asked.length;

    fireEvent.click(button);
    // "note" is required and not mapped, so it is asked for, with the mapped values in place.
    const dialog = within(await screen.findByRole("dialog"));
    expect((dialog.getByLabelText("Order") as HTMLInputElement).value).toBe("A-2");
    fireEvent.input(dialog.getByLabelText("Note"), { target: { value: "Tomorrow at 9" } });
    fireEvent.click(dialog.getByRole("button", { name: "Remind" }));
    // Then the confirmation, with the row's value in it.
    expect(await screen.findByText("Send a reminder for A-2?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Remind" }).at(-1) as HTMLElement);

    await waitFor(() => expect(started).toHaveLength(1), { timeout: 3000 });
    expect(started[0]).toEqual({
      target: { kind: "script", path: "orders/remind" },
      input: { order: "A-2", channel: "sms", note: "Tomorrow at 9" },
    });
    // An end user is told what the script says it does; the page reads its rows again.
    expect(
      await screen.findByText("A reminder is on its way.", {}, { timeout: 3000 }),
    ).toBeTruthy();
    await waitFor(() => expect(asked.length).toBeGreaterThan(reads));
  });

  test("row actions run on their row, and one the person may not start is not offered", async () => {
    const { client, started } = starting();
    render(
      <PageRenderer
        tables={tables}
        client={client}
        targets={{
          ...targets,
          "script:orders/remind": { ...targets["script:orders/remind"], inputSchema: null },
        }}
        page={page([
          widget("orders", {
            title: "Orders",
            fields: [{ column: "number" }],
            actions: [
              {
                ...remind,
                input: { order: "row.number" },
                confirm: undefined,
                enabledWhen: undefined,
              } as never,
              { label: "Refund", target: { kind: "flow", path: "orders/refund" } },
            ],
          }),
        ])}
      />,
    );
    const orders = within(await screen.findByRole("region", { name: "Orders" }));
    await orders.findByText("A-3");
    expect(orders.queryByRole("button", { name: "Refund" })).toBeNull();
    fireEvent.click(orders.getAllByRole("button", { name: "Remind" })[2] as HTMLElement);
    await waitFor(() => expect(started[0]?.input).toEqual({ order: "A-3" }), { timeout: 3000 });
  });
});

describe("more rows", () => {
  const paged = (second: () => Promise<{ items: Row[]; nextCursor: string | null }>) => {
    const { client } = fake();
    client.find = vi.fn(async (_table, options) =>
      options.cursor ? second() : { items: (data.orders as Row[]).slice(0, 2), nextCursor: "next" },
    );
    return client;
  };

  test("shows busy while the next page is asked for and adds its rows", async () => {
    let answer: (page: { items: Row[]; nextCursor: string | null }) => void = () => {};
    const client = paged(() => new Promise((done) => (answer = done)));
    render(
      <PageRenderer
        tables={tables}
        client={client}
        page={page([widget("orders", { title: "Orders", fields: [{ column: "number" }] })])}
      />,
    );
    await screen.findByText("A-1");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Show more/ }).getAttribute("aria-busy")).toBe(
        "true",
      ),
    );
    answer({ items: [(data.orders as Row[])[2] as Row], nextCursor: null });
    await screen.findByText("A-3");
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });

  test("a page that fails says so, keeps the rows and offers Try again", async () => {
    let fail = true;
    const client = paged(async () => {
      if (fail) throw new Error("The server is not answering.");
      return { items: [(data.orders as Row[])[2] as Row], nextCursor: null };
    });
    render(
      <PageRenderer
        tables={tables}
        client={client}
        page={page([widget("orders", { title: "Orders", fields: [{ column: "number" }] })])}
      />,
    );
    await screen.findByText("A-1");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("More rows could not be loaded.");
    expect(alert.textContent).toContain("The server is not answering.");
    expect(screen.getByText("A-1")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("A-3");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
