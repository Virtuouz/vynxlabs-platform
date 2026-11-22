// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Catalog } from "./kit/inspector/model.ts";
import { AddToPage } from "./screens/builder/AddToPage.tsx";

afterEach(cleanup);

const catalog: Catalog = {
  maySql: false,
  queries: [],
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "id", type: "uuid", references: null },
        { name: "number", type: "text", references: null },
        { name: "issued_on", type: "date", references: null },
        { name: "clinic", type: "enum", references: null },
        { name: "client", type: "reference", references: "clients" },
        { name: "total", type: "integer", references: null },
      ],
    },
  ],
};

const suggestions = {
  table: "Invoices",
  items: [
    { key: "detail", label: "Invoice detail", hint: "Opens when a row is clicked" },
    { key: "mark", label: "Mark paid button", hint: "Sets Status to Paid" },
  ],
  onPick: vi.fn(),
};

const open = (extra: Partial<Parameters<typeof AddToPage>[0]> = {}) => {
  const onAdd = vi.fn();
  render(
    <AddToPage
      open
      onClose={() => undefined}
      surface="app"
      onAdd={onAdd}
      onCarry={vi.fn()}
      suggestions={suggestions}
      catalog={catalog}
      startTable="invoices"
      {...extra}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Add to page" });
  return { onAdd, dialog: within(dialog), search: screen.getByRole("textbox") as HTMLInputElement };
};

describe("the widget selector (board 7)", () => {
  test("groups the widgets in the boards' categories, with Text under Organize and explain, and Labs marked", () => {
    const { dialog } = open();
    for (const title of [
      "Work with records",
      "Understand data",
      "Take action",
      "Organize and explain",
    ]) {
      expect(dialog.getByRole("region", { name: title })).toBeTruthy();
    }
    const organize = within(dialog.getByRole("region", { name: "Organize and explain" }));
    expect(organize.getByRole("button", { name: /^Text/ })).toBeTruthy();
    expect(organize.getByRole("button", { name: /^Section/ })).toBeTruthy();
    const goal = dialog.getByRole("button", { name: /^Goal/ });
    expect(within(goal).getByText("Labs")).toBeTruthy();
    expect(dialog.getByText("Suggested for this page")).toBeTruthy();
  });

  test("a dashboard is not offered an Action group, a Button or a Form", () => {
    const { dialog } = open({ surface: "dashboard" });
    expect(dialog.queryByRole("button", { name: /^Button/ })).toBeNull();
    expect(dialog.queryByRole("button", { name: /^Action group/ })).toBeNull();
    expect(dialog.queryByRole("button", { name: /^Form/ })).toBeNull();
  });

  test("the preview follows the widget in view: a drawing, what it is, Good for from the page's table, where it starts, the keys", () => {
    const { dialog } = open();
    const chart = dialog.getByRole("button", { name: /^Chart/ });
    fireEvent.focus(chart);
    const preview = within(dialog.getByRole("complementary", { name: "Preview" }));
    expect(preview.getByRole("heading", { name: "Chart" })).toBeTruthy();
    expect(preview.getByText(/A trend over time/)).toBeTruthy();
    expect(preview.getByText("Good for")).toBeTruthy();
    expect(preview.getByText("Invoices by week")).toBeTruthy();
    expect(preview.getByText("Invoices by clinic")).toBeTruthy();
    expect(preview.getByText("Invoices")).toBeTruthy();
    expect(preview.getByText(/the table this page already uses/)).toBeTruthy();
    expect(preview.getByText("place at the end")).toBeTruthy();
    expect(preview.getByText("place anywhere")).toBeTruthy();
    expect(
      dialog.getByRole("complementary", { name: "Preview" }).querySelector("svg"),
    ).toBeTruthy();
    fireEvent.focus(dialog.getByRole("button", { name: /^Button/ }));
    expect(preview.getByRole("heading", { name: "Button" })).toBeTruthy();
    expect(preview.queryByText(/the table this page already uses/)).toBeNull();
  });

  test("the search finds words in titles, descriptions and what a widget is good for", () => {
    const { dialog, search } = open();
    fireEvent.change(search, { target: { value: "trend" } });
    expect(dialog.getByRole("button", { name: /^Chart/ })).toBeTruthy();
    expect(dialog.queryByRole("button", { name: /^Table/ })).toBeNull();
    fireEvent.change(search, { target: { value: "by week" } });
    expect(dialog.getByRole("button", { name: /^Chart/ })).toBeTruthy();
  });

  test("a goal, described in words, finds the widget and the suggestion: take payments", () => {
    const { dialog, search } = open();
    fireEvent.change(search, { target: { value: "take payments" } });
    expect(dialog.getByRole("button", { name: /^Button/ })).toBeTruthy();
    expect(dialog.getByRole("button", { name: /Mark paid button/ })).toBeTruthy();
    expect(dialog.queryByRole("button", { name: /^Chart/ })).toBeNull();
    expect(dialog.queryByRole("button", { name: /Invoice detail/ })).toBeNull();
  });

  test("it opens with the focus in the search, so typing finds at once", async () => {
    const { search } = open();
    await waitFor(() => expect(document.activeElement).toBe(search));
  });

  test("a search that finds nothing says so", () => {
    const { dialog, search } = open();
    fireEvent.change(search, { target: { value: "xylophone" } });
    expect(dialog.getByText(/Nothing matches/)).toBeTruthy();
  });

  test("the arrow keys walk the tiles across and down, and back to the search", () => {
    const { dialog, search } = open();
    search.focus();
    fireEvent.keyDown(search, { key: "ArrowDown" });
    // The first row is the suggestions.
    expect(document.activeElement).toBe(dialog.getByRole("button", { name: /Invoice detail/ }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(dialog.getByRole("button", { name: /Mark paid button/ }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    // Down from the second suggestion lands in the second column of Work with records.
    expect(document.activeElement).toBe(dialog.getByRole("button", { name: /^List/ }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(dialog.getByRole("button", { name: /^Table/ }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    // Table, List, Record detail are one row; Form is the next row's first.
    expect(document.activeElement).toBe(dialog.getByRole("button", { name: /^Form/ }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(search);
  });

  test("Enter in the search places the first match; a tile places its widget", () => {
    const { onAdd, dialog, search } = open({ suggestions: undefined } as never);
    fireEvent.change(search, { target: { value: "chart" } });
    fireEvent.submit(search.closest("form") as HTMLFormElement);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ type: "core/chart" }));
    fireEvent.click(dialog.getByRole("button", { name: /^Chart/ }));
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  test("it says where a widget adds, as before", () => {
    const { dialog } = open({ target: "Orders" });
    expect(dialog.getByText("Orders")).toBeTruthy();
    expect(dialog.getByText(/Adds to/)).toBeTruthy();
  });
});

describe("Approvals in the selector", () => {
  test("is a tile under Take action, found by what people say", () => {
    const { dialog, search } = open({ suggestions: undefined } as never);
    const action = within(dialog.getByRole("region", { name: "Take action" }));
    expect(action.getByRole("button", { name: /^Approvals/ })).toBeTruthy();
    for (const words of ["sign off", "approve requests", "review"]) {
      fireEvent.change(search, { target: { value: words } });
      expect(dialog.getByRole("button", { name: /^Approvals/ }), words).toBeTruthy();
    }
  });

  test("its preview says what it is, what it is good for, and draws a picture", () => {
    const { dialog } = open({ suggestions: undefined } as never);
    fireEvent.focus(dialog.getByRole("button", { name: /^Approvals/ }));
    expect(dialog.getAllByText(/Requests waiting for a decision/).length).toBeGreaterThan(0);
    expect(dialog.getAllByText("Stock orders waiting for a manager").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-drawing="approvals"]')).not.toBeNull();
  });

  test("a suggestion card is offered with the next steps, and picking it says so", () => {
    const onPick = vi.fn();
    const { dialog } = open({
      suggestions: {
        table: "this page",
        items: [
          { key: "approvals", label: "Approvals", hint: "Stock orders asks for a decision" },
        ],
        onPick,
      },
    });
    fireEvent.click(dialog.getByRole("button", { name: /Approvals.*asks for a decision/ }));
    expect(onPick).toHaveBeenCalledWith("approvals");
  });
});
