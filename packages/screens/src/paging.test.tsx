// @vitest-environment happy-dom

// A table's rows come a page at a time: how many are shown of all, "Show more", the order asked of
// the server over every row, and what is said of choosing across pages.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { RowsData, WidgetViewProps } from "@volvel/widgets";
import { corePack } from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Frame } from "./Frame.tsx";

afterEach(cleanup);

const col = (name: string, type = "text", label = name) => ({ name, type, label });
const columns = [col("id", "uuid", "Id"), col("number", "text", "Number"), col("total", "number", "Total")];
const rowsOf = [
  { id: "a", number: "INV-1", total: 300 },
  { id: "b", number: "INV-2", total: 100 },
  { id: "c", number: "INV-3", total: 200 },
];
const View = corePack.views["core/table"] as unknown as (props: WidgetViewProps) => React.ReactNode;

function paged(over: Partial<RowsData> = {}) {
  const more = vi.fn();
  render(
    <View
      config={{ select: true, columns: [{ column: "number" }, { column: "total", sortable: true }] }}
      data={{ rows: { shape: "rows", columns, rows: rowsOf, more, total: 12772, ...over } }}
      size={{ w: 12, h: 8, narrow: false }}
      emit={() => {}}
      building={false}
    />,
  );
  return more;
}

describe("rows a page at a time", () => {
  test("says how many are shown of all, and asks for more", () => {
    const more = paged();
    expect(screen.getByText("Showing 3 of 12,772")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show 3 more" }));
    expect(more).toHaveBeenCalled();
  });

  test("a table whose rows are all here says nothing of pages", () => {
    const { more: _more, total: _total, ...all } = { more: 0, total: 0, shape: "rows" as const };
    render(
      <View
        config={{ columns: [{ column: "number" }] }}
        data={{ rows: { ...all, columns, rows: rowsOf } }}
        size={{ w: 12, h: 8, narrow: false }}
        emit={() => {}}
        building={false}
      />,
    );
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
  });

  test("the order is asked of the server over every row, and the page is left as it was read", () => {
    const sortBy = vi.fn();
    paged({ sortBy });
    fireEvent.click(screen.getByTitle("Sort by Total"));
    expect(sortBy).toHaveBeenCalledWith({ column: "total", descending: false });
    const body = within(screen.getAllByRole("rowgroup")[1] as HTMLElement);
    expect(body.getAllByRole("row").map((row) => within(row).getAllByRole("cell")[1]?.textContent)).toEqual([
      "INV-1",
      "INV-2",
      "INV-3",
    ]);
  });

  test("says that only the rows shown can be chosen", () => {
    paged();
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose every row shown" }));
    expect(screen.getByText("3 chosen")).toBeTruthy();
    expect(screen.getByText("Only the 3 rows shown can be chosen.")).toBeTruthy();
  });
});

describe("a widget that found nothing", () => {
  const definition = corePack.definitions.find((one) => one.type === "core/table");
  const empty = (clearFilters?: () => void) =>
    render(
      <Frame
        widget={{ id: "t", type: "core/table", title: "Invoices", at: { x: 0, y: 0, w: 12, h: 6 } }}
        definition={definition}
        reading={{
          state: { status: "empty", message: "Nothing matches the filters." },
          data: {},
          stale: false,
          more: undefined,
          retry: () => {},
          all: async () => undefined,
          read: undefined,
        }}
        selected={false}
        building={false}
        onRename={undefined}
        tabbable={false}
        clearFilters={clearFilters}
      >
        <span />
      </Frame>,
    );

  test("says so and offers to clear the filters that narrowed it", () => {
    const clear = vi.fn();
    empty(clear);
    expect(screen.getByText("Nothing matches the filters.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(clear).toHaveBeenCalled();
  });

  test("offers nothing to clear when no filter narrowed it", () => {
    empty();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });
});
