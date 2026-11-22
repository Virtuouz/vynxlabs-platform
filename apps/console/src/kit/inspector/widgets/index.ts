/**
 * The drawer sections of the chart, stat, pivot and goal widgets. `drawerSections(type, tab)`
 * gives what a widget draws in that tab, in order, for the shared drawer to put after its own
 * groups (Rows it uses, Page filters). Each is a component taking `{ env, data? }`.
 */
import { ChartData, ChartDisplay } from "./chartDrawer.tsx";
import { GoalData, GoalDisplay } from "./goalDrawer.tsx";
import { PivotData, PivotDisplay } from "./pivotDrawer.tsx";
import type { DrawerSection } from "./shared.tsx";
import { StatData, StatDisplay } from "./statDrawer.tsx";

export type { DrawerData, DrawerSection, SectionProps } from "./shared.tsx";

const SECTIONS: Record<string, Partial<Record<"data" | "display", DrawerSection[]>>> = {
  "core/chart": { data: [ChartData], display: [ChartDisplay] },
  "core/stat": { data: [StatData], display: [StatDisplay] },
  "core/pivot": { data: [PivotData], display: [PivotDisplay] },
  "labs/goal": { data: [GoalData], display: [GoalDisplay] },
};

/** The sections a widget type draws in a tab: none for a type or a tab this file does not know. */
export function drawerSections(type: string, tab: string): DrawerSection[] {
  return (SECTIONS[type] as Record<string, DrawerSection[]> | undefined)?.[tab] ?? [];
}

export {
  ChartData,
  ChartDisplay,
  GoalData,
  GoalDisplay,
  PivotData,
  PivotDisplay,
  StatData,
  StatDisplay,
};
