// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import type { WidgetViewProps } from "@volvel/widgets";
import { corePack } from "@volvel/widgets-core/views";
import { type ComponentType, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PageView, type PageViewProps } from "./PageView.tsx";
import {
  type FilterValues,
  type PageDataClient,
  type ViewRegistry,
  viewRegistry,
  type WireData,
} from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Fake = Pick<WidgetViewProps, "act" | "can" | "listens"> & { selectedRecord?: string };

/** The core pack's views, given the host's members a test wants to fake. */
function registryWith(fake: Fake) {
  const base = viewRegistry(corePack);
  const wrapped = new Map(
    [...base].map(([type, entry]) => {
      const Original = entry.View as ComponentType<WidgetViewProps>;
      const View = (props: WidgetViewProps) => <Original {...props} {...fake} />;
      return [type, { ...entry, View: View }] as const;
    }),
  );
  return wrapped;
}

const col = (name: string, type = "text", label = name) => ({ name, type, label });
const place = { x: 0, y: 0, w: 12, h: 8 };

function clientOf(inputs: Record<string, WireData>): PageDataClient {
  return { read: vi.fn(async () => ({ inputs })) };
}

function Page(
  props: Partial<PageViewProps> & {
    client: PageDataClient;
    widgets: PageWidget[];
    registry: ViewRegistry;
  },
) {
  const [values, setValues] = useState<FilterValues>({});
  return <PageView filters={[]} filterValues={values} onFilterValues={setValues} {...props} />;
}

const invoiceColumns = [
  col("id", "uuid", "Id"),
  col("number", "text", "Number"),
  {
    ...col("status", "enum", "Status"),
    values: [
      { value: "paid", label: "Paid", color: "#2e7d32" },
      { value: "open", label: "Open" },
    ],
  },
  col("total", "number", "Total"),
  col("issued", "date", "Issued"),
  col("client", "reference", "Client"),
  col("sent", "boolean", "Sent"),
  col("notes", "text", "Notes"),
  col("secret", "text", "Internal code"),
];

const rowsInput: WireData = {
  shape: "rows",
  columns: invoiceColumns,
  rows: [
    { id: "a", number: "INV-1", status: "open", total: 12000, client: "c1" },
    { id: "b", number: "INV-2", status: "paid", total: 6000, client: "c2" },
  ],
  names: { client: { c1: "Ada Lovelace", c2: "Grace Hopper" } },
};

const longNote =
  "A long note that goes past eighty characters so that it is drawn as a paragraph, kept as written.";

const recordInput = {
  shape: "record",
  columns: invoiceColumns,
  record: {
    id: "a",
    number: "INV-1",
    status: "open",
    total: 12000,
    issued: "2026-11-20",
    client: "c1",
    sent: false,
    notes: longNote,
    secret: "X-77",
  },
  names: { client: { c1: "Ada Lovelace" } },
} as unknown as WireData;

const widgetOf = (extra: Partial<PageWidget>): PageWidget =>
  ({
    id: "w",
    title: "Invoices",
    at: place,
    ...extra,
  }) as PageWidget;

const tableWidget = (config: Record<string, unknown> = {}) =>
  widgetOf({
    type: "core/table",
    data: { rows: { source: { visual: { table: "invoices" } } } },
    config: { columns: [{ column: "number" }, { column: "status" }], ...config },
  });

const rowActions = [
  { id: "pay", label: "Mark paid", action: { do: [] } },
  { id: "void", label: "Void", tone: "danger", action: { do: [] } },
];

describe("button", () => {
  const button = widgetOf({
    type: "core/button",
    title: "Send",
    config: { label: "Send reminders", tone: "primary" },
  });

  test("runs on/click, shows pending while it runs, then is pressable again", async () => {
    let finish: (value: { ok: true }) => void = () => {};
    const act = vi.fn(() => new Promise<{ ok: true }>((done) => (finish = done)));
    render(
      <Page
        client={clientOf({})}
        widgets={[button]}
        registry={registryWith({ act, can: () => true })}
      />,
    );
    const pressed = await screen.findByRole("button", { name: "Send reminders" });
    fireEvent.click(pressed);
    expect(act).toHaveBeenCalledWith("on/click");
    await waitFor(() => expect(pressed.getAttribute("aria-busy")).toBe("true"));
    expect((pressed as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true });
    await waitFor(() => expect((pressed as HTMLButtonElement).disabled).toBe(false));
    expect(pressed.getAttribute("aria-busy")).toBeNull();
  });

  test("is disabled when can says it may not be pressed, and does not act", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    const can = vi.fn((at: string) => at !== "on/click");
    render(<Page client={clientOf({})} widgets={[button]} registry={registryWith({ act, can })} />);
    const pressed = (await screen.findByRole("button", {
      name: "Send reminders",
    })) as HTMLButtonElement;
    expect(pressed.disabled).toBe(true);
    fireEvent.click(pressed);
    expect(act).not.toHaveBeenCalled();
  });

  test("is inert while building: it shows no pending and runs nothing", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    render(
      <Page
        client={clientOf({})}
        widgets={[button]}
        registry={registryWith({ act, can: () => true })}
        editing={{
          selected: undefined,
          onSelect: () => {},
          onChange: () => {},
          onRename: () => {},
        }}
      />,
    );
    const drawn = await screen.findByText("Send reminders");
    fireEvent.click(drawn);
    expect(act).not.toHaveBeenCalled();
    expect(drawn.closest("button")?.getAttribute("aria-busy")).toBeNull();
  });
});

describe("record detail", () => {
  const detail = (config: Record<string, unknown>) =>
    widgetOf({
      type: "core/detail",
      title: "Invoice",
      data: { record: { source: { visual: { table: "invoices" } } } },
      config: { heading: "number", status: "status", ...config },
    });

  test("fields by type, in sections: money, date, chip, name, yes and no, long text", async () => {
    const config = {
      fields: [
        { column: "total", section: "Money", format: { style: "currency", minorUnits: true } },
        { column: "issued", section: "Money" },
        { column: "client", section: "People" },
        { column: "sent", section: "People" },
        { column: "notes", section: "People" },
      ],
    };
    render(
      <Page
        client={clientOf({ record: recordInput })}
        widgets={[detail(config)]}
        registry={registryWith({})}
      />,
    );
    const heading = await screen.findByRole("heading", { name: /INV-1/ });
    // The status is a chip beside the heading.
    expect(heading.parentElement?.parentElement?.textContent).toContain("Open");
    const money = screen.getByText("Money").closest("section") as HTMLElement;
    expect(within(money).getByText("$120.00")).toBeTruthy();
    expect(within(money).getByText(/Nov 20, 2026/)).toBeTruthy();
    const people = screen.getByText("People").closest("section") as HTMLElement;
    expect(within(people).getByText("Ada Lovelace")).toBeTruthy();
    expect(within(people).getByText("No")).toBeTruthy();
    expect(within(people).getByText(longNote).className).toContain("whitespace-pre-wrap");
  });

  test("a hidden field waits behind 'Show another field (n hidden)'", async () => {
    const config = {
      fields: [{ column: "total" }, { column: "secret", hidden: true }],
    };
    render(
      <Page
        client={clientOf({ record: recordInput })}
        widgets={[detail(config)]}
        registry={registryWith({})}
      />,
    );
    const fold = await screen.findByText("+ Show another field (1 hidden)");
    expect(fold.closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("Internal code")).toBeTruthy();
  });

  test("a hidden field is shown to read and is not edited in place: the server refuses it", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    const config = {
      edit: true,
      fields: [{ column: "total" }, { column: "secret", hidden: true }],
    };
    render(
      <Page
        client={clientOf({ record: recordInput })}
        widgets={[
          widgetOf({
            type: "core/detail",
            data: { record: { source: { visual: { table: "invoices" } } } },
            config,
          }),
        ]}
        registry={registryWith({ act, can: () => true })}
      />,
    );
    await screen.findByText("+ Show another field (1 hidden)");
    expect(screen.getByRole("button", { name: "Edit Total" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Internal code" })).toBeNull();
  });

  test("actions are buttons: disabled by can, run with the record, in their tone", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    const can = vi.fn((at: string) => at !== "config/actions/1/action");
    const config = {
      actions: [
        { id: "pay", label: "Mark paid", tone: "primary", action: { do: [] } },
        { id: "void", label: "Void", tone: "danger", action: { do: [] } },
      ],
    };
    render(
      <Page
        client={clientOf({ record: recordInput })}
        widgets={[detail(config)]}
        registry={registryWith({ act, can })}
      />,
    );
    const pay = await screen.findByRole("button", { name: "Mark paid" });
    const cancel = screen.getByRole("button", { name: "Void" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(cancel.className).toContain("bg-danger");
    fireEvent.click(pay);
    expect(act).toHaveBeenCalledWith("config/actions/0/action", { record: "a" });
    expect(can).toHaveBeenCalledWith(
      "config/actions/1/action",
      expect.objectContaining({ id: "a" }),
    );
  });
});

describe("row actions", () => {
  test("a table shows them, disabled by can, and runs one with the row", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    // Paid invoices cannot be marked paid again.
    const can = vi.fn(
      (at: string, row?: Readonly<Record<string, unknown>>) =>
        !(at === "config/rowActions/0/action" && row?.status === "paid"),
    );
    render(
      <Page
        client={clientOf({ rows: rowsInput })}
        widgets={[tableWidget({ rowActions })]}
        registry={registryWith({ act, can })}
      />,
    );
    const grid = await screen.findByRole("table");
    const rows = within(grid).getAllByRole("row");
    const first = within(rows[1] as HTMLElement);
    const second = within(rows[2] as HTMLElement);
    expect((first.getByRole("button", { name: "Mark paid" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((second.getByRole("button", { name: "Mark paid" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(first.getByRole("button", { name: "Void" }).className).toContain("text-danger");
    fireEvent.click(first.getByRole("button", { name: "Mark paid" }));
    expect(act).toHaveBeenCalledWith("config/rowActions/0/action", { record: "a" });
  });

  test("a press on a row action is not a press on the row", async () => {
    const onEvent = vi.fn();
    render(
      <Page
        client={clientOf({ rows: rowsInput })}
        widgets={[tableWidget({ rowActions })]}
        registry={registryWith({
          act: async () => ({ ok: true }),
          can: () => true,
          listens: () => true,
        })}
        onEvent={onEvent}
      />,
    );
    const grid = await screen.findByRole("table");
    fireEvent.click(within(grid).getAllByRole("button", { name: "Mark paid" })[0] as HTMLElement);
    expect(onEvent).not.toHaveBeenCalled();
  });

  test("a list shows them on each card", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    const list = widgetOf({
      type: "core/list",
      data: { rows: { source: { visual: { table: "invoices" } } } },
      config: { title: "number", rowActions },
    });
    render(
      <Page
        client={clientOf({ rows: rowsInput })}
        widgets={[list]}
        registry={registryWith({ act, can: () => true })}
      />,
    );
    await screen.findByText("INV-2");
    fireEvent.click(screen.getAllByRole("button", { name: "Void" })[1] as HTMLElement);
    expect(act).toHaveBeenCalledWith("config/rowActions/1/action", { record: "b" });
  });
});

describe("pressable rows", () => {
  test("a row is pressable, focusable and pressed with Enter only when listened to", async () => {
    const onEvent = vi.fn();
    render(
      <Page
        client={clientOf({ rows: rowsInput })}
        widgets={[tableWidget()]}
        registry={registryWith({ listens: (event) => event === "rowClick", selectedRecord: "b" })}
        onEvent={onEvent}
      />,
    );
    const row = (await screen.findByText("INV-1")).closest("tr") as HTMLElement;
    expect(row.getAttribute("tabindex")).toBe("0");
    expect(row.className).toContain("cursor-pointer");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onEvent).toHaveBeenCalledWith("w", "rowClick", { record: "a" });
    // The record whose sheet is open is marked.
    const open = screen.getByText("INV-2").closest("tr") as HTMLElement;
    expect(open.getAttribute("aria-current")).toBe("true");
    expect(row.getAttribute("aria-current")).toBeNull();
  });

  test("nothing looks pressable when nothing listens", async () => {
    render(
      <Page
        client={clientOf({ rows: rowsInput })}
        widgets={[tableWidget()]}
        registry={registryWith({ listens: () => false })}
      />,
    );
    const row = (await screen.findByText("INV-1")).closest("tr") as HTMLElement;
    expect(row.getAttribute("tabindex")).toBeNull();
    expect(row.className).not.toContain("cursor-pointer");
  });

  test("a stat is a button when click is listened to, and plain when it is not", async () => {
    const stat = widgetOf({
      type: "core/stat",
      title: "Total",
      data: {
        value: {
          source: {
            visual: { table: "invoices", measures: [{ fn: "sum", column: "total", as: "total" }] },
          },
        },
      },
      config: {},
    });
    const summary: WireData = {
      shape: "summary",
      columns: [col("total", "number", "Total")],
      breakdowns: [],
      values: ["total"],
      rows: [{ total: 1500 }],
    };
    const onEvent = vi.fn();
    const { unmount } = render(
      <Page
        client={clientOf({ value: summary })}
        widgets={[stat]}
        registry={registryWith({ listens: (event) => event === "click" })}
        onEvent={onEvent}
      />,
    );
    const pressable = await screen.findByRole("button", { name: /1,500/ });
    fireEvent.keyDown(pressable, { key: "Enter" });
    expect(onEvent).toHaveBeenCalledWith("w", "click", {});
    unmount();
    render(
      <Page
        client={clientOf({ value: summary })}
        widgets={[stat]}
        registry={registryWith({ listens: () => false })}
      />,
    );
    await screen.findByText(/1,500/);
    expect(screen.queryByRole("button", { name: /1,500/ })).toBeNull();
  });
});
