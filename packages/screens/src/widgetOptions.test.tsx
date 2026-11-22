// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { definitionProblems, type SummaryData } from "@volvel/widgets";
import { chart, pivot, stat } from "@volvel/widgets-core";
import {
  changeTone,
  chartFits,
  chartFor,
  fillGapsIn,
  isComparing,
  orderRows,
  PivotView,
  StatView,
  shadeOf,
  suggestedMark,
  withCompare,
} from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(cleanup);

const hints = (definition: { config: { properties: Record<string, Record<string, unknown>> } }) =>
  Object.fromEntries(
    Object.entries(definition.config.properties).map(([name, schema]) => [
      name,
      schema["x-volvel"] as Record<string, unknown>,
    ]),
  );

describe("the definitions", () => {
  test("are sound", () => {
    for (const definition of [chart, stat, pivot])
      expect(definitionProblems(definition)).toEqual([]);
  });

  test("the chart's options are hinted, in the groups the boards name", () => {
    const h = hints(chart);
    expect(h.mark).toMatchObject({ control: "tiles", group: "Chart type" });
    expect(h.smooth).toMatchObject({ control: "switch", group: "Over time" });
    expect(h.points).toMatchObject({ control: "switch", group: "Over time" });
    expect(h.compare).toMatchObject({ control: "switch", group: "Over time" });
    expect(h.fillGaps).toMatchObject({ control: "switch", group: "Over time" });
    expect(h.values).toMatchObject({ control: "switch", group: "Look" });
    expect(h.axisTitles).toMatchObject({ control: "switch", group: "Look" });
    expect(h.colors).toMatchObject({ control: "choice", group: "Look" });
    expect(h.format).toMatchObject({ control: "format", group: "Look" });
    expect(h.order).toMatchObject({ control: "choice", group: "Order" });
    expect(Object.keys((h.order as { choices: object }).choices)).toEqual([
      "biggest",
      "smallest",
      "label",
    ]);
    expect(chart.defaults).toMatchObject({ points: true, axisTitles: false, colors: "theme" });
  });

  test("the stat's change is hinted under Compare", () => {
    const h = hints(stat);
    expect(h.compare).toMatchObject({ control: "switch", group: "Compare" });
    expect(h.delta).toMatchObject({ control: "segmented", group: "Compare" });
    expect(h.goodWhen).toMatchObject({ control: "segmented", group: "Compare" });
  });

  test("the pivot has its shading and its two totals; the old one stays valid", () => {
    const h = hints(pivot);
    expect(h.shade).toMatchObject({ control: "switch" });
    expect(h.rowTotals).toMatchObject({ control: "switch" });
    expect(h.columnTotals).toMatchObject({ control: "switch" });
    expect(Object.keys(pivot.config.properties)).toContain("totals");
    expect(pivot.defaults).toEqual({ rowTotals: true, columnTotals: true });
  });
});

const columns = [
  { name: "issued", label: "Issued", type: "date" },
  { name: "clinic", label: "Clinic", type: "string" },
  { name: "total", label: "Total", type: "number" },
];
const dated: SummaryData = {
  shape: "summary",
  columns,
  breakdowns: ["issued"],
  values: ["total"],
  rows: [
    { issued: "2026-11-02", total: 10 },
    { issued: "2026-11-04", total: 30 },
  ],
};
const grouped: SummaryData = {
  shape: "summary",
  columns,
  breakdowns: ["clinic"],
  values: ["total"],
  rows: [
    { clinic: "a", total: 5 },
    { clinic: "b", total: 50 },
    { clinic: "c", total: 20 },
  ],
};

// biome-ignore lint/suspicious/noExplicitAny: a spec is drawn by Vega-Lite and read loosely here
const spec = (config: object, data: SummaryData): any => chartFor(config, data).spec;

describe("the chart draws each option", () => {
  test("a line marks its points unless told not to, and smooths on request", () => {
    // The points are rings; the soft area under the single line is the layer before it.
    const line = (config: object) => spec(config, dated).layer.at(-1);
    expect(line({ mark: "line" }).mark).toMatchObject({
      point: { filled: false },
      interpolate: "linear",
    });
    expect(line({ mark: "line", points: false, smooth: true }).mark).toMatchObject({
      point: false,
      interpolate: "monotone",
    });
  });

  test("an area is filled under its line", () => {
    expect(spec({ mark: "area" }, dated).mark).toMatchObject({
      type: "area",
      line: true,
      point: false,
    });
    expect(spec({ mark: "area", points: true }, dated).mark.point).toMatchObject({ filled: false });
  });

  test("values on bars add a text layer, beside the bar when it lies down", () => {
    const up = spec({ mark: "bar", values: true }, grouped);
    expect(up.layer).toHaveLength(2);
    expect(up.layer[1].mark).toMatchObject({ type: "text", baseline: "bottom" });
    expect(up.layer[1].encoding.text.field).toBe("total");
    const lying = spec({ mark: "bar", values: true, horizontal: true }, grouped);
    expect(lying.layer[1].mark).toMatchObject({ type: "text", align: "left" });
    expect(spec({ mark: "bar" }, grouped).layer).toBeUndefined();
  });

  test("axis titles can be left off", () => {
    // None until asked for, as the boards draw none.
    expect(spec({ mark: "bar" }, grouped).encoding.x.title).toBeNull();
    const named = spec({ mark: "bar", axisTitles: true }, grouped).encoding;
    expect(named.x.title).toBe("Clinic");
    expect(named.y.title).toBe("Total");
    const bare = spec({ mark: "bar", axisTitles: false }, grouped).encoding;
    expect(bare.x.title).toBeNull();
    expect(bare.y.title).toBeNull();
  });

  test("a named palette colors the marks; the theme leaves it to the tokens", () => {
    expect(spec({ mark: "bar", colors: "warm" }, grouped).mark.color).toBe("#f59e0b");
    expect(spec({ mark: "bar", colors: "theme" }, grouped).mark.color).toBeUndefined();
    const split: SummaryData = {
      ...grouped,
      columns: [...columns, { name: "kind", label: "Kind", type: "string" }],
      breakdowns: ["clinic", "kind"],
      rows: [{ clinic: "a", kind: "x", total: 1 }],
    };
    expect(spec({ mark: "bar", colors: "cool" }, split).encoding.color.scale.range[0]).toBe(
      "#38bdf8",
    );
  });

  test("biggest first, smallest first, or by name", () => {
    const names = (order: "biggest" | "smallest" | "label") =>
      chartFor({ mark: "bar", order }, grouped).rows.map((row) => row.clinic);
    expect(names("biggest")).toEqual(["b", "c", "a"]);
    expect(names("smallest")).toEqual(["a", "c", "b"]);
    expect(names("label")).toEqual(["a", "b", "c"]);
    const two = [
      { x: "q", v: 1 },
      { x: "p", v: 2 },
    ];
    expect(orderRows(two, "x", ["v"], "biggest")[0]?.x).toBe("p");
  });

  test("an order does not apply to a date", () => {
    expect(chartFor({ mark: "line", order: "biggest" }, dated).rows.map((r) => r.total)).toEqual([
      10, 30,
    ]);
  });

  test("a period with nothing is drawn as zero when asked", () => {
    const skipping: SummaryData = {
      ...dated,
      rows: [
        { issued: "2026-11-02", total: 10 },
        { issued: "2026-11-03", total: 20 },
        { issued: "2026-11-05", total: 30 },
      ],
    };
    const filled = chartFor({ mark: "line", fillGaps: true }, skipping).rows;
    expect(filled.map((row) => [row.issued, row.total])).toEqual([
      ["2026-11-02", 10],
      ["2026-11-03", 20],
      ["2026-11-04", 0],
      ["2026-11-05", 30],
    ]);
    expect(chartFor({ mark: "line" }, skipping).rows).toHaveLength(3);
    const weeks = fillGapsIn(
      [
        { d: "2026-11-02", v: 1 },
        { d: "2026-11-09", v: 1 },
        { d: "2026-11-23", v: 1 },
      ],
      "d",
      ["v"],
    );
    expect(weeks.map((row) => row.d)).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
    ]);
    const months = fillGapsIn(
      [
        { d: "2026-01-01", v: 1 },
        { d: "2026-04-01", v: 1 },
        { d: "2026-02-01", v: 1 },
      ],
      "d",
      ["v"],
    );
    expect(months.map((row) => row.d)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
  });

  test("the period before is a dashed line, and off when compare is false", () => {
    const withBefore: SummaryData = { ...dated, previous: [{ total: 5 }, { total: 15 }] };
    const drawn = spec({ mark: "line", compare: true, compareTo: "range" }, withBefore);
    expect(drawn.layer.at(-1).mark.strokeDash).toEqual([4, 4]);
    expect(
      spec({ mark: "line", compare: false }, withBefore).layer.some(
        (one: { mark: { strokeDash?: number[] } }) => one.mark.strokeDash,
      ),
    ).toBe(false);
  });

  test("compare is kept with the filter the server reads", () => {
    expect(withCompare({}, true, ["range", "other"])).toEqual({
      compare: true,
      compareTo: "range",
    });
    expect(withCompare({ compare: true, compareTo: "range" }, false, ["range"])).toEqual({});
    expect(withCompare({}, true, [])).toEqual({});
    expect(isComparing({ compareTo: "range" })).toBe(true);
    expect(isComparing({ compare: false, compareTo: "range" })).toBe(false);
    expect(isComparing({})).toBe(false);
  });
});

describe("which chart types fit, and which one is suggested", () => {
  test("a date fits a line and an area; groups fit bars and a pie", () => {
    expect(chartFits("line", dated)).toEqual({ fits: true });
    expect(chartFits("area", grouped)).toEqual({ fits: false, needs: "a date" });
    expect(chartFits("bar", grouped)).toEqual({ fits: true });
    expect(chartFits("bar-sideways", grouped)).toEqual({ fits: true });
    expect(chartFits("pie", grouped)).toEqual({ fits: true });
    expect(chartFits("pie", dated)).toEqual({ fits: false, needs: "no date" });
    expect(chartFits("bar", { columns, breakdowns: [] })).toEqual({
      fits: false,
      needs: "a group",
    });
  });

  test("a heatmap needs a split, a scatter needs numbers or dates", () => {
    expect(chartFits("heatmap", grouped)).toEqual({ fits: false, needs: "a split" });
    expect(chartFits("heatmap", { columns, breakdowns: ["issued", "clinic"] })).toEqual({
      fits: true,
    });
    expect(chartFits("scatter", grouped)).toEqual({ fits: false, needs: "a number" });
    expect(chartFits("scatter", { columns, breakdowns: ["total"] })).toEqual({ fits: true });
  });

  test("a date suggests a line, anything else bars", () => {
    expect(suggestedMark(dated)).toBe("line");
    expect(suggestedMark(grouped)).toBe("bar");
    expect(suggestedMark({ columns, breakdowns: [] })).toBe("bar");
  });
});

function drawStat(config: object, value: number, previous?: number) {
  const data: SummaryData = {
    shape: "summary",
    columns: [{ name: "total", label: "Total", type: "number" }],
    breakdowns: [],
    values: ["total"],
    rows: [{ total: value }],
    ...(previous === undefined ? {} : { previous: [{ total: previous }] }),
  };
  render(
    <StatView
      {...({
        config,
        data: { value: data },
        size: { w: 3, h: 3, narrow: false },
        emit: vi.fn(),
        building: false,
      } as unknown as Parameters<typeof StatView>[0])}
    />,
  );
}

describe("the stat's change", () => {
  test("is good or bad by which way good news goes", () => {
    expect(changeTone("up", undefined)).toBe("good");
    expect(changeTone("up", "down")).toBe("bad");
    expect(changeTone("down", "down")).toBe("good");
    expect(changeTone("same", "up")).toBeUndefined();
  });

  test("is drawn in the tone of it, saying what it is against", () => {
    drawStat({ goodWhen: "down", delta: "percent" }, 108.4, 100);
    expect(screen.getByText("8.4%").parentElement?.className).toContain("text-danger");
    expect(screen.getByText("vs the period before")).toBeTruthy();
    cleanup();
    drawStat({}, 108.4, 100);
    expect(screen.getByText("8.4%").parentElement?.className).toContain("text-success");
    cleanup();
    drawStat({ compare: false }, 108.4, 100);
    expect(screen.queryByText("vs the period before")).toBeNull();
  });

  test("says the change as an amount when asked", () => {
    drawStat({ delta: "absolute" }, 110, 100);
    expect(screen.getByText("10")).toBeTruthy();
  });
});

const pivotData: SummaryData = {
  shape: "summary",
  columns: [
    { name: "vet", label: "Vet", type: "string" },
    { name: "month", label: "Month", type: "string" },
    { name: "n", label: "N", type: "number" },
  ],
  breakdowns: ["vet", "month"],
  values: ["n"],
  rows: [
    { vet: "A", month: "Sep", n: 1 },
    { vet: "A", month: "Oct", n: 9 },
    { vet: "B", month: "Sep", n: 5 },
    { vet: "B", month: "Oct", n: 5 },
  ],
};

function drawPivot(config: object) {
  render(
    <PivotView
      {...({
        config,
        data: { rows: pivotData },
        size: { w: 6, h: 6, narrow: false },
        emit: vi.fn(),
        building: false,
      } as unknown as Parameters<typeof PivotView>[0])}
    />,
  );
}

describe("the pivot", () => {
  test("has both totals by default, and the older totals: false takes both away", () => {
    drawPivot({});
    expect(screen.getAllByText("Total")).toHaveLength(2);
    cleanup();
    drawPivot({ totals: false });
    expect(screen.queryByText("Total")).toBeNull();
  });

  test("rowTotals and columnTotals each stand alone, and win over the older one", () => {
    drawPivot({ rowTotals: true, columnTotals: false });
    expect(screen.getAllByText("Total")).toHaveLength(1);
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeTruthy();
    cleanup();
    drawPivot({ rowTotals: false, columnTotals: true, totals: false });
    expect(screen.getAllByText("Total")).toHaveLength(1);
    expect(screen.getByRole("rowheader", { name: "Total" })).toBeTruthy();
  });

  test("shades cells by size, the biggest the deepest", () => {
    drawPivot({ shade: true, rowTotals: false, columnTotals: false });
    const cell = (text: string) => screen.getByText(text) as HTMLElement;
    expect(cell("1").dataset.shade).toBe("8");
    expect(cell("9").dataset.shade).toBe("58");
    cleanup();
    drawPivot({});
    expect(screen.getAllByRole("cell").every((one) => !(one as HTMLElement).dataset.shade)).toBe(
      true,
    );
  });

  test("shadeOf runs from a wash to the deepest", () => {
    expect(shadeOf(null, 0, 10)).toBe(0);
    expect(shadeOf(0, 0, 10)).toBeCloseTo(0.08);
    expect(shadeOf(10, 0, 10)).toBeCloseTo(0.58);
    expect(shadeOf(5, 5, 5)).toBe(0.35);
  });
});
