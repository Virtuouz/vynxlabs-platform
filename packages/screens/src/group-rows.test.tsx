// @vitest-environment happy-dom

// A list's and a table's rows under a heading for each day, week, month or value.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import type { RowsData, WidgetViewProps } from "@volvel/widgets";
import { corePack, periodWords } from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PageView } from "./PageView.tsx";
import { type PageDataClient, viewRegistry, type WireData } from "./types.ts";

afterEach(cleanup);

const columns = [
  { name: "id", type: "uuid", label: "Id" },
  { name: "starts_at", type: "timestamp", label: "When" },
  { name: "pet", type: "text", label: "Pet" },
  {
    name: "status",
    type: "enum",
    label: "Status",
    values: [
      { value: "booked", label: "Booked" },
      { value: "done", label: "Done" },
    ],
  },
];
const local = (day: number, hour: number) => new Date(2031, 10, day, hour).toISOString();
const visits = [
  { id: "a", starts_at: local(22, 9), pet: "Max", status: "done" },
  { id: "b", starts_at: local(22, 23), pet: "Poppy", status: "booked" },
  { id: "c", starts_at: local(23, 9), pet: "Archie", status: "done" },
  { id: "d", starts_at: null, pet: "Nala", status: null },
];
const views = corePack.views as Record<string, (props: WidgetViewProps<never>) => React.ReactNode>;

function draw(
  type: "core/table" | "core/list",
  config: Record<string, unknown>,
  over: Partial<WidgetViewProps> = {},
  data: Partial<RowsData> = {},
) {
  const View = views[type] as unknown as (props: WidgetViewProps) => React.ReactNode;
  return render(
    <View
      config={config}
      data={{ rows: { shape: "rows", columns, rows: visits, ...data } }}
      size={{ w: 12, h: 8, narrow: false }}
      emit={() => {}}
      building={false}
      {...over}
    />,
  );
}
const byDay = { groupRows: { column: "starts_at", by: "day" } };
const headings = () =>
  [...document.querySelectorAll("[data-row-group]")].map(
    (group) => group.querySelector("th, h3")?.textContent,
  );

describe("what a heading says", () => {
  const now = new Date(2026, 10, 22, 10);
  test("a day, near ones by name", () => {
    expect(periodWords("2026-11-22", "day", now)).toBe("Today · Sunday, Nov 22");
    expect(periodWords("2026-11-23", "day", now)).toBe("Tomorrow · Monday, Nov 23");
    expect(periodWords("2026-11-21", "day", now)).toBe("Yesterday · Saturday, Nov 21");
    expect(periodWords("2026-11-30", "day", now)).toBe("Monday, Nov 30");
    expect(periodWords("2025-11-30", "day", now)).toBe("Sunday, Nov 30, 2025");
  });
  test("a week and a month", () => {
    expect(periodWords("2026-11-16", "week", now)).toBe("This week · Nov 16 – 22");
    expect(periodWords("2026-11-23", "week", now)).toBe("Next week · Nov 23 – 29");
    expect(periodWords("2026-11-30", "week", now)).toBe("Nov 30 – Dec 6");
    expect(periodWords("2026-11-01", "month", now)).toBe("November");
    expect(periodWords("2025-11-01", "month", now)).toBe("November 2025");
  });
});

describe("a table", () => {
  test("has a heading over each day with how many rows it has, and says only the time under it", () => {
    draw("core/table", { columns: [{ column: "starts_at" }, { column: "pet" }], ...byDay });
    expect(headings()).toEqual([
      "Saturday, Nov 22, 20312 rows",
      "Sunday, Nov 23, 20311 row",
      "No date1 row",
    ]);
    const first = document.querySelector('[data-row-group="2031-11-22"]') as HTMLElement;
    const cells = within(first)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells[0]).toMatch(/^9:00\sAM$/);
    expect(cells[1]).toBe("Max");
    expect(within(first).getByRole("rowheader")).toBeTruthy();
  });

  test("says how many a group has in all, while there are more to read", () => {
    draw(
      "core/table",
      byDay,
      {},
      {
        groups: [
          { key: "2031-11-22", count: 40 },
          { key: "2031-11-23", count: 7 },
          { key: null, count: 1 },
        ],
        more: () => {},
        total: 48,
      },
    );
    expect(headings()).toEqual([
      "Saturday, Nov 22, 203140 rows",
      "Sunday, Nov 23, 20317 rows",
      "No date1 row",
    ]);
  });

  test("a heading's sort is within each group", () => {
    draw("core/table", {
      columns: [{ column: "pet", sortable: true }],
      ...byDay,
    });
    fireEvent.click(screen.getByRole("button", { name: "Pet" }));
    fireEvent.click(screen.getByRole("button", { name: "Pet" }));
    const first = document.querySelector('[data-row-group="2031-11-22"]') as HTMLElement;
    expect(
      within(first)
        .getAllByRole("cell")
        .map((one) => one.textContent),
    ).toEqual(["Poppy", "Max"]);
    expect(headings()).toHaveLength(3);
  });

  test("a choice's heading is its chip, and one with none says so", () => {
    draw("core/table", { columns: [{ column: "pet" }], groupRows: { column: "status" } });
    expect(headings()).toEqual(["Done2 rows", "Booked1 row", "No status1 row"]);
  });

  test("is grouped as the list it is on a phone", () => {
    draw(
      "core/table",
      { columns: [{ column: "pet" }, { column: "starts_at" }], ...byDay },
      { size: { w: 12, h: 8, narrow: true } },
    );
    expect(screen.getByRole("region", { name: "Saturday, Nov 22, 2031" })).toBeTruthy();
    expect(headings()).toHaveLength(3);
  });

  test("with nothing chosen, or a column that is not read, is one list", () => {
    draw("core/table", { columns: [{ column: "pet" }], groupRows: { column: "gone" } });
    expect(headings()).toEqual([]);
    expect(screen.getAllByRole("row")).toHaveLength(5);
  });
});

describe("a list", () => {
  test("has a heading over each day, and its rows press and act as before", () => {
    const emit = vi.fn();
    draw(
      "core/list",
      { title: "pet", right: "starts_at", ...byDay },
      { emit, listens: () => true },
    );
    const first = screen.getByRole("region", { name: "Saturday, Nov 22, 2031" });
    expect(within(first).getAllByRole("listitem")).toHaveLength(2);
    expect(within(first).getByText(/^9:00\sAM$/)).toBeTruthy();
    fireEvent.click(within(first).getByText("Max"));
    expect(emit).toHaveBeenCalledWith("rowClick", { record: "a" });
  });
  test("as cards too", () => {
    draw("core/list", { title: "pet", look: "cards", ...byDay });
    expect(headings()).toHaveLength(3);
  });
});

test("the reader's time zone is sent with a grouped widget's read, and with no other", async () => {
  const wire: WireData = { shape: "rows", columns, rows: visits };
  const client: PageDataClient = {
    read: vi.fn(async () => ({ inputs: { rows: wire } })),
    options: async () => [],
  } as unknown as PageDataClient;
  const widget = (id: string, config: Record<string, unknown>): PageWidget =>
    ({
      id,
      type: "core/list",
      at: { x: 0, y: 0, w: 4, h: 4 },
      data: { rows: { source: { visual: { table: "visits" } } } },
      config,
    }) as PageWidget;
  render(
    <PageView
      widgets={[widget("grouped", { title: "pet", ...byDay }), widget("plain", { title: "pet" })]}
      filters={[]}
      registry={viewRegistry(corePack)}
      client={client}
      filterValues={{}}
      onFilterValues={() => {}}
    />,
  );
  await waitFor(() => expect(client.read).toHaveBeenCalledTimes(2));
  const asked = Object.fromEntries(
    vi.mocked(client.read).mock.calls.map(([id, , options]) => [id, options?.zone]),
  );
  expect(asked).toEqual({
    grouped: Intl.DateTimeFormat().resolvedOptions().timeZone,
    plain: undefined,
  });
});
