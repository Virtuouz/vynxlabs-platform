// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type * as sdk from "../../sdk/src/extensions.ts";
import {
  chartSpecFor,
  getWidget,
  type InterfaceWidget,
  listWidgets,
  registerWidget,
  Widget,
  type WidgetContext,
} from "./index.ts";

afterEach(cleanup);

/** True only when the two types are the same, each way. */
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// The kit's copy of the extension point is the one the SDK publishes.
const sameWidget: Same<InterfaceWidget<{ a: string }>, sdk.InterfaceWidget<{ a: string }>> = true;
const sameContext: Same<WidgetContext, sdk.WidgetContext> = true;

describe("widgets", () => {
  test("the kit's interface is the SDK's", () => {
    expect(sameWidget && sameContext).toBe(true);
  });

  test("the kit's own widgets are registered like any other", () => {
    expect(listWidgets().map((widget) => widget.name)).toEqual([
      "table",
      "form",
      "chart",
      "card",
      "cards",
    ]);
    for (const widget of listWidgets()) {
      expect(getWidget(widget.name)).toBe(widget);
      expect(widget.configSchema).toMatchObject({ type: "object" });
    }
    expect(getWidget("table")?.configSchema).toMatchObject({ required: ["columns"] });
    expect(getWidget("form")?.configSchema).toMatchObject({ required: ["schema"] });
    expect(getWidget("chart")?.configSchema).toMatchObject({ required: ["title"] });
    expect(getWidget("map")).toBeUndefined();
  });

  test("an unknown name is said on the page", () => {
    render(<Widget name="map" config={{}} />);
    expect(screen.getByRole("alert").textContent).toBe('There is no widget called "map".');
  });

  test("an app's own widget is drawn with its configuration and context", () => {
    const stat: InterfaceWidget<{ label: string }> = {
      name: "stat",
      configSchema: {
        type: "object",
        required: ["label"],
        properties: { label: { type: "string" } },
      },
      render: (config, context) => (
        <p>
          {config.label}: {context.rows?.length ?? 0}
        </p>
      ),
    };
    registerWidget(stat);
    render(<Widget name="stat" config={{ label: "Orders" }} context={{ rows: [{}, {}] }} />);
    expect(screen.getByText("Orders: 2")).toBeTruthy();

    // Registering the name again replaces the widget, and keeps its place in the list.
    registerWidget({ ...stat, render: () => <p>Replaced</p> });
    cleanup();
    render(<Widget name="stat" config={{ label: "Orders" }} />);
    expect(screen.getByText("Replaced")).toBeTruthy();
    expect(listWidgets().map((widget) => widget.name)).toEqual([
      "table",
      "form",
      "chart",
      "card",
      "cards",
      "stat",
    ]);
  });

  test("table shows the context's rows and reports the one chosen", () => {
    const onRowClick = vi.fn();
    const rows = [
      { id: 1, title: "First", total: 10 },
      { id: 2, title: "Second", total: 20 },
    ];
    const config = {
      label: "Orders",
      columns: [{ name: "title" }, { name: "total", type: "number" }],
      empty: "No orders yet.",
    };
    const { rerender } = render(
      <Widget name="table" config={config} context={{ rows, onRowClick }} />,
    );
    expect(screen.getByRole("table", { name: "Orders" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "total" })).toBeTruthy();
    expect(screen.getByText("First")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[1] as HTMLElement);
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);

    rerender(<Widget name="table" config={config} />);
    expect(screen.getByText("No orders yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });

  test("table lets a row be chosen, shows what the screen says to, and asks for more", () => {
    const onSelect = vi.fn();
    const onMore = vi.fn();
    const onDelete = vi.fn(async () => {});
    const rows = [
      { id: "a", title: "First", customer: "c-1" },
      { id: "b", title: "Second", customer: null },
    ];
    render(
      <Widget
        name="table"
        config={{
          label: "Orders",
          columns: [
            { name: "title", label: "Order" },
            { name: "customer", label: "Customer" },
          ],
        }}
        context={{
          rows,
          selectedId: "b",
          onSelect,
          onDelete,
          page: { hasMore: true, onMore },
          // A reference is shown by the name of the row it points at.
          display: (column, value) =>
            column === "customer" && value === "c-1" ? "Ada" : undefined,
        }}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Order" })).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
    const choices = screen.getAllByRole("radio", { name: "Choose this row" }) as HTMLInputElement[];
    expect(choices.map((choice) => choice.checked)).toEqual([false, true]);
    expect(screen.getAllByRole("row")[2]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(choices[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(rows[0]);
    // Pressing anywhere on a row chooses it. Pressing a button in it does that button's work.
    fireEvent.click(screen.getByText("Second"));
    expect(onSelect).toHaveBeenLastCalledWith(rows[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0] as HTMLElement);
    expect(onDelete).toHaveBeenCalledWith(rows[0]);
    expect(onSelect).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(onMore).toHaveBeenCalled();
  });

  test("a card shows one row, and cards show each as something to choose", () => {
    const fields = [
      { name: "title", label: "Order" },
      { name: "total", label: "Total", type: "number" },
    ];
    const { rerender } = render(
      <Widget name="card" config={{ fields, empty: "Choose an order." }} context={{ rows: [] }} />,
    );
    expect(screen.getByText("Choose an order.")).toBeTruthy();
    rerender(
      <Widget
        name="card"
        config={{ fields }}
        context={{ rows: [{ title: "First", total: 10 }] }}
      />,
    );
    expect(screen.getByText("Order")).toBeTruthy();
    expect(screen.getByText("First")).toBeTruthy();
    rerender(<Widget name="card" config={{ fields }} context={{ loading: true }} />);
    expect(screen.getByText("Loading…")).toBeTruthy();

    cleanup();
    const onSelect = vi.fn();
    const rows = [
      { id: "a", title: "First", total: 10 },
      { id: "b", title: "Second", total: 20 },
    ];
    render(
      <Widget
        name="cards"
        config={{ fields, label: "Orders" }}
        context={{ rows, selectedId: "a", onSelect }}
      />,
    );
    const cards = screen.getAllByRole("button");
    expect(cards.map((card) => card.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    expect(cards[1]?.textContent).toContain("Second");
    expect(cards[1]?.textContent).toContain("Total: 20");
    fireEvent.click(cards[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(rows[1]);
  });

  test("a chart told its shape and its values makes its own spec", () => {
    expect(chartSpecFor({ title: "T", mark: "bar", x: "status", y: "orders" })).toMatchObject({
      mark: { type: "bar" },
      encoding: {
        x: { field: "status", type: "nominal" },
        y: { field: "orders", type: "quantitative" },
      },
    });
    // A time along the bottom, and a line for each team.
    expect(
      chartSpecFor({
        title: "T",
        mark: "line",
        x: "month",
        y: "value",
        series: "team",
        xType: "date",
      }),
    ).toMatchObject({
      mark: { type: "line", point: true },
      encoding: { x: { type: "temporal" }, color: { field: "team" } },
    });
    expect(chartSpecFor({ title: "T", mark: "pie", x: "status", y: "orders" })).toMatchObject({
      mark: { type: "arc" },
      encoding: { theta: { field: "orders" }, color: { field: "status" } },
    });
    render(<Widget name="chart" config={{ title: "Nothing yet" }} />);
    expect(screen.getByText("This chart has not been told what to draw.")).toBeTruthy();
  });

  test("form starts from the context's values, shows its errors and submits through it", async () => {
    const onSubmit = vi.fn();
    render(
      <Widget
        name="form"
        config={{
          schema: {
            type: "object",
            required: ["title"],
            properties: { title: { type: "string" }, total: { type: "number" } },
          },
          submitLabel: "Create",
        }}
        context={{ values: { title: "First" }, errors: { total: "Too much." }, onSubmit }}
      />,
    );
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("First");
    expect(screen.getByRole("alert").textContent).toBe("Too much.");
    fireEvent.input(screen.getByLabelText("Total"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ title: "First", total: 4 }));
  });

  test("chart draws the context's rows", async () => {
    render(
      <Widget
        name="chart"
        config={{
          title: "Orders by month",
          spec: {
            mark: "bar",
            encoding: {
              x: { field: "month", type: "nominal" },
              y: { field: "orders", type: "quantitative" },
            },
          },
        }}
        context={{ rows: [{ month: "Jan", orders: 12 }] }}
      />,
    );
    const chart = screen.getByRole("img", { name: "Orders by month" });
    await waitFor(
      () => expect(chart.querySelectorAll('[aria-roledescription="bar"]')).toHaveLength(1),
      { timeout: 20_000 },
    );
  });
});
