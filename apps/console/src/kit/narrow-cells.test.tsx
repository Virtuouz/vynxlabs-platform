// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { show } from "../testing.tsx";
import { DataTable } from "./DataTable.tsx";
import { UsedBy } from "./references.tsx";
import { Truncate } from "./Truncate.tsx";

// Phase 29, r-narrow 1 and 4: a cell never asks for more room than its column has, and a path
// column keeps room for a path. happy-dom does no layout, so the classes that give each are read.

afterEach(cleanup);

test("what uses a thing wraps inside its cell, and asks for no minimum width of its own", () => {
  show(
    <UsedBy
      uses={[
        { by: { kind: "script", path: "billing/record-payment" }, how: "reads" },
      ] as never}
    />,
  );
  const cell = document.querySelector("[data-used-by]") as HTMLElement;
  expect(cell.className).not.toMatch(/min-w-\[/);
  expect(cell.className).toContain("min-w-0");
  expect(cell.className).toContain("[overflow-wrap:anywhere]");
});

test("a wide column keeps 14rem and counts twice in the table's own minimum", () => {
  show(
    <DataTable
      label="Things"
      rows={[{ id: "a", path: "billing/record-payment", kind: "script" }]}
      rowKey={(row) => row.id}
      columns={[
        { header: "Path", wide: true, cell: (row) => row.path },
        { header: "Kind", cell: (row) => row.kind },
      ]}
    />,
  );
  const header = screen.getByRole("columnheader", { name: "Path" });
  expect(header.className).toContain("w-[14rem]");
  expect(header.className).not.toContain("max-sm:w-auto");
  const table = document.querySelector("table") as HTMLElement;
  expect(table.style.getPropertyValue("--table-min-1")).toBe("21rem");
});

test("a long path says all of itself in its title from the start, for a phone with no hover", () => {
  show(<Truncate mode="middle">billing/invoices/overdue/record-payment</Truncate>);
  expect(document.querySelector("[title]")?.getAttribute("title")).toBe(
    "billing/invoices/overdue/record-payment",
  );
});
