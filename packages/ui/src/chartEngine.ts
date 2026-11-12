import type { View } from "vega";
import type { Config, TopLevelSpec } from "vega-lite";

/** The three libraries that draw a chart. */
export interface ChartEngine {
  vega: typeof import("vega");
  lite: typeof import("vega-lite");
  interpreter: typeof import("vega-interpreter");
}

let loading: Promise<ChartEngine> | undefined;

/**
 * Fetches the chart engine the first time a chart needs it. It is large, so
 * it stays out of the page's main script: a page with no chart never loads it.
 */
export function loadChartEngine(): Promise<ChartEngine> {
  loading ??= Promise.all([import("vega"), import("vega-lite"), import("vega-interpreter")]).then(
    ([vega, lite, interpreter]) => ({ vega, lite, interpreter }),
    (failure) => {
      // A failed download is tried again by the next chart.
      loading = undefined;
      throw failure;
    },
  );
  return loading;
}

/** Views that take their size from several charts cannot follow the container's width. */
const COMPOSED = ["facet", "concat", "hconcat", "vconcat", "repeat"];

/**
 * The spec as it is drawn: with the rows put in as its data when there are
 * any, as wide as its container and of the given height unless it says otherwise.
 */
export function chartSpec(
  spec: object,
  data: readonly Record<string, unknown>[] | undefined,
  height: number,
): object {
  const given = spec as Record<string, unknown>;
  const single = !COMPOSED.some((key) => key in given);
  return {
    ...(single ? { width: "container", height } : {}),
    ...given,
    ...(data ? { data: { values: data } } : {}),
  };
}

/**
 * Compiles a Vega-Lite spec and builds its view. Expressions are parsed to a
 * syntax tree and run by the interpreter, so nothing is evaluated from a
 * string and the page needs no `unsafe-eval` in its content security policy.
 * Throws when the spec does not compile.
 */
export function createChartView(
  engine: ChartEngine,
  spec: object,
  config: Config,
  container?: Element,
): View {
  const compiled = engine.lite.compile(spec as TopLevelSpec, { config }).spec;
  const runtime = engine.vega.parse(compiled, undefined, { ast: true });
  return new engine.vega.View(runtime, {
    expr: engine.interpreter.expressionInterpreter,
    renderer: "svg",
    ...(container ? { container, hover: true } : {}),
  });
}
