// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Grid, type GridColumn, parseValue, showValue } from "./index.ts";

afterEach(cleanup);

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
        rowKey={(r) => r.id}
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
        rowKey={(r) => r.id}
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
