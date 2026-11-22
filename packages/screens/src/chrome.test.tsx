// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import type { Page, PageFilter, PageWidget } from "@volvel/manifest";
import { corePack } from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test, vi } from "vitest";
import { overlayWidth } from "./layout.ts";
import { PageView } from "./PageView.tsx";
import { type PageDataClient, viewRegistry, type WireData } from "./types.ts";

afterEach(cleanup);

const registry = viewRegistry(corePack);
const rows: WireData = {
  shape: "rows",
  columns: [
    { name: "id", type: "uuid", label: "Id" },
    { name: "number", type: "text", label: "Number" },
  ],
  rows: [{ id: "a", number: "INV-1" }],
};
const client: PageDataClient = { read: vi.fn(async () => ({ inputs: { rows } })) };

const table = {
  id: "invoices",
  type: "core/table",
  title: "Invoices",
  at: { x: 0, y: 2, w: 12, h: 6 },
  data: { rows: { source: { visual: { table: "invoices" } } } },
  config: { columns: [{ column: "number" }] },
  on: { rowClick: { steps: [{ do: "open", page: "invoice-detail" }] } },
} as PageWidget;

const pages: Page[] = [
  { id: "money", title: "Money", widgets: [] },
  { id: "invoice-detail", title: "Invoice detail", kind: "sheet", widgets: [] },
];

const draw = (selected: string | undefined, extra: object = {}) =>
  render(
    <PageView
      widgets={[table]}
      filters={[]}
      registry={registry}
      client={client}
      filterValues={{}}
      onFilterValues={() => {}}
      pages={pages}
      editing={{
        selected,
        onSelect: () => {},
        onChange: () => {},
        onRename: () => {},
      }}
      {...extra}
    />,
  );

describe("a widget's chrome while building", () => {
  test("a chosen widget has its title chip, handle, resize corner and size chip", async () => {
    const { container } = draw("invoices");
    await screen.findByText("INV-1");
    const cell = screen.getByRole("group", { name: "Invoices" });
    expect(cell.className).toContain("ring-2");
    for (const part of ["title", "handle", "resize", "size"]) {
      expect(container.querySelector(`[data-chrome=${part}]`), part).toBeTruthy();
    }
    expect(container.querySelector("[data-chrome=size]")?.textContent).toBe(
      "12 × 6 · col 1 · row 3",
    );
    expect(container.querySelector("[data-chrome=title]")?.textContent).toBe("Invoices");
  });

  test("a widget that is not chosen has none of it, only a faint ring when hovered", async () => {
    const { container } = draw(undefined);
    await screen.findByText("INV-1");
    for (const part of ["title", "handle", "resize", "size"]) {
      expect(container.querySelector(`[data-chrome=${part}]`), part).toBeNull();
    }
    expect(screen.getByRole("group", { name: "Invoices" }).className).toContain("hover:ring-1");
  });

  test("a table says what a row click opens, by the page's name, while building only", async () => {
    const { container } = draw(undefined);
    await screen.findByText("INV-1");
    expect(container.querySelector("[data-chrome=opens]")?.textContent).toContain(
      "Click opens Invoice detail",
    );
    cleanup();
    const served = render(
      <PageView
        widgets={[table]}
        filters={[]}
        registry={registry}
        client={client}
        filterValues={{}}
        onFilterValues={() => {}}
        pages={pages}
      />,
    );
    await screen.findByText("INV-1");
    expect(served.container.querySelector("[data-chrome=opens]")).toBeNull();
  });
});

describe("a side sheet or modal served at its maker's size", () => {
  test("the sizes are 480, 720, 960, 1200 and the window; left out, medium", () => {
    expect(overlayWidth({ size: "small" })).toBe(480);
    expect(overlayWidth({})).toBe(720);
    expect(overlayWidth({ size: "large" })).toBe(960);
    expect(overlayWidth({ size: "xlarge" })).toBe(1200);
    expect(overlayWidth({ size: "full" })).toBe("full");
  });

  test("its widgets are on the grid as placed, with no forced single column", async () => {
    const { container } = draw(undefined, { over: true, editing: undefined });
    await screen.findByText("INV-1");
    const cell = container.querySelector("[data-widget-cell]");
    expect(cell?.className).toContain("grid-row");
    expect(cell?.parentElement?.className).toContain("grid-cols-12");
  });
});

describe("the filter bar's compact controls", () => {
  const filters: PageFilter[] = [
    { name: "q", type: "search", label: "Search invoices" },
    { name: "clinic", type: "choice", label: "Clinic", choices: ["north", "south"] },
    { name: "issued", type: "date_range", label: "Issued" },
  ];
  const bar: PageWidget = {
    id: "filters",
    type: "core/filter",
    at: { x: 0, y: 0, w: 12, h: 2 },
    config: { filters },
  };

  test("a search box with a magnifier and its placeholder, and each other filter one select with its label inside", async () => {
    const { container } = render(
      <PageView
        widgets={[bar]}
        filters={filters}
        registry={registry}
        client={client}
        filterValues={{}}
        onFilterValues={() => {}}
      />,
    );
    const search = (await screen.findByLabelText("Search invoices")) as HTMLInputElement;
    expect(search.placeholder).toBe("Search invoices");
    expect(search.parentElement?.querySelector("svg")).toBeTruthy();
    const filtersBar = container.querySelector("search") as HTMLElement;
    const clinic = within(filtersBar).getByLabelText("Clinic");
    expect(clinic.tagName).toBe("SELECT");
    expect(clinic.parentElement?.textContent).toContain("Clinic");
    expect(within(filtersBar).getByLabelText("Issued").tagName).toBe("SELECT");
  });
});
