/**
 * Registers the chart, stat, goal and pivot sections with the drawer's extension points
 * (`../custom.ts`). Each section is a component that draws its own `DrawerGroup`s, placed by
 * `order`; what the real rows say (the widget's summary, how many values a column has) reaches
 * it through `DrawerDataProvider`, which the builder wraps the inspector in.
 *
 * The title and the caption are the shell's "Heading" group (the stat and the goal put it
 * themselves, after their Preview). The Data tab draws "Rows it uses" for the widget, and
 * leaves out what a section draws itself (`hidesData`).
 */
import { type ComponentType, createElement, type ReactNode } from "react";
import type { Env } from "../controls.tsx";
import { registerDrawer } from "../custom.ts";
import { ChartData, ChartDisplay } from "./chartDrawer.tsx";
import { type DrawerSection, type SectionProps, useDrawerData } from "./chartShared.tsx";
import { GoalData, GoalDisplay, GoalPreview } from "./goalDrawer.tsx";
import { PivotData, PivotDisplay } from "./pivotDrawer.tsx";
import { StatData, StatDisplay } from "./statDrawer.tsx";

/** A section as the shell draws it: a component of `env`, given the rows' summary from the context. */
function withData(Section: DrawerSection) {
  const Drawn = ({ env }: { env: Env }): ReactNode => {
    const data = useDrawerData();
    return createElement(Section as ComponentType<SectionProps>, { env, data });
  };
  return Drawn;
}

const CHART = "core/chart";
const STAT = "core/stat";
const GOAL = "labs/goal";
const PIVOT = "core/pivot";

registerDrawer(CHART, {
  tab: "data",
  order: 10,
  section: withData(ChartData),
  hides: ["order", "fillGaps"],
  hidesData: ["measure", "breakdown", "sort", "limit"],
});
registerDrawer(CHART, {
  tab: "display",
  order: 10,
  section: withData(ChartDisplay),
  headingFields: true,
  hides: [
    "mark",
    "horizontal",
    "format",
    "colors",
    "legend",
    "values",
    "axisTitles",
    "compare",
    "compareTo",
    "smooth",
    "points",
    "bars",
    "x",
    "y",
  ],
});

registerDrawer(STAT, {
  tab: "data",
  order: 10,
  section: withData(StatData),
  hidesData: ["measure"],
});
registerDrawer(STAT, {
  tab: "display",
  order: 10,
  section: withData(StatDisplay),
  ownHeading: true,
  hides: ["format", "compare", "compareTo", "delta", "goodWhen"],
});

// The bar previewed above everything else, as board 14 draws it.
registerDrawer(GOAL, { tab: "data", order: -5000, section: withData(GoalPreview) });
registerDrawer(GOAL, {
  tab: "data",
  order: 10,
  section: withData(GoalData),
  hidesData: ["measure"],
  hides: ["target", "goalFrom"],
});
registerDrawer(GOAL, {
  tab: "display",
  order: 10,
  section: withData(GoalDisplay),
  ownHeading: true,
  hides: ["format", "percent", "reached", "label"],
});

registerDrawer(PIVOT, {
  tab: "data",
  order: 10,
  section: withData(PivotData),
  hidesData: ["measure", "breakdown"],
});
registerDrawer(PIVOT, {
  tab: "display",
  order: 10,
  section: withData(PivotDisplay),
  hides: ["format", "shade", "rowTotals", "columnTotals"],
});
