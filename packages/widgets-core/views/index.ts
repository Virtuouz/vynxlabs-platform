/**
 * The core pack's views, to go with its definitions. What draws pages
 * (`@volvel/screens`) takes this as `corePack`. A view is written against
 * `@volvel/widgets` and `@volvel/ui` and nothing else.
 */
import type { WidgetDefinition, WidgetViewProps } from "@volvel/widgets";
import type { ComponentType } from "react";
import { CORE_WIDGETS } from "../src/index.ts";
import { ChartView } from "./chart.tsx";
import { ListView } from "./list.tsx";
import { PivotView } from "./pivot.tsx";
import { StatView } from "./stat.tsx";
import { TableView } from "./table.tsx";
import { TextView } from "./text.tsx";

/** What a pack is to whatever draws pages: its definitions, and a view for each type. */
export interface CorePack {
  definitions: readonly WidgetDefinition[];
  // biome-ignore lint/suspicious/noExplicitAny: each view has the configuration type of its own widget
  views: Record<string, ComponentType<WidgetViewProps<any>>>;
}

export const corePack: CorePack = {
  definitions: CORE_WIDGETS,
  views: {
    "core/table": TableView,
    "core/list": ListView,
    "core/stat": StatView,
    "core/chart": ChartView,
    "core/pivot": PivotView,
    "core/text": TextView,
  },
};

export { ChartView, ListView, PivotView, StatView, TableView, TextView };
