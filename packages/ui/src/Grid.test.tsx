// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { keepsKey } from "./Grid.tsx";
import { Grid, type GridColumn, parseValue, showValue } from "./index.ts";

afterEach(cleanup);

test("a field of the grid keeps the grid's keys, and lets F1 and the palette's key go on", () => {
  expect(keepsKey({ key: "ArrowDown", metaKey: false, ctrlKey: false })).toBe(true);
  expect(keepsKey({ key: "Enter", metaKey: false, ctrlKey: false })).toBe(true);
  expect(keepsKey({ key: "F1", metaKey: false, ctrlKey: false })).toBe(false);
  expect(keepsKey({ key: "k", metaKey: true, ctrlKey: false })).toBe(false);
  expect(keepsKey({ key: "K", metaKey: false, ctrlKey: true })).toBe(false);
});

const columns: GridColumn[] = [
  { name: "title", type: "text", editable: true, sortable: true, filterable: true },
  { name: "total", type: "number", editable: true, sortable: true, filterable: true },
  { name: "done", type: "boolean", editable: true },
  { name: "id", type: "uuid" },
];
const rows = [
  { id: "a", title: "First", total: 10, done: false },
  { id: "b", title: "Second", total: null, done: true },
];

describe("grid", () => {
  test("shows rows, says when there are none, and marks an empty value", () => {
    const { rerender } = render(
      <Grid
        label="Rows of orders"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="None"
      />,
    );
    expect(screen.getByRole("table", { name: "Rows of orders" })).toBeTruthy();
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("empty")).toBeTruthy();
    rerender(
      <Grid
        label="Rows of orders"
        columns={columns}
        rows={[] as typeof rows}
        rowKey={(r) => r.id}
        empty="None"
      />,
    );
    expect(screen.getByText("None")).toBeTruthy();
  });

  test("a heading sorts, and says which way it is sorted", () => {
    const onSort = vi.fn();
    render(
      <Grid
        label="Rows"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="None"
        sort={{ column: "total", descending: true }}
        onSort={onSort}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /title/ }));
    expect(onSort).toHaveBeenCalledWith("title");
    expect(screen.getByRole("columnheader", { name: /total/ }).getAttribute("aria-sort")).toBe(
      "descending",
    );
    // A column that cannot be sorted has no button.
    expect(screen.queryByRole("button", { name: /^done/ })).toBeNull();
  });

  test("a filter is reported when it is committed", () => {
    const onFilter = vi.fn();
    render(
      <Grid
        label="Rows"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="None"
        onFilter={onFilter}
      />,
    );
    fireEvent.change(screen.getByLabelText("Filter by title"), { target: { value: "fir" } });
    expect(onFilter).toHaveBeenCalledWith("title", "fir");
    expect(screen.queryByLabelText("Filter by id")).toBeNull();
  });

  test("a cell is edited in place, as a value of the column's type", async () => {
    const onEdit = vi.fn(async () => undefined);
    render(
      <Grid
        label="Rows"
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        empty="None"
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByText("10"));
    const input = screen.getByLabelText("total") as HTMLInputElement;
    expect(input.value).toBe("10");
    fireEvent.input(input, { target: { value: "12.5" } });
    fireEvent.focusOut(input);
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(rows[0], "total", 12.5));

    // Escape leaves the value alone.
    fireEvent.click(screen.getByText("First"));
    fireEvent.input(screen.getByLabelText("title"), { target: { value: "Changed" } });
    fireEvent.keyDown(screen.getByLabelText("title"), { key: "Escape" });
    expect(onEdit).toHaveBeenCalledTimes(1);

    // A yes-or-no column is a checkbox.
    fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(rows[0], "done", true));
    // A column that is not editable offers nothing to press.
    expect(screen.getByText("a").closest("button")).toBeNull();
  });

  test("text that is not the column's type, or a save that is refused, is explained in the cell", async () => {
    const onEdit = vi.fn(async () => {
      throw new Error("Another row already has this title.");
    });
    render(
      <Grid
        label="Rows"
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        empty="None"
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByText("10"));
    fireEvent.input(screen.getByLabelText("total"), { target: { value: "lots" } });
    fireEvent.focusOut(screen.getByLabelText("total"));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a number.");
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("total"), { key: "Escape" });

    fireEvent.click(screen.getByText("First"));
    fireEvent.input(screen.getByLabelText("title"), { target: { value: "Second" } });
    fireEvent.focusOut(screen.getByLabelText("title"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Another row already has this title.",
    );
  });

  test("values are parsed and shown by type", () => {
    expect(parseValue("integer", " 42 ")).toBe(42);
    expect(() => parseValue("integer", "4.2")).toThrow("Enter a whole number.");
    expect(parseValue("boolean", "Yes")).toBe(true);
    expect(parseValue("boolean", "no")).toBe(false);
    expect(parseValue("json", '{"a":1}')).toEqual({ a: 1 });
    expect(() => parseValue("json", "{")).toThrow("Enter valid JSON.");
    expect(parseValue("text", "")).toBeNull();
    expect(parseValue("text", " kept as typed ")).toBe(" kept as typed ");
    expect(showValue("boolean", false)).toBe("No");
    expect(showValue("json", { a: 1 })).toBe('{"a":1}');
    expect(showValue("number", null)).toBe("");
  });
});

describe("grid navigation (the WAI-ARIA grid pattern)", () => {
  const flush = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  const mount = (more: Partial<Parameters<typeof Grid>[0]> = {}) => {
    const onEdit = vi.fn(async () => {});
    const onSort = vi.fn();
    const onCheck = vi.fn();
    render(
      <Grid
        navigation="grid"
        label="Rows of orders"
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        empty="None"
        onEdit={onEdit}
        onSort={onSort}
        checked={new Set<string>()}
        onCheck={onCheck}
        {...more}
      />,
    );
    return { onEdit, onSort, onCheck, grid: screen.getByRole("grid", { name: "Rows of orders" }) };
  };

  test("the grid is one tab stop, and arrow keys move between its cells", async () => {
    const { grid } = mount();
    const stops = grid.querySelectorAll('[tabindex="0"]');
    expect(stops).toHaveLength(1);
    const first = stops[0] as HTMLElement;
    expect(first.textContent).toBe("First");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    await flush();
    expect(document.activeElement?.textContent).toBe("10");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    await flush();
    expect(document.activeElement?.textContent).toBe("empty");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    await flush();
    expect(document.activeElement?.querySelector("input[type=checkbox]")).toBeTruthy();
    // Still one tab stop, wherever focus has gone.
    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  test("Enter edits a cell, Escape puts back what was there and keeps focus on it", async () => {
    const { grid, onEdit } = mount();
    const cell = grid.querySelector('[tabindex="0"]') as HTMLElement;
    cell.focus();
    fireEvent.keyDown(cell, { key: "Enter" });
    const input = (await screen.findByRole("textbox", { name: "title" })) as HTMLInputElement;
    expect(input.value).toBe("First");
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("textbox", { name: "title" })).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("First");
    // F2 edits too, and Enter in the field saves.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "F2" });
    const again = (await screen.findByRole("textbox", { name: "title" })) as HTMLInputElement;
    fireEvent.change(again, { target: { value: "Renamed" } });
    fireEvent.keyDown(again, { key: "Enter" });
    fireEvent.blur(again);
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(rows[0], "title", "Renamed"));
  });

  test("Space checks a row, and Enter on a heading sorts by it", async () => {
    const { grid, onCheck, onSort } = mount();
    const cell = grid.querySelector('[tabindex="0"]') as HTMLElement;
    cell.focus();
    fireEvent.keyDown(cell, { key: " " });
    expect(onCheck).toHaveBeenCalledWith(new Set(["a"]));
    fireEvent.keyDown(cell, { key: "ArrowUp" });
    await flush();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
    expect(onSort).toHaveBeenCalledWith("title");
  });
});
