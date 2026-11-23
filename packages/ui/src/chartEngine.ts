import type { View } from "vega";
import { localeOf } from "./dates.ts";
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

/** What d3 needs to write numbers the way a locale does, read from Intl so no table is kept. */
export function numberLocale(locale: string): {
  decimal: string;
  thousands: string;
  grouping: number[];
  currency: [string, string];
} {
  let use = "en-US";
  try {
    use = Intl.NumberFormat.supportedLocalesOf(locale)[0] ?? "en-US";
  } catch {
    use = "en-US";
  }
  const parts = new Intl.NumberFormat(use, { minimumFractionDigits: 2 }).formatToParts(1234567.5);
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const thousands = parts.find((part) => part.type === "group")?.value ?? ",";
  const integers = parts.filter((part) => part.type === "integer");
  const last = integers[integers.length - 1]?.value.length ?? 3;
  const money = new Intl.NumberFormat(use, { style: "currency", currency: "USD" }).formatToParts(1);
  const symbolAt = money.findIndex((part) => part.type === "currency");
  const integerAt = money.findIndex((part) => part.type === "integer");
  const symbol = money[symbolAt]?.value ?? "$";
  const space = money.find((part) => part.type === "literal")?.value ?? "";
  return {
    decimal,
    thousands,
    grouping: [last],
    currency: symbolAt < integerAt ? [symbol, ""] : ["", `${space}${symbol}`],
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
  locale?: string,
): View {
  // Axes and labels write numbers as the reader does (D38).
  engine.vega.formatLocale(numberLocale(locale ?? localeOf()));
  const compiled = engine.lite.compile(spec as TopLevelSpec, { config }).spec;
  const runtime = engine.vega.parse(compiled, undefined, { ast: true });
  return new engine.vega.View(runtime, {
    expr: engine.interpreter.expressionInterpreter,
    renderer: "svg",
    ...(container ? { container, hover: true } : {}),
  });
}
