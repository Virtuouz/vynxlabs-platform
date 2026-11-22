// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import type { WidgetDefinition } from "@volvel/widgets";
import { chart } from "@volvel/widgets-core";
import { headingWords } from "@volvel/widgets-core/views";
import { afterEach, expect, test } from "vitest";
import { aboutMore } from "../Inspector.tsx";
import { type Catalog, defaultInputs } from "../model.ts";
import { MiniChart } from "./chartDrawer.tsx";

afterEach(cleanup);

test("the line under 'More … options' names what is inside, not half a sentence", () => {
  expect(aboutMore(["Good news is", "Color by how close"])).toBe(
    "Good news direction, color bands",
  );
  expect(aboutMore(["A line of how it went, by"])).toBe("Trend line");
  expect(aboutMore(["Sorted by", "At most"])).toBe("Sort order, limit");
});

test("a grid heading says a choice by its label and a day as the boards write it", () => {
  const columns = [
    { name: "status", type: "enum", values: [{ value: "no_show", label: "No show" }] },
    { name: "day", type: "date" },
  ];
  expect(headingWords(columns, "status", "no_show")).toBe("No show");
  expect(headingWords([{ name: "status", type: "enum" }], "status", "no_show")).toBe("No show");
  expect(headingWords(columns, "day", "2020-11-16")).toBe("Nov 16, 2020");
  expect(headingWords(columns, "clinic", "northside")).toBe("northside");
});

test("a chart's small picture draws bars with gaps, whatever their count", () => {
  for (const values of [[5], [5, 5], [3, 3, 3, 3, 3, 3, 3, 3]]) {
    const { container } = render(<MiniChart kind="bar" values={values} />);
    const bars = [...container.querySelectorAll("rect")];
    expect(bars).toHaveLength(values.length);
    // Each bar is narrower than the room it has: the picture is never one solid block.
    for (const [at, bar] of bars.entries()) {
      const x = Number(bar.getAttribute("x"));
      const width = Number(bar.getAttribute("width"));
      expect(width).toBeLessThanOrEqual(16);
      const next = bars[at + 1];
      if (next) expect(x + width).toBeLessThan(Number(next.getAttribute("x")));
    }
    cleanup();
  }
});

test("a new chart starts from the date a table's own dates are about, not Created at or a late one", () => {
  const catalog: Catalog = {
    tables: [
      {
        name: "appointments",
        columns: [
          { name: "checked_in_at", type: "timestamp", references: null },
          { name: "starts_at", type: "timestamp", references: null },
          { name: "status", type: "enum", references: null },
        ],
      },
    ],
    queries: [],
    maySql: false,
  };
  const inputs = defaultInputs(chart as WidgetDefinition, "appointments", catalog);
  const source = inputs.rows?.source as { visual: { groupBy?: { column: string }[] } } | undefined;
  expect(source?.visual.groupBy?.[0]?.column).toBe("starts_at");
});
