/**
 * The drawer sections each widget draws itself, by widget type and tab. The shell asks
 * `drawerSections(type, tab)` and draws what it gets in place of the generic rows for that tab.
 * Each widget's entries are on their own lines.
 */
import type { Tab } from "@volvel/widgets";
import type { ComponentType } from "react";
import type { Env } from "../controls.tsx";
import { ListDisplay } from "./listDrawer.tsx";
import type { TableSource } from "./tableData.ts";
import { TableActions, TableDisplay } from "./tableDrawer.tsx";

/** What a section is given: the inspector's `Env`, and optionally the table's rows and definition. */
export type SectionProps = { env: Env } & TableSource;
export type DrawerSection = ComponentType<SectionProps>;

const SECTIONS: Record<string, DrawerSection[]> = {
  "core/table:display": [TableDisplay],
  "core/table:actions": [TableActions],
  "core/list:display": [ListDisplay],
};

/** The sections a widget type draws on a tab, or none when the generic rows do. */
export function drawerSections(type: string, tab: Tab): DrawerSection[] {
  return SECTIONS[`${type}:${tab}`] ?? [];
}

export { CanvasColumnEditor, ColumnEditor, ColumnEditorBody } from "./ColumnEditor.tsx";
export {
  type ColumnRequest,
  clearColumnRequest,
  requestColumn,
  useColumnRequest,
} from "./columnRequest.ts";
export { ListDisplay, ListLookSection } from "./listDrawer.tsx";
export { SlotsControl, SlotsGroup } from "./slots.tsx";
export type { TableSource } from "./tableData.ts";
export {
  TableActions,
  TableColumnsSection,
  TableDisplay,
  TableLookSection,
  TableRowClickSection,
} from "./tableDrawer.tsx";
