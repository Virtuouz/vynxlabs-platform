/**
 * The drawers of the record, action, layout and filter widgets (phase 28, B6), as sections per
 * tab. `drawerSections(type, tab)` is what the drawer registry asks for; an empty list means
 * this file draws nothing for that widget and tab (the shared tabs, or another file, do).
 *
 * Tabs: "data", "display", "actions" and, for Text, "content".
 */
import type { ComponentType } from "react";
import { ActionsDisplaySection } from "./actionsDrawer.tsx";
import { ButtonActionsSection, ButtonDisplaySection } from "./buttonDrawer.tsx";
import { DetailDataSection, DetailDisplaySection } from "./detailDrawer.tsx";
import { FilterDisplaySection } from "./filterDrawer.tsx";
import { FormDisplaySection } from "./formDrawer.tsx";
import { SectionDisplaySection } from "./sectionDrawer.tsx";
import type { Env } from "./shared.tsx";
import { TabsDisplaySection } from "./tabsDrawer.tsx";
import { TextContentSection } from "./textDrawer.tsx";

export { ActionsDisplaySection } from "./actionsDrawer.tsx";
export { ButtonActionsSection, ButtonDisplaySection } from "./buttonDrawer.tsx";
export { DetailDataSection, DetailDisplaySection } from "./detailDrawer.tsx";
export { FilterDisplaySection } from "./filterDrawer.tsx";
export { FormDisplaySection } from "./formDrawer.tsx";
export { SectionDisplaySection } from "./sectionDrawer.tsx";
export { TabsDisplaySection } from "./tabsDrawer.tsx";
export { TextContentSection } from "./textDrawer.tsx";

/** What a section is given. `onSelectWidget` selects a widget on the page (Section's "Holds"). */
export interface DrawerSectionProps {
  env: Env;
  onSelectWidget?: (id: string) => void;
}

export interface DrawerSectionEntry {
  id: string;
  /** Draw it as `<entry.component env={env} />`. */
  component: ComponentType<DrawerSectionProps>;
}

const ENTRIES: Record<string, Record<string, DrawerSectionEntry[]>> = {
  "core/detail": {
    data: [{ id: "detail-record", component: DetailDataSection }],
    display: [{ id: "detail-fields", component: DetailDisplaySection }],
  },
  "core/form": {
    display: [{ id: "form-fields", component: FormDisplaySection }],
  },
  "core/button": {
    display: [{ id: "button-display", component: ButtonDisplaySection }],
    // A stand-in for the shared step list.
    actions: [{ id: "button-actions", component: ButtonActionsSection }],
  },
  "core/actions": {
    display: [{ id: "actions-buttons", component: ActionsDisplaySection }],
  },
  "core/section": {
    display: [{ id: "section-display", component: SectionDisplaySection }],
  },
  "core/tabs": {
    display: [{ id: "tabs-display", component: TabsDisplaySection }],
  },
  "core/filter": {
    display: [{ id: "filter-display", component: FilterDisplaySection }],
  },
  "core/text": {
    content: [{ id: "text-content", component: TextContentSection }],
  },
};

export function drawerSections(type: string, tab: string): DrawerSectionEntry[] {
  return ENTRIES[type]?.[tab] ?? [];
}
