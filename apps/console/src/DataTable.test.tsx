// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { type DataColumn, DataTable, nextSort, type SortState } from "./kit/DataTable.tsx";

interface Row {
  id: string;
  name: string;
  took: number;
}
const ROWS: Row[] = [
  { id: "a", name: "alpha", took: 3 },
  { id: "b", name: "beta", took: 1 },
  { id: "c", name: "gamma", took: 2 },
];
const COLUMNS: DataColumn<Row>[] = [
  { header: "Name", cell: (row) => row.name, sort: "name" },
  { header: "Took", cell: (row) => `${row.took} s`, align: "end", sort: "took" },
];

afterEach(cleanup);

const frame = () =>
  new Promise<void>((done) => requestAnimationFrame(() => setTimeout(() => done(), 0)));

test("arrow keys move one focus through the cells, and Enter opens the row", async () => {
  const opened: string[] = [];
  render(
    <DataTable
      label="Runs"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(row) => row.id}
      onOpen={(row) => opened.push(row.id)}
      empty={{ title: "None" }}
    />,
  );
  const grid = screen.getByRole("grid", { name: "Runs" });
  // One tab stop for the whole list.
  const stops = grid.querySelectorAll('[tabindex="0"]');
  expect(stops.length).toBe(1);
  const first = stops[0] as HTMLElement;
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowDown" });
  await act(frame);
  expect(document.activeElement?.textContent).toBe("beta");
  fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight" });
  await act(frame);
  expect(document.activeElement?.textContent).toBe("1 s");
  fireEvent.keyDown(document.activeElement as Element, { key: "End", ctrlKey: true });
  await act(frame);
  expect(document.activeElement?.textContent).toBe("2 s");
  fireEvent.keyDown(document.activeElement as Element, { key: "k" });
  await act(frame);
  fireEvent.keyDown(document.activeElement as Element, { key: "Enter" });
  expect(opened).toEqual(["b"]);
  expect(grid.querySelectorAll('[tabindex="0"]').length).toBe(1);
});

test("a sortable header cycles ascending, descending, none, and says so", () => {
  expect(nextSort(undefined, "took")).toEqual({ key: "took", dir: "asc" });
  expect(nextSort({ key: "took", dir: "asc" }, "took")).toEqual({ key: "took", dir: "desc" });
  expect(nextSort({ key: "took", dir: "desc" }, "took")).toBeUndefined();
  expect(nextSort({ key: "took", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });

  function Sorted() {
    const [sort, setSort] = useState<SortState>();
    return (
      <DataTable
        label="Runs"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        sort={sort}
        onSort={setSort}
        empty={{ title: "None" }}
      />
    );
  }
  render(<Sorted />);
  const header = screen.getByRole("columnheader", { name: /Took/ });
  expect(header.getAttribute("aria-sort")).toBe("none");
  fireEvent.click(within(header).getByRole("button"));
  expect(header.getAttribute("aria-sort")).toBe("ascending");
  fireEvent.click(within(header).getByRole("button"));
  expect(header.getAttribute("aria-sort")).toBe("descending");
});

test("rows are checked by box, by Space, and as a range with Shift, and the batch bar names the count", async () => {
  function Checked() {
    const [checked, setChecked] = useState<Set<string>>(new Set());
    return (
      <DataTable
        label="Runs"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        onOpen={() => {}}
        checked={checked}
        onCheck={setChecked}
        batch={(keys) => <button type="button">Cancel {keys.size}</button>}
        empty={{ title: "None" }}
      />
    );
  }
  render(<Checked />);
  fireEvent.click(screen.getByLabelText("Select a"));
  expect(screen.getByText("1 selected")).toBeTruthy();
  const first = screen.getByRole("grid").querySelector('[tabindex="0"]') as HTMLElement;
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowDown", shiftKey: true });
  await act(frame);
  fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown", shiftKey: true });
  await act(frame);
  expect(screen.getByText("3 selected")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancel 3" })).toBeTruthy();
  fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
  expect(screen.queryByText(/selected$/)).toBeNull();
});

test("Shift and a click checks every row from the last one checked", () => {
  function Checked() {
    const [checked, setChecked] = useState<Set<string>>(new Set());
    return (
      <DataTable
        label="Runs"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        onOpen={() => {}}
        checked={checked}
        onCheck={setChecked}
        batch={(keys) => <span>{[...keys].sort().join(" ")}</span>}
        empty={{ title: "None" }}
      />
    );
  }
  render(<Checked />);
  fireEvent.click(screen.getByLabelText("Select a"));
  fireEvent.click(screen.getByLabelText("Select c"), { shiftKey: true });
  expect(screen.getByText("3 selected")).toBeTruthy();
  expect(screen.getByText("a b c")).toBeTruthy();
});

test("loading, empty, filtered-empty and error each have their own state", async () => {
  const retry = vi.fn();
  const clear = vi.fn();
  const base = {
    label: "Runs",
    columns: COLUMNS,
    rowKey: (row: Row) => row.id,
    empty: { title: "No runs yet" },
  };
  const { rerender } = render(<DataTable {...base} rows={undefined} />);
  // A skeleton only once loading takes long enough to notice.
  expect(screen.queryByRole("status", { name: "Loading runs" })).toBeNull();
  expect(await screen.findByRole("status", { name: "Loading runs" })).toBeTruthy();
  rerender(<DataTable {...base} rows={[]} />);
  expect(screen.getByText("No runs yet")).toBeTruthy();
  rerender(<DataTable {...base} rows={[]} filtered={{ onClear: clear }} />);
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(clear).toHaveBeenCalled();
  rerender(
    <DataTable {...base} rows={undefined} error="The list could not load." onRetry={retry} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalled();
});

test("a long list draws only the rows near the view", () => {
  const many = Array.from({ length: 5000 }, (_, index) => ({
    id: `r${index}`,
    name: `run ${index}`,
    took: index,
  }));
  render(
    <div style={{ height: 600, display: "flex" }}>
      <DataTable
        label="Runs"
        columns={COLUMNS}
        rows={many}
        rowKey={(row) => row.id}
        fill
        empty={{ title: "None" }}
      />
    </div>,
  );
  const drawn = screen.getByRole("grid").querySelectorAll("tr[data-row]").length;
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(200);
  expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("5001");
});

test("an inset table shows ten rows, then all of them on request", () => {
  const twelve = Array.from({ length: 12 }, (_, index) => ({
    id: `${index}`,
    name: `n${index}`,
    took: 1,
  }));
  render(
    <DataTable
      label="Recent"
      variant="inset"
      columns={COLUMNS}
      rows={twelve}
      rowKey={(row) => row.id}
      empty={{ title: "None" }}
    />,
  );
  expect(document.querySelectorAll("tr[data-row]").length).toBe(10);
  fireEvent.click(screen.getByRole("button", { name: "Show all 12" }));
  expect(document.querySelectorAll("tr[data-row]").length).toBe(12);
});

test("Shift+J and Shift+K check the rows they pass, as the shortcut sheet says (SHL-02)", async () => {
  function Checked() {
    const [checked, setChecked] = useState<Set<string>>(new Set());
    return (
      <DataTable
        label="Runs"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        onOpen={() => {}}
        checked={checked}
        onCheck={setChecked}
        batch={(keys) => <button type="button">Cancel {keys.size}</button>}
        empty={{ title: "None" }}
      />
    );
  }
  render(<Checked />);
  const first = screen.getByRole("grid").querySelector('[tabindex="0"]') as HTMLElement;
  first.focus();
  // With Shift held a browser reports the capital letter.
  fireEvent.keyDown(first, { key: "J", shiftKey: true });
  await act(frame);
  fireEvent.keyDown(document.activeElement as Element, { key: "J", shiftKey: true });
  await act(frame);
  expect(screen.getByText("3 selected")).toBeTruthy();
});

test("NARROW-1: a table keeps a width its columns can be read in and wraps long text, so cells never run under the next", () => {
  render(
    <DataTable
      label="Things"
      columns={[
        { header: "A", cell: (row: Row) => row.name },
        { header: "B", cell: (row: Row) => row.name, priority: 2 },
        { header: "C", cell: (row: Row) => row.name, priority: 3 },
      ]}
      rows={ROWS}
      rowKey={(row) => row.id}
      actions={() => [{ label: "Open", onSelect: () => {} }]}
      empty={{ title: "None" }}
    />,
  );
  const table = screen.getByLabelText("Things");
  // One scrolling width for each breakpoint, from the columns shown there.
  expect(table.className).toContain("min-w-[var(--table-min-1)]");
  expect(table.className).toContain("sm:min-w-[var(--table-min-2)]");
  expect(table.className).toContain("lg:min-w-[var(--table-min-3)]");
  expect(table.style.getPropertyValue("--table-min-1")).toBe("10rem");
  expect(table.style.getPropertyValue("--table-min-3")).toBe("24rem");
  const cell = table.querySelector("tbody td") as HTMLElement;
  expect(cell.className).toContain("[overflow-wrap:anywhere]");
});

test("POLISH-002: a list that is empty says so as the screens made by ListScreen do, left and in a dashed box", () => {
  render(
    <DataTable
      label="Triggers"
      columns={COLUMNS}
      rows={[]}
      rowKey={(row) => row.id}
      empty={{ title: "Nothing starts by itself yet", text: "A schedule starts work." }}
    />,
  );
  const box = document.querySelector("[data-empty-state]") as HTMLElement;
  expect(box.textContent).toContain("Nothing starts by itself yet");
  // Not the centered canvas with a glyph: that one is for a whole page.
  expect(box.className).not.toContain("text-center");
  expect(box.querySelector("svg")).toBeNull();
  expect(box.className).toContain("border-dashed");
});
