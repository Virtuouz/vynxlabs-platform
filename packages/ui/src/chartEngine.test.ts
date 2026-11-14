/// <reference types="node" />
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { chartSpec } from "./chartEngine.ts";

const run = promisify(execFile);
const engine = fileURLToPath(new URL("./chartEngine.ts", import.meta.url));
const theme = fileURLToPath(new URL("./chartTheme.ts", import.meta.url));

const bars = {
  mark: "bar",
  width: 300,
  encoding: {
    x: { field: "month", type: "nominal" },
    y: { field: "orders", type: "quantitative", aggregate: "sum" },
    color: { field: "region", type: "nominal" },
    tooltip: { field: "orders", type: "quantitative" },
  },
  transform: [{ calculate: "datum.orders * 2", as: "doubled" }, { filter: "datum.orders > 0" }],
};
const rows = [
  { month: "Jan", orders: 12, region: "North" },
  { month: "Feb", orders: 19, region: "South" },
];

/**
 * Draws the bar chart in a Node that refuses to build code from a string,
 * which is what a page without `unsafe-eval` does. `parse` is called the way
 * the kit calls it, or the way Vega does by default.
 */
function draw(interpreted: boolean) {
  const script = `
    import { chartSpec, createChartView, loadChartEngine } from ${JSON.stringify(engine)};
    import { chartConfig } from ${JSON.stringify(theme)};
    const engine = await loadChartEngine();
    const config = chartConfig({ ink: "#111", inkMuted: "#555", line: "#ccc", action: "#0e5f7a",
      actionSoft: "#dcedf3", attention: "#b45309", success: "#1f7a4d", danger: "#b3261e", font: "sans-serif" });
    const spec = chartSpec(${JSON.stringify(bars)}, ${JSON.stringify(rows)}, 200);
    const view = ${
      interpreted
        ? "createChartView(engine, spec, config)"
        : "new engine.vega.View(engine.vega.parse(engine.lite.compile(spec, { config }).spec), { renderer: 'svg' })"
    };
    process.stdout.write(await view.toSVG());
    view.finalize();
  `;
  return run(process.execPath, [
    "--disallow-code-generation-from-strings",
    "--input-type=module",
    "--eval",
    script,
  ]);
}

describe("chart engine", () => {
  test("draws without building code from strings", async () => {
    const { stdout } = await draw(true);
    expect(stdout).toMatch(/^<svg/);
    // Two bars, in the first two colors of the theme's range, and the axis in the theme's ink.
    expect(stdout.match(/aria-roledescription="bar"/g)).toHaveLength(2);
    expect(stdout).toContain('fill="#0e5f7a"');
    expect(stdout).toContain('fill="#b45309"');
    expect(stdout).toContain('fill="#555"');
  });

  test("the same chart cannot be drawn that way by Vega's default code generation", async () => {
    await expect(draw(false)).rejects.toThrow(/Code generation from strings disallowed/);
  });

  test("the rows become the data, and the size follows the container unless the spec says", () => {
    expect(chartSpec({ mark: "bar" }, rows, 240)).toEqual({
      mark: "bar",
      width: "container",
      height: 240,
      data: { values: rows },
    });
    expect(chartSpec({ mark: "bar", height: 100, data: { url: "x.csv" } }, undefined, 240)).toEqual(
      { mark: "bar", width: "container", height: 100, data: { url: "x.csv" } },
    );
    // A view made of several charts sizes itself.
    expect(chartSpec({ hconcat: [] }, undefined, 240)).toEqual({ hconcat: [] });
  });
});
