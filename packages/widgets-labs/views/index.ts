/**
 * The labs pack's views, which the page renderer draws. Written against
 * `@volvel/widgets`, `@volvel/ui` and `react` only.
 */
import type { WidgetDefinition, WidgetViewProps } from "@volvel/widgets";
import type { ComponentType } from "react";
import { LABS_WIDGETS } from "../src/index.ts";
import { GoalView } from "./goal.tsx";

/**
 * A pack as the page renderer takes it: its definitions and a view for each.
 * Structurally the same as `WidgetPack` in `@volvel/screens`, which a pack may
 * not import.
 */
export interface WidgetPack {
  definitions: readonly WidgetDefinition[];
  // biome-ignore lint/suspicious/noExplicitAny: each view is typed by its own configuration
  views: Record<string, ComponentType<WidgetViewProps<any>>>;
}

export const labsPack: WidgetPack = {
  definitions: LABS_WIDGETS,
  views: { "labs/goal": GoalView },
};
