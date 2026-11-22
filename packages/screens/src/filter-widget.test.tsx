// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageFilter, PageWidget } from "@volvel/manifest";
import { corePack } from "@volvel/widgets-core/views";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PageView } from "./PageView.tsx";
import { type FilterValues, type PageDataClient, viewRegistry, type WireData } from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const registry = viewRegistry(corePack);

const rows: WireData = {
  shape: "rows",
  columns: [
    { name: "id", type: "uuid", label: "Id" },
    { name: "number", type: "text", label: "Number" },
  ],
  rows: [{ id: "a", number: "INV-1" }],
};

const table: PageWidget = {
  id: "invoices",
  type: "core/table",
  title: "Invoices",
  at: { x: 0, y: 2, w: 12, h: 6 },
  data: { rows: { source: { visual: { table: "invoices" } } } },
  config: { columns: [{ column: "number" }] },
} as PageWidget;

const filterWidget = (filters: PageFilter[], reset = true): PageWidget => ({
  id: "filters",
  type: "core/filter",
  at: { x: 0, y: 0, w: 12, h: 2 },
  config: { filters, reset },
});

function clientOf(extra: Omit<Partial<PageDataClient>, "read"> = {}) {
  const read = vi.fn(async (_widget: string, _values: FilterValues) => ({ inputs: { rows } }));
  return { ...extra, read } satisfies PageDataClient;
}

/** The page, as a host keeps its filter values. `seen` hears every change of them. */
function Page({
  client,
  widgets,
  filters,
  seen,
}: {
  client: PageDataClient;
  widgets: PageWidget[];
  filters: PageFilter[];
  seen?: (values: FilterValues) => void;
}) {
  const [values, setValues] = useState<FilterValues>({});
  return (
    <PageView
      widgets={widgets}
      filters={filters}
      registry={registry}
      client={client}
      filterValues={values}
      onFilterValues={(next) => {
        seen?.(next);
        setValues(next);
      }}
    />
  );
}

const search: PageFilter = { name: "q", type: "search", label: "Search" };
const lastRead = (client: ReturnType<typeof clientOf>) => client.read.mock.calls.at(-1)?.[1];

describe("Search and filter, drawn where the widget sits", () => {
  test("the filters are in the widget's cell, and nothing is drawn above the page", async () => {
    const client = clientOf();
    const { container } = render(
      <Page client={client} widgets={[filterWidget([search]), table]} filters={[search]} />,
    );
    await screen.findByText("INV-1");
    const bar = container.querySelector("search") as HTMLElement;
    expect(bar.getAttribute("aria-label")).toBe("Filters");
    // In its widget's section, which is a cell of the page's grid; not a bar before the grid.
    const cell = bar.closest("section");
    expect(cell?.getAttribute("aria-label")).toBe("Search and filter");
    expect(bar.parentElement?.parentElement).toBe(cell);
    expect(container.firstElementChild?.firstElementChild?.contains(bar)).toBe(true);
    expect(container.querySelectorAll("search")).toHaveLength(1);
    // It is drawn with no card around it.
    expect(cell?.className).not.toContain("rounded-panel border border-line bg-surface");
  });

  test("filters with no Search and filter widget on the page are not drawn at all", async () => {
    render(<Page client={clientOf()} widgets={[table]} filters={[search]} />);
    await screen.findByText("INV-1");
    expect(document.querySelector("search")).toBeNull();
  });

  test("typing a search sets it after the pause, and every widget reads again with it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = clientOf();
    render(<Page client={client} widgets={[filterWidget([search]), table]} filters={[search]} />);
    await screen.findByText("INV-1");
    expect(client.read).toHaveBeenCalledTimes(1);
    const box = screen.getByLabelText("Search") as HTMLInputElement;
    expect(box.placeholder).toBe("Search");
    fireEvent.change(box, { target: { value: "ada" } });
    expect(client.read).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(2));
    expect(lastRead(client)).toEqual({ q: "ada" });
  });

  test("Clear puts every filter of the widget back to how it starts, and only when something differs", async () => {
    const choice: PageFilter = {
      name: "clinic",
      type: "choice",
      label: "Clinic",
      choices: ["Hilltop", "Northside"],
      default: "Hilltop",
    };
    const client = clientOf();
    render(
      <Page
        client={client}
        widgets={[filterWidget([choice, search]), table]}
        filters={[choice, search]}
      />,
    );
    await screen.findByText("INV-1");
    // At how it starts: nothing to clear.
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Clinic"), { target: { value: "Northside" } });
    await waitFor(() => expect(lastRead(client)).toEqual({ clinic: "Northside" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(lastRead(client)).toEqual({}));
    expect((screen.getByLabelText("Clinic") as HTMLSelectElement).value).toBe("Hilltop");
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  test("no Clear when the widget does not offer it", async () => {
    const client = clientOf();
    render(
      <Page
        client={client}
        widgets={[filterWidget([{ name: "n", type: "number", label: "At least" }], false), table]}
        filters={[{ name: "n", type: "number", label: "At least" }]}
      />,
    );
    await screen.findByText("INV-1");
    fireEvent.change(screen.getByLabelText("At least"), { target: { value: "5" } });
    fireEvent.submit(screen.getByLabelText("At least").closest("form") as HTMLFormElement);
    await waitFor(() => expect(lastRead(client)).toEqual({ n: 5 }));
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  test("a search has a clear button and Esc clears it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = clientOf();
    render(<Page client={client} widgets={[filterWidget([search]), table]} filters={[search]} />);
    await screen.findByText("INV-1");
    expect(screen.queryByRole("button", { name: "Clear Search" })).toBeNull();
    const box = screen.getByLabelText("Search") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "ada" } });
    expect(screen.getByRole("button", { name: "Clear Search" })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() => expect(lastRead(client)).toEqual({ q: "ada" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear Search" }));
    await waitFor(() => expect(lastRead(client)).toEqual({}));
    expect(box.value).toBe("");

    fireEvent.change(box, { target: { value: "grace" } });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() => expect(lastRead(client)).toEqual({ q: "grace" }));
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(lastRead(client)).toEqual({}));
    expect(box.value).toBe("");
  });

  test("/ focuses the first search box when the focus is not in a field", async () => {
    render(
      <Page client={clientOf()} widgets={[filterWidget([search]), table]} filters={[search]} />,
    );
    await screen.findByText("INV-1");
    const box = screen.getByLabelText("Search");
    expect(document.activeElement).not.toBe(box);
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(box);
    // In a field it is the letter.
    const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    box.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test("a choice over a table's column is offered what the host reads for it", async () => {
    const clinic: PageFilter = {
      name: "clinic",
      type: "choice",
      label: "Clinic",
      from: { table: "visits", column: "clinic" },
    };
    const options = vi.fn(async (_name: string) => ["Hilltop", "Northside"]);
    const client = clientOf({ options });
    render(<Page client={client} widgets={[filterWidget([clinic]), table]} filters={[clinic]} />);
    await screen.findByText("INV-1");
    await waitFor(() => expect(screen.getByLabelText("Clinic").tagName).toBe("SELECT"));
    expect(options).toHaveBeenCalledWith("clinic");
    const select = screen.getByLabelText("Clinic") as HTMLSelectElement;
    expect(
      within(select)
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual(["Any", "Hilltop", "Northside"]);
    fireEvent.change(select, { target: { value: "Northside" } });
    await waitFor(() => expect(lastRead(client)).toEqual({ clinic: "Northside" }));
  });

  test("a choice whose values cannot be read is typed into", async () => {
    const clinic: PageFilter = {
      name: "clinic",
      type: "choice",
      label: "Clinic",
      from: { table: "visits", column: "clinic" },
    };
    const options = vi.fn(async () => {
      throw new Error("no");
    });
    render(
      <Page
        client={clientOf({ options })}
        widgets={[filterWidget([clinic]), table]}
        filters={[clinic]}
      />,
    );
    await screen.findByText("INV-1");
    await waitFor(() => expect(options).toHaveBeenCalled());
    expect(screen.getByLabelText("Clinic").tagName).toBe("INPUT");
  });
});
