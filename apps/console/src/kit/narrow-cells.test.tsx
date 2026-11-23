// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { show } from "../testing.tsx";
import { DataTable } from "./DataTable.tsx";
import { ListCollection } from "./ListCollection.tsx";
import { UsedBy } from "./references.tsx";
import { Truncate } from "./Truncate.tsx";

// Phase 29, r-narrow 1 and 4: a cell never asks for more room than its column has, and a path
// column keeps room for a path. happy-dom does no layout, so the classes that give each are read.

afterEach(cleanup);

test("what uses a thing wraps inside its cell, and asks for no minimum width of its own", () => {
  show(
    <UsedBy
      uses={[{ by: { kind: "script", path: "billing/record-payment" }, how: "reads" }] as never}
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
      empty={<p>None</p>}
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

test("item 24: a list's row actions wrap inside a column that keeps room, and never sit in a line that cannot", async () => {
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ items: [{ id: "a", n: "A" }], nextCursor: null })),
  );
  show(
    <ListCollection<{ id: string; n: string }>
      title="Things"
      path="/things"
      columns={[{ header: "Name", cell: (row) => row.n }]}
      rowKey={(row) => row.id}
      empty={{ title: "None" }}
      rowActions={() => (
        <>
          <button type="button">Make a password reset link</button>
          <button type="button">Disable</button>
        </>
      )}
    />,
  );
  const header = await screen.findByRole("columnheader", { name: "Actions" });
  expect(header.className).toContain("w-[14rem]");
  const actions = document.querySelector("[data-row-actions]") as HTMLElement;
  expect(actions.className).toContain("flex-wrap");
  expect(actions.className).not.toContain("inline-flex");
  vi.unstubAllGlobals();
});
