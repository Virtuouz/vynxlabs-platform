// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type * as sdk from "../../sdk/src/extensions.ts";
import {
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

  test("table, form and chart are registered like any other widget", () => {
    expect(listWidgets().map((widget) => widget.name)).toEqual(["table", "form", "chart"]);
    for (const widget of listWidgets()) {
      expect(getWidget(widget.name)).toBe(widget);
      expect(widget.configSchema).toMatchObject({ type: "object" });
    }
    expect(getWidget("table")?.configSchema).toMatchObject({ required: ["columns"] });
    expect(getWidget("form")?.configSchema).toMatchObject({ required: ["schema"] });
    expect(getWidget("chart")?.configSchema).toMatchObject({ required: ["spec", "title"] });
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
    expect(listWidgets().map((widget) => widget.name)).toEqual(["table", "form", "chart", "stat"]);
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
