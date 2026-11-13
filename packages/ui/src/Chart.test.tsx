// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Chart, type ChartTokens, chartConfig, readChartTokens } from "./index.ts";

afterEach(cleanup);

const tokens: ChartTokens = {
  ink: "#16202e",
  inkMuted: "#5b6777",
  line: "#d3dae2",
  action: "#0e5f7a",
  actionSoft: "#dcedf3",
  attention: "#b45309",
  success: "#1f7a4d",
  danger: "#b3261e",
  font: "Inter, sans-serif",
};

const spec = {
  mark: "bar",
  encoding: {
    x: { field: "month", type: "nominal" },
    y: { field: "orders", type: "quantitative" },
  },
};
const rows = [
  { month: "Jan", orders: 12 },
  { month: "Feb", orders: 19 },
];

const sheet = document.createElement("style");
document.head.append(sheet);

/**
 * Puts token values on the page. A theme sets them on the root and they are
 * inherited. The test DOM does not inherit them, so here every element gets them.
 */
function theme(values: Record<string, string>) {
  const lines = Object.entries(values).map(([name, value]) => `${name}: ${value};`);
  sheet.textContent = `* { ${lines.join(" ")} }`;
}

describe("chart theme", () => {
  test("the tokens become the chart's colours and font", () => {
    const config = chartConfig(tokens);
    expect(config.background).toBe("transparent");
    expect(config.font).toBe("Inter, sans-serif");
    expect(config.mark).toEqual({ color: "#0e5f7a" });
    expect(config.text).toEqual({ color: "#16202e" });
    expect(config.axis).toEqual({
      labelColor: "#5b6777",
      titleColor: "#16202e",
      domainColor: "#d3dae2",
      tickColor: "#d3dae2",
      gridColor: "#d3dae2",
    });
    expect(config.legend).toEqual({ labelColor: "#5b6777", titleColor: "#16202e" });
    expect(config.title).toEqual({ color: "#16202e", subtitleColor: "#5b6777" });
    expect(config.range).toEqual({
      category: ["#0e5f7a", "#b45309", "#1f7a4d", "#b3261e", "#5b6777"],
      ramp: ["#dcedf3", "#0e5f7a"],
      heatmap: ["#dcedf3", "#0e5f7a"],
    });
  });

  test("a token with no value leaves the engine's default in place", () => {
    const empty = Object.fromEntries(Object.keys(tokens).map((key) => [key, ""])) as unknown;
    expect(chartConfig(empty as ChartTokens)).toEqual({
      background: "transparent",
      mark: {},
      text: {},
      rule: {},
      view: {},
      axis: {},
      legend: {},
      header: {},
      title: {},
      range: {},
    });
  });

  test("the tokens are read where the chart sits", () => {
    theme({ "--vx-ink": "  #101010 ", "--vx-action": "#123456", "--vx-font": "Inter" });
    const element = document.createElement("div");
    document.body.append(element);
    const read = readChartTokens(element);
    expect(read.ink).toBe("#101010");
    expect(read.action).toBe("#123456");
    expect(read.font).toBe("Inter");
    expect(read.danger).toBe("");
    element.remove();
  });
});

describe("chart", () => {
  test("shows a placeholder, then the chart, drawn as SVG in the theme's colours", async () => {
    theme({ "--vx-action": "#123456", "--vx-ink-muted": "#654321" });
    const { container } = render(
      <Chart spec={spec} data={rows} title="Orders by month" description="Rising since January" />,
    );
    const chart = screen.getByRole("img", { name: "Orders by month. Rising since January" });
    expect(screen.getByText("Loading chart")).toBeTruthy();
    await waitFor(() => expect(chart.querySelector("svg")).toBeTruthy(), { timeout: 20_000 });
    await waitFor(() => expect(screen.queryByText("Loading chart")).toBeNull());
    expect(chart.querySelectorAll('[aria-roledescription="bar"]')).toHaveLength(2);
    expect(container.innerHTML).toContain("#123456");
    expect(container.innerHTML).toContain("#654321");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a spec that does not compile is explained in place of the chart", async () => {
    render(<Chart spec={{ mark: "no-such-mark" }} title="Broken" />);
    const alert = await screen.findByRole("alert", {}, { timeout: 20_000 });
    expect(alert.textContent).toContain("This chart could not be drawn.");
    expect(screen.queryByText("Loading chart")).toBeNull();
  });

  test("draws again when the colour scheme changes, and lets go of the view when it leaves", async () => {
    const vega = await import("vega");
    const finalize = vi.spyOn(vega.View.prototype, "finalize");
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    try {
      theme({ "--vx-action": "#111111" });
      const { container, unmount } = render(<Chart spec={spec} data={rows} title="Orders" />);
      await waitFor(() => expect(container.innerHTML).toContain("#111111"), { timeout: 20_000 });
      expect(listeners.size).toBe(1);

      theme({ "--vx-action": "#eeeeee" });
      for (const listener of listeners) listener();
      await waitFor(() => expect(container.innerHTML).toContain("#eeeeee"));
      expect(container.innerHTML).not.toContain("#111111");
      expect(finalize).toHaveBeenCalledTimes(1);
      expect(container.querySelectorAll("svg")).toHaveLength(1);

      unmount();
      await waitFor(() => expect(finalize).toHaveBeenCalledTimes(2));
      expect(listeners.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      finalize.mockRestore();
    }
  });
});
