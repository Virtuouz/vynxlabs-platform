// @vitest-environment happy-dom

// What tables and lists can do: badges, alignment, sorting, totals, stripes, buttons, many rows
// chosen, the list a table is on a phone, a list's places, and the row chosen for `{ selected }`.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import type { RowsData, WidgetViewProps } from "@volvel/widgets";
import { corePack } from "@volvel/widgets-core/views";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PageView } from "./PageView.tsx";
import { type FilterValues, type PageDataClient, viewRegistry, type WireData } from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const col = (name: string, type = "text", label = name) => ({ name, type, label });
const columns = [
  col("id", "uuid", "Id"),
  col("number", "text", "Number"),
  col("client", "text", "Client"),
  {
    ...col("status", "enum", "Status"),
    values: [
      { value: "paid", label: "Paid" },
      { value: "unpaid", label: "Unpaid" },
      { value: "void", label: "Void" },
    ],
  },
  col("total", "number", "Total"),
];
const rowsOf = [
  { id: "a", number: "INV-9338", client: "northside", status: "paid", total: 300 },
  { id: "b", number: "INV-9339", client: "hilltop", status: "unpaid", total: 100 },
  { id: "c", number: "INV-9340", client: "riverside", status: "void", total: 200 },
];
const rowsInput: WireData = { shape: "rows", columns, rows: rowsOf };

const views = corePack.views as Record<string, (props: WidgetViewProps<never>) => React.ReactNode>;

/** One view drawn on its own, as the host would give it. */
function draw(
  type: "core/table" | "core/list",
  config: Record<string, unknown>,
  over: Partial<WidgetViewProps> = {},
  rows: RowsData["rows"] = rowsOf,
) {
  const View = views[type] as unknown as (props: WidgetViewProps) => React.ReactNode;
  const data: RowsData = { shape: "rows", columns, rows };
  return render(
    <View
      config={config}
      data={{ rows: data }}
      size={{ w: 12, h: 8, narrow: false }}
      emit={() => {}}
      building={false}
      {...over}
    />,
  );
}

const bodyOrder = () =>
  within(screen.getAllByRole("rowgroup")[1] as HTMLElement)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

describe("a table's columns", () => {
  test("ids are set in a mono face, and a badge column draws a dot in the tone of its value", () => {
    draw("core/table", {
      columns: [
        { column: "number" },
        {
          column: "status",
          as: "badge",
          badges: { paid: "success", unpaid: "attention", void: "neutral" },
        },
      ],
    });
    expect(screen.getByText("INV-9338").className).toContain("font-mono");
    const paid = screen.getByText("Paid").closest("span") as HTMLElement;
    expect(paid.className).toContain("bg-success-soft");
    expect(paid.querySelector("[aria-hidden]")).not.toBeNull();
    expect((screen.getByText("Unpaid").closest("span") as HTMLElement).className).toContain(
      "bg-attention-soft",
    );
  });

  test("a badge column drawn as text is plain", () => {
    draw("core/table", { columns: [{ column: "status", as: "text" }] });
    expect(screen.getByText("Paid").className).not.toContain("rounded-full");
  });

  test("align right and a fixed width", () => {
    draw("core/table", {
      columns: [{ column: "client", align: "right", width: "fixed" }, { column: "number" }],
    });
    const heads = screen.getAllByRole("columnheader");
    expect(heads[0]?.className).toContain("text-right");
    expect((heads[0] as HTMLElement).style.width).toBe("10rem");
    expect(heads[1]?.className).not.toContain("text-right");
    expect((heads[1] as HTMLElement).style.width).toBe("");
  });

  test("numbers line up at the right on their own", () => {
    draw("core/table", { columns: [{ column: "total" }] });
    expect(screen.getByRole("columnheader").className).toContain("text-right");
  });

  test("clicking a sortable heading sorts the rows shown, then reverses, then clears", () => {
    draw("core/table", {
      columns: [
        { column: "number", sortable: false },
        { column: "total", sortable: true },
      ],
    });
    // A heading the maker turned off is not a button.
    expect(screen.queryByRole("button", { name: "Sort by Number" })).toBeNull();
    const sort = screen.getByRole("button", { name: /total/i });
    expect(bodyOrder()).toEqual(["INV-9338", "INV-9339", "INV-9340"]);
    fireEvent.click(sort);
    expect(bodyOrder()).toEqual(["INV-9339", "INV-9340", "INV-9338"]);
    expect(screen.getByRole("columnheader", { name: /total/i }).getAttribute("aria-sort")).toBe(
      "ascending",
    );
    fireEvent.click(sort);
    expect(bodyOrder()).toEqual(["INV-9338", "INV-9340", "INV-9339"]);
    fireEvent.click(sort);
    expect(bodyOrder()).toEqual(["INV-9338", "INV-9339", "INV-9340"]);
  });

  test("a heading sorts unless it is turned off, and not for a column with no order", () => {
    draw("core/table", { columns: [{ column: "number" }, { column: "total" }] });
    expect(screen.getByRole("button", { name: /total/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /number/i })).toBeTruthy();
  });

  test("while building, a heading raises the column event and does not sort", () => {
    const emit = vi.fn();
    draw(
      "core/table",
      { columns: [{ column: "total", sortable: true }] },
      { emit, building: true },
    );
    fireEvent.click(screen.getByRole("button", { name: /total/i }));
    expect(emit).toHaveBeenCalledWith("column", { group: { column: "total" } });
  });

  test("a total row sums the rows shown, written as the column is", () => {
    draw("core/table", {
      columns: [
        { column: "number" },
        { column: "total", total: true, format: { style: "currency", minorUnits: false } },
      ],
    });
    const foot = screen.getAllByRole("rowgroup")[2] as HTMLElement;
    expect(within(foot).getByText("Total")).toBeTruthy();
    expect(within(foot).getByText("$600.00")).toBeTruthy();
  });

  test("no total row unless a column asks for one", () => {
    draw("core/table", { columns: [{ column: "total" }] });
    expect(screen.getAllByRole("rowgroup")).toHaveLength(2);
  });
});

describe("a table's look", () => {
  test("rows are compact or comfortable", () => {
    const { unmount } = draw("core/table", {
      columns: [{ column: "number" }],
      rowHeight: "compact",
    });
    expect(screen.getAllByRole("cell")[0]?.className).toContain("py-1");
    unmount();
    draw("core/table", { columns: [{ column: "number" }] });
    expect(screen.getAllByRole("cell")[0]?.className).toContain("py-[9px]");
  });

  test("stripes shade every other row", () => {
    draw("core/table", { columns: [{ column: "number" }], stripes: true });
    const rows = within(screen.getAllByRole("rowgroup")[1] as HTMLElement).getAllByRole("row");
    expect(rows[0]?.className).not.toContain("bg-sunken");
    expect(rows[1]?.className).toContain("bg-sunken");
  });

  test("the words it says when empty are the maker's", async () => {
    const widget = {
      id: "t",
      type: "core/table",
      title: "Invoices",
      at: { x: 0, y: 0, w: 12, h: 8 },
      data: { rows: { source: { visual: { table: "invoices" } } } },
      config: { empty: "No invoices match" },
    } as PageWidget;
    const client: PageDataClient = {
      read: vi.fn(async () => ({
        inputs: { rows: { shape: "rows" as const, columns, rows: [] } },
      })),
    };
    render(<Host client={client} widgets={[widget]} />);
    expect(await screen.findByText("No invoices match")).toBeTruthy();
  });
});

const message = { steps: [{ do: "message", text: "Done" }] };
const rowActions = [
  { id: "pay", label: "Mark paid", action: message },
  { id: "void", label: "Void", tone: "danger", action: message },
];

describe("buttons above the table", () => {
  test("run their action, and are greyed with the reason when they may not", () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    draw(
      "core/table",
      {
        columns: [{ column: "number" }],
        buttons: [
          { id: "new", label: "New invoice", action: message },
          { id: "other", label: "Other", action: message },
        ],
      },
      {
        act,
        can: (at) => at !== "config/buttons/1/action",
        why: () => "Only Billing can do this",
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "New invoice" }));
    expect(act).toHaveBeenCalledWith("config/buttons/0/action");
    const other = screen.getByRole("button", { name: "Other" }) as HTMLButtonElement;
    expect(other.disabled).toBe(true);
  });
});

describe("selecting several rows", () => {
  test("there are no checkboxes unless the table says so", () => {
    draw("core/table", { columns: [{ column: "number" }], rowActions });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  test("a bar offers the actions allowed for every chosen row, and runs one on all of them", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    // Paid invoices cannot be marked paid again.
    const can = (at: string, row?: Readonly<Record<string, unknown>>) =>
      !(at === "config/rowActions/0/action" && row?.status === "paid");
    draw("core/table", { columns: [{ column: "number" }], rowActions, select: true }, { act, can });
    expect(screen.queryByRole("region", { name: "Rows chosen" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose INV-9339" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose INV-9340" }));
    const bar = screen.getByRole("region", { name: "Rows chosen" });
    expect(within(bar).getByText("2 chosen")).toBeTruthy();
    fireEvent.click(within(bar).getByRole("button", { name: "Mark paid" }));
    expect(act).toHaveBeenCalledWith("config/rowActions/0/action", { records: ["b", "c"] });
    // It clears once the action ran.
    await waitFor(() => expect(screen.queryByRole("region", { name: "Rows chosen" })).toBeNull());
  });

  test("an action that one chosen row may not take is not offered", () => {
    const can = (at: string, row?: Readonly<Record<string, unknown>>) =>
      !(at === "config/rowActions/0/action" && row?.status === "paid");
    draw(
      "core/table",
      { columns: [{ column: "number" }], rowActions, select: true },
      { act: async () => ({ ok: true }), can },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose INV-9338" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose INV-9339" }));
    const bar = screen.getByRole("region", { name: "Rows chosen" });
    expect(within(bar).queryByRole("button", { name: "Mark paid" })).toBeNull();
    expect(within(bar).getByRole("button", { name: "Void" })).toBeTruthy();
  });

  test("the header checkbox chooses every row, and Clear lets go", () => {
    draw("core/table", { columns: [{ column: "number" }], rowActions, select: true });
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose every row" }));
    expect(
      within(screen.getByRole("region", { name: "Rows chosen" })).getByText("3 chosen"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("region", { name: "Rows chosen" })).toBeNull();
  });

  test("choosing a row is not pressing it", () => {
    const emit = vi.fn();
    draw(
      "core/table",
      { columns: [{ column: "number" }], select: true },
      { emit, listens: () => true },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose INV-9339" }));
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("a table on a phone", () => {
  const phone = { size: { w: 12, h: 8, narrow: true } };
  const config = {
    columns: [
      { column: "number" },
      { column: "client" },
      { column: "total", format: { style: "currency" } },
      { column: "status", as: "badge", badges: { paid: "success" } },
    ],
  };

  test("is a list: the title, a line under it, the figure and the badge at the right", () => {
    draw("core/table", config, phone);
    expect(screen.queryByRole("table")).toBeNull();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const first = within(items[0] as HTMLElement);
    expect(first.getByText("INV-9338").className).toContain("font-mono");
    expect(first.getByText("northside")).toBeTruthy();
    expect(first.getByText("$300.00")).toBeTruthy();
    expect(first.getByText("Paid").closest("span")?.className).toContain("bg-success-soft");
  });

  test("a column that is hidden on phones is left out", () => {
    draw(
      "core/table",
      { columns: [{ column: "number" }, { column: "client", phone: false }] },
      phone,
    );
    expect(screen.queryByText("northside")).toBeNull();
    expect(screen.getByText("INV-9338")).toBeTruthy();
  });

  test("the hidden column is still a column of the table on a wide page", () => {
    draw("core/table", { columns: [{ column: "number" }, { column: "client", phone: false }] });
    expect(screen.getByText("northside")).toBeTruthy();
  });

  test("rows can be chosen there too", () => {
    draw(
      "core/table",
      { ...config, select: true, rowActions },
      {
        ...phone,
        act: async () => ({ ok: true }),
        can: () => true,
      },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose INV-9338" }));
    expect(screen.getByText("1 chosen")).toBeTruthy();
  });
});

describe("a list", () => {
  const config = {
    title: "number",
    subtitle: "client",
    right: "total",
    badge: "status",
  };

  test("draws each place: title, line under it, right, badge", () => {
    draw("core/list", config);
    const first = within(screen.getAllByRole("listitem")[0] as HTMLElement);
    expect(first.getByText("INV-9338").className).toContain("font-mono");
    expect(first.getByText("northside")).toBeTruthy();
    expect(first.getByText("300")).toBeTruthy();
    expect(first.getByText("Paid").closest("span")?.className).toContain("rounded-full");
  });

  test("is rows by default and boxes as cards", () => {
    const { unmount } = draw("core/list", config);
    expect(screen.getAllByRole("listitem")[0]?.className).toContain("border-b");
    unmount();
    draw("core/list", { ...config, look: "cards" });
    expect(screen.getAllByRole("listitem")[0]?.className).toContain("rounded-control");
  });

  test("a place left out takes no space, and a picture is drawn when the column has one", () => {
    const { container } = draw("core/list", { title: "number", picture: "client" }, {}, [
      { id: "a", number: "INV-1", client: "https://example.test/a.png" },
    ]);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.png");
    expect(screen.queryByText("northside")).toBeNull();
  });
});

function Host({
  widgets,
  client,
  onEvent,
}: {
  widgets: PageWidget[];
  client: PageDataClient;
  onEvent?: () => void;
}) {
  const [values, setValues] = useState<FilterValues>({});
  return (
    <PageView
      filters={[]}
      filterValues={values}
      onFilterValues={setValues}
      client={client}
      registry={viewRegistry(corePack)}
      widgets={widgets}
      {...(onEvent ? { onEvent } : {})}
    />
  );
}

const tableWidget = (config: Record<string, unknown> = {}): PageWidget =>
  ({
    id: "t",
    type: "core/table",
    title: "Invoices",
    at: { x: 0, y: 0, w: 12, h: 6 },
    data: { rows: { source: { visual: { table: "invoices" } } } },
    config: { columns: [{ column: "number" }, { column: "client" }], ...config },
  }) as PageWidget;

const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((node) => node.closest("tr"))
    .find((row): row is HTMLTableRowElement => row !== null) as HTMLElement;

describe("the row chosen for { selected }", () => {
  const detail = {
    id: "d",
    type: "core/detail",
    title: "Invoice",
    at: { x: 0, y: 6, w: 12, h: 6 },
    data: { record: { source: { selected: "t" } } },
    config: { fields: [{ column: "number" }] },
  } as PageWidget;

  const clientOf = () => {
    const read = vi.fn(
      async (widget: string, _filters: FilterValues, options?: { chosen?: unknown }) => {
        if (widget === "t") return { inputs: { rows: rowsInput } };
        const chosen = (options?.chosen ?? {}) as Record<string, string>;
        const record = rowsOf.find((row) => row.id === chosen.t) ?? null;
        return { inputs: { record: { shape: "record", columns, record } as WireData } };
      },
    );
    return { client: { read } as PageDataClient, read };
  };

  test("a row is pressable although nothing else listens, and clicking it re-reads the follower with it", async () => {
    const { client, read } = clientOf();
    render(<Host client={client} widgets={[tableWidget(), detail]} />);
    await screen.findAllByText("INV-9339");
    const row = rowOf("INV-9339");
    expect(row.getAttribute("tabindex")).toBe("0");
    // Before a click nothing is chosen, and nothing is asked for.
    expect(read.mock.calls.filter(([widget]) => widget === "d")[0]?.[2]).not.toHaveProperty(
      "chosen",
    );
    fireEvent.click(row);
    await waitFor(() =>
      expect(read).toHaveBeenCalledWith(
        "d",
        expect.anything(),
        expect.objectContaining({ chosen: { t: "b" } }),
      ),
    );
    // The chosen row is marked in the table it was chosen in.
    await waitFor(() => expect(rowOf("INV-9339").getAttribute("aria-current")).toBe("true"));
    // The table itself is not read again for it.
    expect(
      read.mock.calls.filter(([widget]) => widget === "t").every(([, , o]) => !o?.chosen),
    ).toBe(true);
    fireEvent.click(rowOf("INV-9340"));
    await waitFor(() =>
      expect(read).toHaveBeenLastCalledWith(
        "d",
        expect.anything(),
        expect.objectContaining({ chosen: { t: "c" } }),
      ),
    );
  });

  test("a table nothing follows is not pressable", async () => {
    const { client } = clientOf();
    render(<Host client={client} widgets={[tableWidget()]} />);
    const row = (await screen.findByText("INV-9339")).closest("tr") as HTMLElement;
    expect(row.getAttribute("tabindex")).toBeNull();
  });
});

describe("rows chosen, sent to the server", () => {
  test("an action on several rows is sent as records.events", async () => {
    const act = vi.fn(async () => ({ client: [] as unknown[] }));
    const client = {
      read: vi.fn(async () => ({ inputs: { rows: rowsInput } })),
      act,
    } as unknown as PageDataClient;
    render(<Host client={client} widgets={[tableWidget({ select: true, rowActions })]} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Choose INV-9338" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose INV-9340" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Rows chosen" })).getByRole("button", {
        name: "Void",
      }),
    );
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect(act).toHaveBeenCalledWith(
      "t",
      "config/rowActions/1/action",
      expect.objectContaining({ records: { events: ["a", "c"] } }),
    );
  });
});

describe("a JSON column", () => {
  const withLines = [
    ...columns,
    { name: "lines", type: "json", label: "Lines" },
    { name: "meta", type: "json", label: "Meta" },
  ];
  const jsonRows = [
    {
      id: "a",
      number: "INV-1",
      lines: [{ sku: "x", qty: 2 }, { sku: "y" }],
      meta: { source: "web", note: "a longer note than will fit in one cell of a table" },
    },
  ];
  const as = (
    type: "core/table" | "core/list" | "core/detail",
    config: Record<string, unknown>,
  ) => {
    const View = views[type] as unknown as (props: WidgetViewProps) => React.ReactNode;
    const data: RowsData = { shape: "rows", columns: withLines, rows: jsonRows };
    return render(
      <View
        config={config}
        data={{ rows: data }}
        size={{ w: 12, h: 8, narrow: false }}
        emit={() => {}}
        building={false}
      />,
    );
  };

  test("is drawn as a count of items or cut compact JSON with the whole in a tooltip, never as an object", () => {
    const { container } = as("core/table", {
      columns: [{ column: "number" }, { column: "lines" }, { column: "meta" }],
    });
    expect(container.textContent).not.toContain("[object Object]");
    expect(screen.getByText("2 items").getAttribute("title")).toBe(
      JSON.stringify(jsonRows[0]?.lines),
    );
    const meta = container.querySelector(`[title='${JSON.stringify(jsonRows[0]?.meta)}']`);
    expect(meta?.textContent?.endsWith("…")).toBe(true);
  });

  test("is not one of the columns a table starts with", () => {
    const { container } = as("core/table", {});
    expect(container.textContent).toContain("Number");
    expect(container.textContent).not.toContain("Lines");
    expect(container.textContent).not.toContain("Meta");
  });
});
