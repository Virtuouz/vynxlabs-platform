/**
 * The core pack's views, to go with its definitions. What draws pages
 * (`@volvel/screens`) takes this as `corePack`. A view is written against
 * `@volvel/widgets` and `@volvel/ui` and nothing else.
 */
import type { WidgetDefinition, WidgetViewProps } from "@volvel/widgets";
import type { ComponentType } from "react";
import { CORE_WIDGETS } from "../src/index.ts";
import { ActionsView } from "./actions.tsx";
import { ApprovalsView } from "./approvals.tsx";
import { ButtonView } from "./button.tsx";
import { ChartView } from "./chart.tsx";
import { DetailView } from "./detail.tsx";
import { FilterView } from "./filter.tsx";
import { FormView } from "./form.tsx";
import { ListView } from "./list.tsx";
import { PivotView } from "./pivot.tsx";
import { SectionView } from "./section.tsx";
import { StatView } from "./stat.tsx";
import { TableView } from "./table.tsx";
import { TabsView } from "./tabs.tsx";
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
    "core/detail": DetailView,
    "core/form": FormView,
    "core/button": ButtonView,
    "core/stat": StatView,
    "core/chart": ChartView,
    "core/pivot": PivotView,
    "core/text": TextView,
    "core/section": SectionView,
    "core/tabs": TabsView,
    "core/filter": FilterView,
    "core/actions": ActionsView,
    "core/approvals": ApprovalsView,
  },
};

export { fitCount } from "./actions.tsx";
export { metaOf, relativeTime, valueWords, whyNot } from "./approvals.tsx";
export {
  type ChartKind,
  type ChartNeed,
  type ChartShape,
  chartFits,
  chartFor,
  fillGapsIn,
  isComparing,
  orderRows,
  PALETTES,
  suggestedMark,
  withCompare,
} from "./chartSpec.ts";
export { TYPING_PAUSE } from "./filter.tsx";
export {
  type DateRange,
  isRelative,
  RANGE_LABELS,
  type RelativeRange,
  relativeRange,
  valueFor,
} from "./filterValues.ts";
export { shadeOf } from "./pivot.tsx";
export { changeTone } from "./stat.tsx";
export {
  ActionsView,
  ApprovalsView,
  ButtonView,
  ChartView,
  DetailView,
  FilterView,
  FormView,
  ListView,
  PivotView,
  SectionView,
  StatView,
  TableView,
  TabsView,
  TextView,
};
