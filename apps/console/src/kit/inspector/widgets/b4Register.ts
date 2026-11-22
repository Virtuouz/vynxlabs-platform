/**
 * Registers the chart, stat, goal and pivot sections with the drawer's extension points
 * (`../custom.ts`). A section is a component that returns `DrawerGroup`s; each group becomes one
 * contribution to the group of that name, drawn from the group's own rows and note. A section
 * is plain (no hooks of its own), so it is called as a function to read its groups, again on every
 * render, with the `Env` the drawer gives.
 *
 * The title and the line under it are the shell's (its "Title" group), so a section's "Heading"
 * group is not registered. What the real rows say (`DrawerData`) is given by `provideDrawerData`.
 */

import { DrawerGroup } from "@volvel/ui";
import type { Tab } from "@volvel/widgets";
import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import type { Env } from "../controls.tsx";
import { registerDrawer } from "../custom.ts";
import { ChartData, ChartDisplay } from "./chartDrawer.tsx";
import type { DrawerData, DrawerSection } from "./chartShared.tsx";
import { GoalData, GoalDisplay } from "./goalDrawer.tsx";
import { PivotData, PivotDisplay } from "./pivotDrawer.tsx";
import { StatData, StatDisplay } from "./statDrawer.tsx";

let source: (env: Env) => DrawerData | undefined = () => undefined;

/** Where the sections read what the rows say (a summary, the count of values of each column) from. */
export function provideDrawerData(read: (env: Env) => DrawerData | undefined) {
  source = read;
}

interface Found {
  label: string;
  note: ReactNode;
  children: ReactNode;
}

/** The `DrawerGroup`s a section draws, found by calling its components down to them. */
function groupsOf(node: ReactNode, out: Found[] = []): Found[] {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue;
    const element = child as ReactElement<Record<string, unknown>>;
    if (element.type === DrawerGroup) {
      out.push({
        label: String(element.props.label),
        note: element.props.note as ReactNode,
        children: element.props.children as ReactNode,
      });
    } else if (element.type === Fragment) {
      groupsOf(element.props.children as ReactNode, out);
    } else if (typeof element.type === "function") {
      groupsOf((element.type as (props: unknown) => ReactNode)(element.props), out);
    }
  }
  return out;
}

const found = (section: DrawerSection, env: Env): Found[] => {
  const data = source(env);
  return groupsOf(section({ env, ...(data ? { data } : {}) })).filter(
    (one) => one.label !== "Heading",
  );
};

/** The config settings each type's sections draw themselves, so the generic row of each is left out. */
const HIDES: Record<string, Record<"data" | "display", string[]>> = {
  "core/chart": {
    data: ["order", "fillGaps"],
    display: [
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
    ],
  },
  "core/stat": {
    data: [],
    display: ["format", "compare", "compareTo", "delta", "goodWhen"],
  },
  "labs/goal": {
    data: ["target", "goalFrom"],
    display: ["format", "percent", "reached"],
  },
  "core/pivot": { data: [], display: ["format", "shade", "rowTotals", "columnTotals"] },
};

/** Where each group stands among the others of its tab: the preview first, then as the boards read. */
const ORDER: Record<string, number> = {
  Preview: -1000,
  "What to chart": 10,
  "What it shows": 10,
  "What to show": 10,
  Progress: 10,
  Order: 20,
  "Chart type": 20,
  Look: 30,
  Compare: 40,
  "Over time": 40,
};

function register(type: string, tab: "data" | "display", section: DrawerSection, labels: string[]) {
  labels.forEach((label, at) => {
    registerDrawer(type, {
      tab: tab as Tab,
      group: label,
      order: (ORDER[label] ?? 100) + at / 100,
      ...(at === 0 ? { hides: HIDES[type]?.[tab] ?? [] } : {}),
      when: (env) => found(section, env).some((one) => one.label === label),
      render: (env) => found(section, env).find((one) => one.label === label)?.children,
      note: (env) => found(section, env).find((one) => one.label === label)?.note,
    });
  });
}

register("core/chart", "data", ChartData, ["What to chart", "Order"]);
register("core/chart", "display", ChartDisplay, ["Chart type", "Look", "Over time"]);
register("core/stat", "data", StatData, ["What it shows"]);
register("core/stat", "display", StatDisplay, ["Preview", "Look", "Compare"]);
register("labs/goal", "data", GoalData, ["Preview", "Progress"]);
register("labs/goal", "display", GoalDisplay, ["Preview", "Look"]);
register("core/pivot", "data", PivotData, ["What to show"]);
register("core/pivot", "display", PivotDisplay, ["Look"]);
