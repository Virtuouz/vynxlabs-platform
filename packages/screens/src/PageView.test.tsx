// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageFilter, PageWidget } from "@volvel/manifest";
import { corePack } from "@volvel/widgets-core/views";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PageView, type PageViewProps } from "./PageView.tsx";
import {
  type FilterValues,
  type PageDataClient,
  viewRegistry,
  WidgetReadError,
  type WireData,
} from "./types.ts";

// The chart engine is fetched when the first chart appears. What is drawn is the spec and the rows.
vi.mock("@volvel/ui", async (original) => ({
  ...(await original<typeof import("@volvel/ui")>()),
  Chart: (props: {
    spec: object;
    data?: unknown[];
    onPick?: (row: Record<string, unknown>) => void;
  }) => (
    <button
      type="button"
      data-testid="chart"
      data-spec={JSON.stringify(props.spec)}
      data-rows={JSON.stringify(props.data)}
      onClick={() => props.onPick?.((props.data?.[0] ?? {}) as Record<string, unknown>)}
    >
      chart
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const registry = viewRegistry(corePack);
const col = (name: string, type = "text", label = name) => ({ name, type, label });

const rowsInput: WireData = {
  shape: "rows",
  columns: [
    col("id", "uuid", "Id"),
    col("number", "text", "Number"),
    col("total", "number", "Total"),
    {
      ...col("status", "enum", "Status"),
      values: [{ value: "paid", label: "Paid", color: "#2e7d32" }, { value: "open" }],
    },
    col("client", "reference", "Client"),
  ],
  rows: [
    { id: "a", number: "INV-1", total: 120, status: "paid", client: "c1" },
    { id: "b", number: "INV-2", total: 60, status: "open", client: "c2" },
  ],
  names: { client: { c1: "Ada Lovelace", c2: "Grace Hopper" } },
};

const summaryInput: WireData = {
  shape: "summary",
  columns: [col("clinic", "text", "Clinic"), col("total", "number", "Total")],
  breakdowns: ["clinic"],
  values: ["total"],
  rows: [
    { clinic: "Hilltop", total: 14000 },
    { clinic: "Northside", total: 23500 },
  ],
};

const statInput: WireData = {
  shape: "summary",
  columns: [col("total", "number", "Total")],
  breakdowns: [],
  values: ["total"],
  rows: [{ total: 1500 }],
  previous: [{ total: 1000 }],
  trend: [
    { at: "2026-01", value: 1 },
    { at: "2026-02", value: 3 },
    { at: "2026-03", value: 2 },
  ],
};

const pivotInput: WireData = {
  shape: "summary",
  columns: [
    col("clinic", "text", "Clinic"),
    col("status", "text", "Status"),
    col("n", "number", "Count"),
  ],
  breakdowns: ["clinic", "status"],
  values: ["n"],
  rows: [
    { clinic: "Hilltop", status: "paid", n: 3 },
    { clinic: "Hilltop", status: "open", n: 1 },
    { clinic: "Northside", status: "paid", n: 5 },
  ],
};

/** What the wire gave, with some of it changed. */
const patched = (wire: WireData, patch: object) => ({ ...wire, ...patch }) as WireData;

const place = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const table: PageWidget = {
  id: "invoices",
  type: "core/table",
  title: "Invoices",
  at: place(0, 0, 12, 8),
  data: { rows: { source: { visual: { table: "invoices" } } } },
  config: {
    columns: [
      { column: "number", label: "No." },
      { column: "total", as: "bar", format: { style: "currency", minorUnits: false } },
      { column: "status" },
      { column: "client" },
    ],
  },
};

/** A client that answers each widget from a table of wire data, and remembers what it was asked. */
function clientOf(
  answers: Record<string, Record<string, WireData> | ((call: number) => Promise<never>)>,
): PageDataClient & { read: ReturnType<typeof vi.fn> } {
  const calls: Record<string, number> = {};
  return {
    read: vi.fn(async (widget: string) => {
      calls[widget] = (calls[widget] ?? 0) + 1;
      const answer = answers[widget];
      if (typeof answer === "function") return answer(calls[widget] as number);
      return { inputs: answer ?? {} };
    }),
  };
}

/** A page's filters are drawn by a Search and filter widget, where it sits: given `filters`, one is placed at the top. */
function Page(props: Partial<PageViewProps> & { client: PageDataClient; widgets: PageWidget[] }) {
  const [values, setValues] = useState<FilterValues>({});
  const widgets: PageWidget[] =
    props.filters && props.filters.length > 0
      ? [
          {
            id: "filters",
            type: "core/filter",
            at: { x: 0, y: 0, w: 12, h: 2 },
            config: { filters: props.filters, reset: true },
          },
          ...props.widgets,
        ]
      : props.widgets;
  return (
    <PageView
      filters={[]}
      registry={registry}
      filterValues={values}
      onFilterValues={setValues}
      {...props}
      widgets={widgets}
    />
  );
}

describe("the core pack draws from wire data", () => {
  test("a table: headings, names for references, chips, bars and money", async () => {
    render(<Page client={clientOf({ invoices: { rows: rowsInput } })} widgets={[table]} />);
    const grid = await screen.findByRole("table");
    expect(within(grid).getByRole("columnheader", { name: "No." })).toBeTruthy();
    expect(within(grid).getByText("Ada Lovelace")).toBeTruthy();
    // An enum value is a chip with its label, and one with no label shows its value.
    expect(within(grid).getByText("Paid")).toBeTruthy();
    expect(within(grid).getByText("Open")).toBeTruthy();
    expect(within(grid).getAllByText("$120.00")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Invoices" })).toBeTruthy();
  });

  test("a table is a list of cards on a phone, and one row of it raises rowClick", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 390,
    } as DOMRect);
    const onEvent = vi.fn();
    render(
      <Page
        client={clientOf({ invoices: { rows: rowsInput } })}
        widgets={[table]}
        onEvent={onEvent}
      />,
    );
    await screen.findByText("INV-1");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByText("INV-2"));
    expect(onEvent).toHaveBeenCalledWith("invoices", "rowClick", { record: "b" });
  });

  test("a table on a page that is read raises rowClick, and a row is not a link", async () => {
    const onEvent = vi.fn();
    render(
      <Page
        client={clientOf({ invoices: { rows: rowsInput } })}
        widgets={[table]}
        onEvent={onEvent}
      />,
    );
    fireEvent.click((await screen.findByText("INV-1")).closest("tr") as HTMLElement);
    expect(onEvent).toHaveBeenCalledWith("invoices", "rowClick", { record: "a" });
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("a list: a heading, the line under it, and a status chip", async () => {
    const list: PageWidget = {
      id: "recent",
      type: "core/list",
      title: "Recent",
      at: place(0, 0, 4, 8),
      data: { rows: { source: { visual: { table: "invoices" } } } },
      config: { title: "number", subtitle: "client", badge: "status" },
    };
    render(<Page client={clientOf({ recent: { rows: rowsInput } })} widgets={[list]} />);
    expect(await screen.findByText("INV-1")).toBeTruthy();
    expect(screen.getByText("Grace Hopper")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
  });

  test("a stat: the number, how it stands against the period before, and its line", async () => {
    const stat: PageWidget = {
      id: "total",
      type: "core/stat",
      title: "Invoiced",
      at: place(0, 0, 3, 3),
      data: {
        value: {
          source: {
            visual: { table: "invoices", measures: [{ fn: "sum", column: "total", as: "total" }] },
          },
        },
      },
      config: { format: { style: "currency" }, caption: "Last 30 days", compareTo: "range" },
    };
    render(<Page client={clientOf({ total: { value: statInput } })} widgets={[stat]} />);
    expect(await screen.findByText("$1,500.00")).toBeTruthy();
    // Up 50%, which is good news unless the stat says otherwise; the sentence is read aloud once.
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("Last 30 days")).toBeTruthy();
    expect(screen.getByRole("img", { name: /over time: from \$1\.00 to \$2\.00/ })).toBeTruthy();
  });

  test("a stat says whether a fall is good news", async () => {
    const stat: PageWidget = {
      id: "overdue",
      type: "core/stat",
      at: place(0, 0, 3, 3),
      data: {
        value: {
          source: {
            visual: { table: "invoices", measures: [{ fn: "sum", column: "total", as: "total" }] },
          },
        },
      },
      config: { goodWhen: "down", delta: "absolute" },
    };
    const down: WireData = patched(statInput, { rows: [{ total: 5 }], previous: [{ total: 9 }] });
    render(<Page client={clientOf({ overdue: { value: down } })} widgets={[stat]} />);
    const mark = (await screen.findByText("4")).closest("span.text-success");
    expect(mark).not.toBeNull();
  });

  test("a chart: the breakdown along the bottom, and a click on a point gives its group", async () => {
    const chart: PageWidget = {
      id: "by_clinic",
      type: "core/chart",
      title: "By clinic",
      at: place(0, 0, 6, 6),
      data: {
        rows: {
          source: {
            visual: {
              table: "invoices",
              measures: [{ fn: "sum", column: "total", as: "total" }],
              groupBy: [{ column: "issued" }],
            },
          },
        },
      },
      config: { mark: "bar", format: { style: "currency" } },
    };
    const onEvent = vi.fn();
    render(
      <Page
        client={clientOf({ by_clinic: { rows: summaryInput } })}
        widgets={[chart]}
        onEvent={onEvent}
      />,
    );
    const drawn = await screen.findByTestId("chart");
    const spec = JSON.parse(drawn.dataset.spec as string);
    expect(spec.mark.type).toBe("bar");
    expect(spec.encoding.x.field).toBe("clinic");
    expect(spec.encoding.y.field).toBe("total");
    // Big figures up the side are written short ("$40k"), as the boards draw them.
    expect(spec.encoding.y.axis.format).toBe("$.3~s");
    // Nothing listens to its points (no `on.pointClick`), so a click is nothing: a point is
    // pressable only when the page does something with it (phase 26).
    fireEvent.click(drawn);
    expect(onEvent).not.toHaveBeenCalled();
  });

  test("a chart draws the period before as a dashed line, and one more breakdown as a series", async () => {
    const chart: PageWidget = {
      id: "trend",
      type: "core/chart",
      at: place(0, 0, 6, 6),
      data: {
        rows: {
          source: {
            visual: {
              table: "invoices",
              measures: [{ fn: "sum", column: "total", as: "total" }],
              groupBy: [{ column: "issued" }, { column: "clinic" }],
            },
          },
        },
      },
      config: { mark: "line", compareTo: "range" },
    };
    const compared: WireData = patched(summaryInput, { previous: [{ total: 10 }, { total: 20 }] });
    const { unmount } = render(
      <Page client={clientOf({ trend: { rows: compared } })} widgets={[chart]} />,
    );
    const spec = JSON.parse((await screen.findByTestId("chart")).dataset.spec as string);
    // The soft area under a single line, the line, and the period before.
    expect(spec.layer).toHaveLength(3);
    expect(spec.layer[2].mark.strokeDash).toEqual([4, 4]);
    unmount();
    const series: WireData = patched(pivotInput, {
      columns: pivotInput.shape === "summary" ? pivotInput.columns : [],
    });
    render(
      <Page
        client={clientOf({ trend: { rows: series } })}
        widgets={[{ ...chart, config: { mark: "bar", bars: "grouped" } }]}
      />,
    );
    const grouped = JSON.parse((await screen.findByTestId("chart")).dataset.spec as string);
    // The series is named by its label ("Paid"); the rows keep the stored value, which a click gives.
    expect(grouped.encoding.color.field).toBe("status_label");
    expect(grouped.encoding.xOffset.field).toBe("status_label");
  });

  test("a pivot: the last breakdown across the top, and totals", async () => {
    const pivot: PageWidget = {
      id: "grid",
      type: "core/pivot",
      title: "Count",
      at: place(0, 0, 6, 7),
      data: {
        rows: {
          source: {
            visual: {
              table: "invoices",
              measures: [{ fn: "sum", column: "total", as: "total" }],
              groupBy: [{ column: "issued" }, { column: "clinic" }],
            },
          },
        },
      },
    };
    render(<Page client={clientOf({ grid: { rows: pivotInput } })} widgets={[pivot]} />);
    const grid = await screen.findByRole("table");
    expect(within(grid).getByRole("columnheader", { name: "paid" })).toBeTruthy();
    const hilltop = within(grid)
      .getByRole("rowheader", { name: "Hilltop" })
      .closest("tr") as HTMLElement;
    // 3 paid, 1 open, 4 in all.
    expect(
      within(hilltop)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["3", "1", "4"]);
    const foot = within(grid)
      .getByRole("rowheader", { name: "Total" })
      .closest("tr") as HTMLElement;
    expect(
      within(foot)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["8", "1", "9"]);
  });

  test("text is Markdown, and draws with no read", async () => {
    const text: PageWidget = {
      id: "note",
      type: "core/text",
      at: place(0, 0, 6, 2),
      config: { text: "## Welcome\n\nStart here." },
    };
    const client = clientOf({});
    render(<Page client={client} widgets={[text]} />);
    expect(await screen.findByText("Start here.")).toBeTruthy();
    expect(client.read).not.toHaveBeenCalled();
  });

  test("while building, a double-click on a Text widget asks to write it where it is", async () => {
    const text: PageWidget = {
      id: "note",
      type: "core/text",
      at: place(0, 0, 6, 2),
      config: { text: "Start here." },
    };
    const onEditText = vi.fn();
    render(
      <PageView
        widgets={[text, table]}
        filters={[]}
        registry={registry}
        client={clientOf({})}
        filterValues={{}}
        onFilterValues={() => undefined}
        editing={{
          selected: undefined,
          onSelect: () => undefined,
          onChange: () => undefined,
          onRename: () => undefined,
          onEditText,
        }}
      />,
    );
    fireEvent.doubleClick(await screen.findByText("Start here."));
    expect(onEditText).toHaveBeenCalledWith("note");
    // Another widget's double-click is not for it.
    fireEvent.doubleClick(document.querySelector(`[data-widget-cell="${table.id}"]`) as Element);
    expect(onEditText).toHaveBeenCalledTimes(1);
  });
});

describe("the frame", () => {
  test("loading, then the widget", async () => {
    let answer: (value: { inputs: Record<string, WireData> }) => void = () => {};
    const client: PageDataClient = {
      read: () => new Promise((resolve) => (answer = resolve)),
    };
    render(<Page client={client} widgets={[table]} />);
    expect(screen.getByRole("status", { name: "Loading Invoices" })).toBeTruthy();
    await act(async () => answer({ inputs: { rows: rowsInput } }));
    expect(await screen.findByText("INV-1")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading Invoices" })).toBeNull();
  });

  test("nothing to show says so, and says why when the page has filters", async () => {
    const none: WireData = patched(rowsInput, { rows: [] });
    const { unmount } = render(
      <Page client={clientOf({ invoices: { rows: none } })} widgets={[table]} />,
    );
    expect(await screen.findByText("There is nothing here yet.")).toBeTruthy();
    unmount();
    // A filter that holds nothing narrows nothing: the words are the plain ones.
    const idle: PageFilter[] = [{ name: "q", type: "text", label: "Search" }];
    const again = render(
      <Page client={clientOf({ invoices: { rows: none } })} widgets={[table]} filters={idle} />,
    );
    expect(await screen.findByText("There is nothing here yet.")).toBeTruthy();
    again.unmount();
    // One that holds a value does, and the person is offered to take it off.
    const filters: PageFilter[] = [{ name: "q", type: "text", label: "Search", default: "zzz" }];
    render(
      <Page client={clientOf({ invoices: { rows: none } })} widgets={[table]} filters={filters} />,
    );
    expect(await screen.findByText("Nothing matches the filters.")).toBeTruthy();
    // They are how they start: what is left is to take them off.
    expect(await screen.findByRole("button", { name: "Show everything" })).toBeTruthy();
  });

  test("an empty search says the words searched; Clear filters puts back how the page starts", async () => {
    const none: WireData = patched(rowsInput, { rows: [] });
    const starting: PageFilter[] = [
      { name: "q", type: "search", label: "Search" },
      { name: "range", type: "date_range", label: "Issued", default: "last_30_days" },
    ];
    const seen: FilterValues[] = [];
    const Held = () => {
      const [values, setValues] = useState<FilterValues>({ q: "zzzqqq", range: null });
      return (
        <PageView
          filters={starting}
          registry={registry}
          client={clientOf({ invoices: { rows: none } })}
          filterValues={values}
          onFilterValues={(next) => {
            seen.push(next);
            setValues(next);
          }}
          widgets={[table]}
        />
      );
    };
    render(<Held />);
    expect(await screen.findByText("Nothing matches \u201czzzqqq\u201d")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    // Not null for each: the search is off, and the range is the one the page starts on.
    expect(seen.at(-1)).toEqual({});
    expect(JSON.stringify(seen)).not.toContain("null");
  });

  test("a goal that starts on a month reads that month again after Clear, not all time", async () => {
    const goal: PageFilter[] = [
      { name: "month", type: "date_range", label: "Goal month", default: "this_month" },
    ];
    const none: WireData = patched(rowsInput, { rows: [] });
    let latest: FilterValues = { month: "last_month" };
    render(
      <PageView
        filters={goal}
        registry={registry}
        client={clientOf({ invoices: { rows: none } })}
        filterValues={latest}
        onFilterValues={(next) => {
          latest = next;
        }}
        widgets={[table]}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Clear filters" }));
    expect(latest).toEqual({});
  });

  test("a read that failed says why, and Try again reads again", async () => {
    const client = clientOf({
      invoices: async (call) => {
        if (call === 1) throw new Error("The database did not answer.");
        return { inputs: { rows: rowsInput } } as never;
      },
    });
    render(<Page client={client} widgets={[table]} />);
    expect(await screen.findByText("The database did not answer.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("INV-1")).toBeTruthy();
    expect(client.read).toHaveBeenCalledTimes(2);
  });

  test("a widget that may not be seen is said in the same place, with what is missing", async () => {
    const client = clientOf({
      invoices: async () => {
        throw new WidgetReadError("You need to read the table invoices.", 403);
      },
    });
    render(<Page client={client} widgets={[table]} />);
    expect(
      await screen.findByText(/You may not see this\. You need to read the table invoices\./),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  test("a type nobody has is said, not skipped", async () => {
    const odd: PageWidget = {
      id: "odd",
      type: "labs/orbit",
      title: "Orbit",
      at: place(0, 0, 6, 4),
    };
    render(<Page client={clientOf({})} widgets={[odd]} />);
    expect(await screen.findByText('There is no widget called "labs/orbit".')).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Orbit" })).toBeTruthy();
  });

  test("a widget with a subtitle draws it under its title", async () => {
    render(
      <Page
        client={clientOf({ invoices: { rows: rowsInput } })}
        widgets={[{ ...table, subtitle: "Newest first" }]}
      />,
    );
    expect(await screen.findByText("Newest first")).toBeTruthy();
  });

  test("a page with no widgets says so", () => {
    render(<Page client={clientOf({})} widgets={[]} />);
    expect(screen.getByText("This page has nothing on it yet")).toBeTruthy();
  });

  test("on a phone a widget whose definition says hide is not drawn, and in the builder it is, marked", async () => {
    // No core widget hides; a pack's does.
    const hiding = viewRegistry({
      definitions: [
        {
          ...(corePack.definitions.find((d) => d.type === "core/text") as object),
          type: "labs/note",
          layout: { min: { w: 1, h: 1 }, default: { w: 6, h: 2 }, phone: "hide" },
        } as never,
      ],
      views: { "labs/note": () => <p>Aside</p> },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 390,
    } as DOMRect);
    const aside: PageWidget = { id: "aside", type: "labs/note", at: place(0, 0, 6, 2) };
    const { unmount } = render(<Page client={clientOf({})} widgets={[aside]} registry={hiding} />);
    expect(screen.queryByText("Aside")).toBeNull();
    unmount();
    render(
      <Page
        client={clientOf({})}
        widgets={[aside]}
        registry={hiding}
        editing={{
          selected: undefined,
          onSelect: () => {},
          onChange: () => {},
          onRename: () => {},
        }}
      />,
    );
    // Building: the widget itself is not drawn; a dashed place-holder says so, and can be chosen.
    expect(screen.queryByText("Aside")).toBeNull();
    expect(screen.getByText(/is hidden on phones/)).toBeTruthy();
  });
});

describe("reading", () => {
  const filters: PageFilter[] = [
    { name: "range", label: "Issued", type: "date_range", default: "last_30_days" },
    { name: "clinic", label: "Clinic", type: "choice", choices: ["Hilltop", "Northside"] },
    { name: "q", label: "Search", type: "text" },
    { name: "min", label: "At least", type: "number" },
  ];

  test("each widget reads once, with the filters, and again when a filter changes", async () => {
    const client = clientOf({ invoices: { rows: rowsInput } });
    render(<Page client={client} widgets={[table]} filters={filters} />);
    await screen.findByText("INV-1");
    expect(client.read).toHaveBeenCalledTimes(1);
    expect(client.read.mock.calls[0]?.[0]).toBe("invoices");
    expect(client.read.mock.calls[0]?.[1]).toEqual({});

    // The date filter shows its default, and a choice of range sets it by name.
    expect((screen.getByLabelText("Issued") as HTMLSelectElement).value).toBe("last_30_days");
    fireEvent.change(screen.getByLabelText("Issued"), { target: { value: "this_year" } });
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(2));
    expect(client.read.mock.calls[1]?.[1]).toEqual({ range: "this_year" });

    fireEvent.change(screen.getByLabelText("Clinic"), { target: { value: "Hilltop" } });
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(3));
    expect(client.read.mock.calls[2]?.[1]).toEqual({ range: "this_year", clinic: "Hilltop" });

    // "Any" is a choice to narrow nothing: it is not set at all (and never `null` in an address).
    fireEvent.change(screen.getByLabelText("Clinic"), { target: { value: "" } });
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(4));
    expect(client.read.mock.calls[3]?.[1]).toEqual({ range: "this_year" });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(5));
    expect(client.read.mock.calls[4]?.[1]).toEqual({});
  });

  test("all time is null, and two dates are a range", async () => {
    const client = clientOf({ invoices: { rows: rowsInput } });
    render(<Page client={client} widgets={[table]} filters={filters} />);
    await screen.findByText("INV-1");
    fireEvent.change(screen.getByLabelText("Issued"), { target: { value: "all" } });
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(2));
    expect(client.read.mock.calls[1]?.[1]).toEqual({ range: null });

    fireEvent.change(screen.getByLabelText("Issued"), { target: { value: "custom" } });
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(3));
    const set = client.read.mock.calls[2]?.[1] as { range: { from: string; to: string } };
    expect(set.range.from <= set.range.to).toBe(true);

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-01-31" } });
    await waitFor(() =>
      expect(client.read.mock.calls.at(-1)?.[1]).toEqual({
        range: { from: "2026-01-01", to: "2026-01-31" },
      }),
    );
    // The start after the end is said, and not read.
    const reads = client.read.mock.calls.length;
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-01" } });
    expect(screen.getByText("The start is after the end.")).toBeTruthy();
    expect(client.read.mock.calls.length).toBe(reads);
  });

  test("typed text and numbers are read once the typing rests", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = clientOf({ invoices: { rows: rowsInput } });
    render(<Page client={client} widgets={[table]} filters={filters} />);
    await screen.findByText("INV-1");
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "ada" } });
    fireEvent.change(screen.getByLabelText("At least"), { target: { value: "50" } });
    expect(client.read).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() => expect(client.read.mock.calls.at(-1)?.[1]).toEqual({ q: "ada", min: 50 }));
  });

  test("a read still on its way is abandoned when the next begins", async () => {
    const signals: AbortSignal[] = [];
    const client: PageDataClient = {
      read: (_widget, _filters, options) => {
        if (options?.signal) signals.push(options.signal);
        return new Promise(() => {});
      },
    };
    const { rerender } = render(<Page client={client} widgets={[table]} refreshKey={0} />);
    rerender(<Page client={client} widgets={[table]} refreshKey={1} />);
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  test("moving a widget does not read it again; changing what it asks does", async () => {
    const client = clientOf({ invoices: { rows: rowsInput } });
    const { rerender } = render(<Page client={client} widgets={[table]} />);
    await screen.findByText("INV-1");
    rerender(<Page client={client} widgets={[{ ...table, at: place(0, 3, 12, 8) }]} />);
    expect(client.read).toHaveBeenCalledTimes(1);
    rerender(
      <Page
        client={client}
        widgets={[{ ...table, data: { rows: { source: { visual: { table: "bills" } } } } }]}
      />,
    );
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(2));
  });

  test("Show more asks for the next page with the cursor, and appends it", async () => {
    const first: WireData = patched(rowsInput, { next: "cursor-2" });
    const second: WireData = patched(rowsInput, {
      rows: [{ id: "c", number: "INV-3", total: 5, status: "open", client: "c1" }],
    });
    const read = vi.fn(
      async (_widget: string, _filters: FilterValues, options?: { cursor?: string }) => ({
        inputs: { rows: options?.cursor === "cursor-2" ? second : first },
      }),
    );
    render(<Page client={{ read }} widgets={[table]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByText("INV-3")).toBeTruthy();
    // The rows already shown stay, and the last page has no button.
    expect(screen.getByText("INV-1")).toBeTruthy();
    expect(read.mock.calls[1]?.[2]).toMatchObject({ input: "rows", cursor: "cursor-2" });
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  test("a next page that fails keeps the rows and offers another try", async () => {
    const first: WireData = patched(rowsInput, { next: "cursor-2" });
    let tries = 0;
    const read = vi.fn(
      async (_widget: string, _filters: FilterValues, options?: { cursor?: string }) => {
        if (!options?.cursor) return { inputs: { rows: first } };
        tries++;
        if (tries === 1) throw new Error("Timed out.");
        return {
          inputs: {
            rows: patched(rowsInput, { rows: [{ id: "c", number: "INV-3" }] }),
          },
        };
      },
    );
    render(<Page client={{ read }} widgets={[table]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByText("More could not be loaded. Timed out.")).toBeTruthy();
    expect(screen.getByText("INV-1")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0] as HTMLElement);
    expect(await screen.findByText("INV-3")).toBeTruthy();
  });
});

describe("the canvas", () => {
  const widgets: PageWidget[] = [
    {
      id: "total",
      type: "core/stat",
      title: "Invoiced",
      at: place(0, 0, 3, 3),
      data: {
        value: {
          source: {
            visual: { table: "invoices", measures: [{ fn: "sum", column: "total", as: "total" }] },
          },
        },
      },
    },
    {
      id: "by_clinic",
      type: "core/chart",
      title: "By clinic",
      at: place(3, 0, 6, 6),
      data: {
        rows: {
          source: {
            visual: {
              table: "invoices",
              measures: [{ fn: "sum", column: "total", as: "total" }],
              groupBy: [{ column: "clinic" }],
            },
          },
        },
      },
      config: { mark: "bar" },
    },
    {
      id: "invoices",
      type: "core/table",
      title: "Invoices",
      at: place(0, 6, 12, 8),
      data: { rows: { source: { visual: { table: "invoices" } } } },
    },
  ];
  const client = () =>
    clientOf({
      total: { value: statInput },
      by_clinic: { rows: summaryInput },
      invoices: { rows: rowsInput },
    });

  /** A builder whose state is the page's, with what it was told kept for looking at. */
  function Builder({
    spies,
    start = widgets,
    onEvent,
  }: {
    onEvent?: PageViewProps["onEvent"];
    spies: {
      onChange: (widgets: PageWidget[], label: string) => void;
      onSelect: (id: string | undefined) => void;
      onRename: (id: string, title: string) => void;
      onColumn?: (id: string, column: string) => void;
    };
    start?: PageWidget[];
  }) {
    const [list, setList] = useState(start);
    const [selected, setSelected] = useState<string>();
    return (
      <Page
        client={client()}
        widgets={list}
        {...(onEvent ? { onEvent } : {})}
        editing={{
          selected,
          onSelect: (id) => {
            spies.onSelect(id);
            setSelected(id);
          },
          onChange: (next, label) => {
            spies.onChange(next, label);
            setList(next);
          },
          onRename: spies.onRename,
          ...(spies.onColumn ? { onColumn: spies.onColumn } : {}),
        }}
      />
    );
  }
  const spies = () => ({
    onChange: vi.fn(),
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onColumn: vi.fn(),
  });
  const group = (name: string) => screen.getByRole("group", { name });
  const lastList = (s: ReturnType<typeof spies>) =>
    (s.onChange.mock.lastCall?.[0] ?? []) as PageWidget[];
  const at = (list: PageWidget[], id: string) => list.find((one) => one.id === id)?.at;

  test("a click anywhere on a widget chooses it, and the chip says how big and where", async () => {
    const s = spies();
    render(<Builder spies={s} />);
    await screen.findByText("INV-1");
    expect(screen.queryByText(/ · col /)).toBeNull();
    fireEvent.click(within(group("By clinic")).getByTestId("chart"));
    expect(s.onSelect).toHaveBeenLastCalledWith("by_clinic");
    expect(screen.getByText("6 × 6 · col 4 · row 1")).toBeTruthy();
    expect(group("By clinic").hasAttribute("data-selected")).toBe(true);
    // A click on the empty page lets it go.
    fireEvent.click(group("By clinic").parentElement as HTMLElement);
    expect(s.onSelect).toHaveBeenLastCalledWith(undefined);
  });

  test("a click in the builder is not an event of the widget", async () => {
    const onEvent = vi.fn();
    const s = spies();
    render(<Builder spies={s} onEvent={onEvent} />);
    fireEvent.click((await screen.findByText("INV-1")).closest("tr") as HTMLElement);
    expect(onEvent).not.toHaveBeenCalled();
    expect(s.onSelect).toHaveBeenCalledWith("invoices");
  });

  test("arrow keys move the chosen widget a cell, and say where it is", async () => {
    const s = spies();
    render(<Builder spies={s} />);
    await screen.findByText("INV-1");
    const chart = group("By clinic");
    fireEvent.click(chart);
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(s.onChange).toHaveBeenLastCalledWith(expect.anything(), "Moved By clinic");
    expect(at(lastList(s), "by_clinic")).toEqual(place(4, 0, 6, 6));
    expect(screen.getByText("By clinic is at column 5, row 1.")).toBeTruthy();
    fireEvent.keyDown(group("By clinic"), { key: "ArrowDown" });
    // What is under it is pushed down.
    const moved = s.onChange.mock.lastCall?.[0] as PageWidget[];
    expect(at(moved, "by_clinic")).toEqual(place(4, 1, 6, 6));
    expect(at(moved, "invoices")?.y).toBe(7);
  });

  test("Shift and the arrows change the size, and hold it to the definition's least and most", async () => {
    const s = spies();
    render(<Builder spies={s} />);
    await screen.findByText("INV-1");
    const stat = group("Invoiced");
    fireEvent.click(stat);
    fireEvent.keyDown(stat, { key: "ArrowRight", shiftKey: true });
    expect(s.onChange).toHaveBeenLastCalledWith(expect.anything(), "Resized Invoiced");
    expect(at(lastList(s), "total")).toEqual(place(0, 0, 4, 3));
    expect(screen.getByText("Invoiced is 4 wide and 3 tall.")).toBeTruthy();
    // The stat is at least 2 by 2: three steps up from 3 tall stops at 2, so the last does nothing.
    const calls = s.onChange.mock.calls.length;
    fireEvent.keyDown(group("Invoiced"), { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(group("Invoiced"), { key: "ArrowUp", shiftKey: true });
    expect(at(lastList(s), "total")).toEqual(place(0, 0, 4, 2));
    expect(s.onChange.mock.calls.length).toBe(calls + 1);
    // The chart is at least 3 wide.
    const chart = group("By clinic");
    fireEvent.click(chart);
    for (let step = 0; step < 5; step++)
      fireEvent.keyDown(group("By clinic"), { key: "ArrowLeft", shiftKey: true });
    expect(at(lastList(s), "by_clinic")?.w).toBe(3);
  });

  test("a widget cannot be moved off the page", async () => {
    const s = spies();
    render(<Builder spies={s} />);
    await screen.findByText("INV-1");
    fireEvent.click(group("Invoiced"));
    fireEvent.keyDown(group("Invoiced"), { key: "ArrowLeft" });
    fireEvent.keyDown(group("Invoiced"), { key: "ArrowUp" });
    expect(s.onChange).not.toHaveBeenCalled();
  });

  test("Delete removes the chosen widget and what was under it rises", async () => {
    const s = spies();
    render(<Builder spies={s} />);
    await screen.findByText("INV-1");
    fireEvent.click(group("By clinic"));
    fireEvent.keyDown(group("By clinic"), { key: "Delete" });
    expect(s.onChange).toHaveBeenLastCalledWith(expect.anything(), "Removed By clinic");
    const left = s.onChange.mock.lastCall?.[0] as PageWidget[];
    expect(left.map((one) => one.id)).toEqual(["total", "invoices"]);
    expect(at(left, "invoices")?.y).toBe(3);
    expect(s.onSelect).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByText("By clinic is removed.")).toBeTruthy();
  });

  test("Ctrl+D and ⌘D copy it under itself, choose the copy, and leave the browser's bookmark alone", async () => {
    const s = spies();
    render(<Builder spies={s} />);
    await screen.findByText("INV-1");
    fireEvent.click(group("Invoiced"));
    const notBookmarked = fireEvent.keyDown(group("Invoiced"), { key: "d", ctrlKey: true });
    expect(notBookmarked).toBe(false);
    expect(s.onChange).toHaveBeenLastCalledWith(expect.anything(), "Duplicated Invoiced");
    const made = s.onChange.mock.lastCall?.[0] as PageWidget[];
    expect(made.map((one) => one.id).sort()).toEqual([
      "by_clinic",
      "invoices",
      "total",
      "total_copy",
    ]);
    expect(made.find((one) => one.id === "total_copy")?.title).toBe("Invoiced copy");
    expect(s.onSelect).toHaveBeenLastCalledWith("total_copy");
    // ⌘D on the copy makes another.
    fireEvent.keyDown(screen.getByRole("group", { name: "Invoiced copy" }), {
      key: "D",
      metaKey: true,
    });
    expect(lastList(s).some((one) => one.id === "total_copy2")).toBe(true);
  });

  test("Esc lets go of it", async () => {
    const s = spies();
    render(<Builder spies={s} />);
    await screen.findByText("INV-1");
    fireEvent.click(group("Invoiced"));
    fireEvent.keyDown(group("Invoiced"), { key: "Escape" });
    expect(s.onSelect).toHaveBeenLastCalledWith(undefined);
    expect(group("Invoiced").hasAttribute("data-selected")).toBe(false);
  });

  test("the title is renamed where it stands: Enter keeps, Esc puts the old one back, and typing is not a move", async () => {
    const s = spies();
    render(<Builder spies={s} />);
    await screen.findByText("INV-1");
    fireEvent.click(group("By clinic"));
    fireEvent.click(screen.getByTitle("Rename"));
    const field = screen.getByLabelText("Widget title") as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "Money by clinic" } });
    // Keys typed into the field are the field's: no move, no delete.
    fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.keyDown(field, { key: "Delete" });
    expect(s.onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(s.onRename).toHaveBeenCalledTimes(1);
    expect(s.onRename).toHaveBeenCalledWith("by_clinic", "Money by clinic");
    expect(screen.queryByLabelText("Widget title")).toBeNull();

    fireEvent.click(screen.getByTitle("Rename"));
    fireEvent.change(screen.getByLabelText("Widget title"), {
      target: { value: "Something else" },
    });
    fireEvent.keyDown(screen.getByLabelText("Widget title"), { key: "Escape" });
    expect(s.onRename).toHaveBeenCalledTimes(1);
    // Esc in the field does not let go of the widget.
    expect(s.onSelect).not.toHaveBeenLastCalledWith(undefined);

    fireEvent.click(screen.getByTitle("Rename"));
    fireEvent.change(screen.getByLabelText("Widget title"), { target: { value: "On blur" } });
    fireEvent.blur(screen.getByLabelText("Widget title"));
    expect(s.onRename).toHaveBeenLastCalledWith("by_clinic", "On blur");
  });

  test("a column heading in a table is the builder's: it opens that column", async () => {
    const s = spies();
    render(<Builder spies={s} />);
    const heading = await screen.findByRole("button", { name: "Total" });
    fireEvent.click(heading);
    expect(s.onColumn).toHaveBeenCalledWith("invoices", "total");
  });

  describe("dragging", () => {
    beforeEach(() => {
      // A grid 1,200 pixels wide: a column is 101 pixels with its gap, a row 52.
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        width: 1200,
        height: 800,
        top: 0,
        left: 0,
        right: 1200,
        bottom: 800,
        x: 0,
        y: 0,
      } as DOMRect);
    });
    const press = (element: HTMLElement, x: number, y: number) =>
      fireEvent.pointerDown(element, { button: 0, clientX: x, clientY: y, pointerId: 1 });
    const move = (x: number, y: number) =>
      fireEvent.pointerMove(window, { clientX: x, clientY: y, pointerId: 1 });
    const drop = () => fireEvent.pointerUp(window, { pointerId: 1 });

    test("a widget is dragged by itself, snaps to cells, and says where it would land", async () => {
      const s = spies();
      render(<Builder spies={s} />);
      await screen.findByText("INV-1");
      press(group("Invoiced"), 100, 100);
      move(100 + 202, 100 + 104);
      // Chosen as soon as it is a drag, and the chip follows it.
      expect(s.onSelect).toHaveBeenCalledWith("total");
      expect(screen.getByText("3 × 3 · col 3 · row 3")).toBeTruthy();
      expect(s.onChange).not.toHaveBeenCalled();
      drop();
      expect(s.onChange).toHaveBeenCalledTimes(1);
      expect(s.onChange).toHaveBeenLastCalledWith(expect.anything(), "Moved Invoiced");
      expect(at(lastList(s), "total")).toEqual(place(2, 2, 3, 3));
    });

    test("a press that hardly moves is a click, not a drag", async () => {
      const s = spies();
      render(<Builder spies={s} />);
      await screen.findByText("INV-1");
      press(group("Invoiced"), 100, 100);
      move(102, 101);
      drop();
      expect(s.onChange).not.toHaveBeenCalled();
    });

    test("a press on a button of the widget is not a drag", async () => {
      const s = spies();
      render(<Builder spies={s} />);
      const heading = await screen.findByRole("button", { name: "Total" });
      press(heading, 100, 100);
      move(400, 400);
      drop();
      expect(s.onChange).not.toHaveBeenCalled();
    });

    test("the corner stretches it, and the least size holds", async () => {
      const s = spies();
      render(<Builder spies={s} />);
      await screen.findByText("INV-1");
      fireEvent.click(group("By clinic"));
      const handle = screen.getByTitle("Drag to change its size");
      press(handle, 500, 300);
      // Two columns wider and a row taller.
      move(500 + 202, 300 + 52);
      expect(screen.getByText("8 × 7 · col 4 · row 1")).toBeTruthy();
      drop();
      expect(s.onChange).toHaveBeenLastCalledWith(expect.anything(), "Resized By clinic");
      expect(at(lastList(s), "by_clinic")).toEqual(place(3, 0, 8, 7));

      // Pulled far past its least, it stays at 3 by 4.
      fireEvent.click(group("By clinic"));
      press(screen.getByTitle("Drag to change its size"), 800, 400);
      move(0, 0);
      drop();
      expect(at(lastList(s), "by_clinic")).toEqual(place(3, 0, 3, 4));
    });
  });
});

describe("what the frame offers besides the view", () => {
  test("offers a widget's rows as a file, and not while building", async () => {
    const client: PageDataClient = {
      read: async () => ({
        inputs: {
          rows: {
            shape: "rows",
            columns: [{ name: "clinic", label: "Clinic", type: "text" }],
            rows: [{ clinic: "northside" }],
          },
        },
      }),
    };
    const widget: PageWidget = {
      id: "t",
      type: "core/table",
      title: "Invoices",
      at: { x: 0, y: 0, w: 12, h: 8 },
      data: { rows: { source: { visual: { table: "invoices" } } } },
    };
    const props = {
      widgets: [widget],
      filters: [],
      registry: viewRegistry(corePack),
      client,
      filterValues: {},
      onFilterValues: () => undefined,
    };
    const { unmount } = render(<PageView {...props} />);
    expect(await screen.findByRole("button", { name: "Download Invoices" })).toBeTruthy();
    unmount();
    render(
      <PageView
        {...props}
        editing={{
          selected: undefined,
          onSelect: () => undefined,
          onChange: () => undefined,
          onRename: () => undefined,
        }}
      />,
    );
    await screen.findByText("northside");
    expect(screen.queryByRole("button", { name: "Download Invoices" })).toBeNull();
  });

  test("says when a saved query was read through the key a deploy recorded", async () => {
    const client: PageDataClient = {
      read: async () => ({
        inputs: {
          rows: {
            shape: "rows",
            columns: [{ name: "n", label: "N", type: "integer" }],
            rows: [{ n: 1 }],
            followed: { names: "reports/old", now: "reports/new" },
          },
        },
      }),
    };
    render(
      <PageView
        widgets={[
          {
            id: "q",
            type: "core/table",
            title: "Saved",
            at: { x: 0, y: 0, w: 12, h: 8 },
            data: { rows: { source: { query: "reports/old" } } },
          },
        ]}
        filters={[]}
        registry={viewRegistry(corePack)}
        client={client}
        filterValues={{}}
        onFilterValues={() => undefined}
      />,
    );
    expect(await screen.findByText("reports/old")).toBeTruthy();
    expect(screen.getByText("reports/new")).toBeTruthy();
  });
});

describe("carrying a widget onto the page (POLISH-008)", () => {
  const stat: PageWidget = {
    id: "s",
    type: "core/text",
    title: "Note",
    at: { x: 0, y: 0, w: 6, h: 2 },
    config: { text: "Hello" },
  };
  const card = {
    title: "Chart",
    kind: "A trend or a comparison",
    size: { w: 6, h: 6 },
    limits: { min: { w: 3, h: 4 }, max: { w: 12, h: 40 } },
  };
  // A grid 1188 pixels wide: columns of 100 with the gap, rows of 52.
  const measured = { left: 0, top: 0, right: 1188, bottom: 520, width: 1188, height: 520 };
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      ...measured,
      x: 0,
      y: 0,
      toJSON: () => measured,
    } as DOMRect);
  });

  const carried = (onDrop: (at: unknown) => void) => (
    <PageView
      widgets={[stat]}
      filters={[]}
      registry={registry}
      client={{ read: async () => ({ inputs: {} }) }}
      filterValues={{}}
      onFilterValues={() => undefined}
      editing={{
        selected: undefined,
        onSelect: () => undefined,
        onChange: () => undefined,
        onRename: () => undefined,
        carrying: { card, from: { x: 2000, y: 2000 }, onDrop },
      }}
    />
  );

  test("follows the pointer as a card, lands where it is let go, and what was there makes room", async () => {
    const onDrop = vi.fn();
    const { container } = render(carried(onDrop));
    // Off the page: a card under the pointer, and no place on the grid yet.
    expect(container.querySelector("[data-carried]")).toBeTruthy();
    expect(container.querySelector("[data-landing]")).toBeNull();
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 10 }));
    });
    const landing = container.querySelector("[data-landing]");
    expect(landing?.textContent).toContain("6 × 6 · col 1 · row 1");
    expect(container.querySelector("[data-carried]")).toBeNull();
    // The note was under where it would land: it is drawn below it while the chart is held.
    const note = screen.getByRole("group", { name: "Note" });
    expect(note.style.getPropertyValue("--row")).toBe("7 / span 2");
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 10 }));
    });
    expect(onDrop).toHaveBeenCalledWith({ x: 0, y: 0, w: 6, h: 6 });
    expect(container.querySelector("[data-landing]")).toBeNull();
  });

  test("let go off the page, or Esc, adds nothing", () => {
    const offPage = vi.fn();
    const { unmount } = render(carried(offPage));
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: 2000, clientY: 2000 }));
    });
    expect(offPage).toHaveBeenCalledWith(undefined);
    unmount();
    const escaped = vi.fn();
    render(carried(escaped));
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 10 }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(escaped).toHaveBeenCalledWith(undefined);
  });

  test("a widget new on the page fades in where it lands; those already there don't", () => {
    const props = {
      filters: [],
      registry,
      client: { read: async () => ({ inputs: {} }) },
      filterValues: {},
      onFilterValues: () => undefined,
      editing: {
        selected: undefined,
        onSelect: () => undefined,
        onChange: () => undefined,
        onRename: () => undefined,
      },
    };
    const { rerender } = render(<PageView widgets={[stat]} {...props} />);
    expect(screen.getByRole("group", { name: "Note" }).className).not.toContain("animate-arrive");
    rerender(
      <PageView
        widgets={[stat, { ...stat, id: "t", title: "Later", at: { x: 6, y: 0, w: 6, h: 2 } }]}
        {...props}
      />,
    );
    expect(screen.getByRole("group", { name: "Later" }).className).toContain("animate-arrive");
    expect(screen.getByRole("group", { name: "Note" }).className).not.toContain("animate-arrive");
    // Drawn again (it is chosen, say) before its fade has run: it still fades.
    rerender(
      <PageView
        widgets={[stat, { ...stat, id: "t", title: "Later", at: { x: 6, y: 0, w: 6, h: 2 } }]}
        {...props}
        editing={{ ...props.editing, selected: "t" }}
      />,
    );
    expect(screen.getByRole("group", { name: "Later" }).className).toContain("animate-arrive");
  });
});

test("a widget still waiting for its source asks for nothing and says what to do (POLISH-001)", async () => {
  const read = vi.fn(async () => ({ inputs: {} }));
  render(
    <PageView
      widgets={[{ id: "w", type: "core/stat", title: "Unpaid", at: { x: 0, y: 0, w: 3, h: 3 } }]}
      filters={[]}
      registry={registry}
      client={{ read }}
      filterValues={{}}
      onFilterValues={() => undefined}
      editing={{
        selected: undefined,
        onSelect: () => undefined,
        onChange: () => undefined,
        onRename: () => undefined,
      }}
    />,
  );
  expect(await screen.findByText("Choose what it shows in Data.")).toBeTruthy();
  expect(read).not.toHaveBeenCalled();
});

test("a column's heading says what the column holds, when its table says (POLISH-010)", async () => {
  const described: WireData = {
    shape: "rows",
    columns: [
      {
        name: "status",
        label: "Status",
        type: "text",
        description: "Where the order is in its life.",
      },
    ],
    rows: [{ id: "1", status: "open" }],
  };
  render(
    <PageView
      widgets={[
        {
          id: "orders",
          type: "core/table",
          title: "Orders",
          at: { x: 0, y: 0, w: 12, h: 6 },
          data: { rows: { source: { visual: { table: "orders" } } } },
          config: { columns: [{ column: "status" }] },
        },
      ]}
      filters={[]}
      registry={registry}
      client={{ read: async () => ({ inputs: { rows: described } }) }}
      filterValues={{}}
      onFilterValues={() => undefined}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: /^About Status/ }));
  expect(await screen.findByText("Where the order is in its life.")).toBeTruthy();
});
