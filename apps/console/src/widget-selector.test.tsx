// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(dialog.getByRole("complementary", { name: "Preview" }).querySelector("svg")).toBeTruthy();
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

  test("a search that finds nothing says so", () => {
    const { dialog, search } = open();
    fireEvent.change(search, { target: { value: "xylophone" } });
    expect(dialog.getByText(/Nothing here matches that/)).toBeTruthy();
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
    const { onAdd, dialog, search } = open({ suggestions: undefined });
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
