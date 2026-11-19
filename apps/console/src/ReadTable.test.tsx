// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ReadTable } from "./kit/ReadTable.tsx";
import { show } from "./testing.tsx";

afterEach(cleanup);

const rows = [
  { id: "1", device: "Laptop", fee: 50, status: "out" },
  { id: "2", device: "Camera", fee: 30, status: "late" },
  { id: "3", device: "Tablet", fee: 120, status: "out" },
];
const table = (more: Partial<Parameters<typeof ReadTable>[0]> = {}) => (
  <ReadTable
    label="Rows of loans"
    columns={[
      { name: "device", type: "text" },
      { name: "fee", type: "number" },
      { name: "status", type: "text" },
    ]}
    rows={rows}
    rowKey={(row) => String(row.id)}
    {...more}
  />
);
const firstColumn = () =>
  screen
    .getAllByRole("row")
    .map((row) => within(row).queryAllByRole("cell")[0]?.textContent)
    .filter((text) => text !== undefined);

/**
 * Phase 19, M5: a table that is only read still sorts, narrows to what is
 * typed and has its columns chosen and ordered, on the rows it was given.
 */
test("a column sorts by its heading: numbers by size, up, then down, then as given", () => {
  show(table());
  expect(firstColumn()).toEqual(["Laptop", "Camera", "Tablet"]);
  const fee = screen.getByRole("button", { name: /fee/ });
  fireEvent.click(fee);
  expect(firstColumn()).toEqual(["Camera", "Laptop", "Tablet"]);
  fireEvent.click(fee);
  expect(firstColumn()).toEqual(["Tablet", "Laptop", "Camera"]);
  fireEvent.click(fee);
  expect(firstColumn()).toEqual(["Laptop", "Camera", "Tablet"]);
});

test("the filter row narrows to the rows that contain what is typed, says how many, and is put away", () => {
  show(table());
  // Until it is asked for there is no row of fields.
  expect(screen.queryByRole("textbox")).toBeNull();
  const toggle = screen.getByRole("button", { name: "Filter the rows" });
  fireEvent.click(toggle);
  const fields = screen.getAllByRole("textbox");
  expect(fields).toHaveLength(3);
  fireEvent.change(fields[2] as HTMLElement, { target: { value: "OUT" } });
  expect(firstColumn()).toEqual(["Laptop", "Tablet"]);
  expect(screen.getByRole("status").textContent).toContain("2 of 3 match.");
  fireEvent.change(fields[0] as HTMLElement, { target: { value: "zzz" } });
  expect(screen.getByText("No row matches what is typed.")).toBeTruthy();
  // Put away, the fields go and so does what was typed in them.
  fireEvent.click(toggle);
  expect(firstColumn()).toEqual(["Laptop", "Camera", "Tablet"]);
});

test("columns are hidden and ordered from the columns dialog, and whoever keeps them is told", async () => {
  const kept = vi.fn();
  show(table({ shown: ["fee", "device"], onColumns: kept }));
  const headings = () => screen.getAllByRole("columnheader").map((one) => one.textContent);
  expect(headings()).toEqual(["fee", "device"]);
  fireEvent.click(screen.getByRole("button", { name: "Columns" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Columns" }));
  fireEvent.click(dialog.getByRole("button", { name: "Move device up" }));
  expect(kept).toHaveBeenLastCalledWith(["device", "fee"]);
  fireEvent.click(dialog.getByLabelText("status"));
  // Every column, in the order they are defined, is no choice at all.
  expect(kept).toHaveBeenLastCalledWith(undefined);
});
