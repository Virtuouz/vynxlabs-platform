/**
 * Registers the Table's and the List's drawer pieces with the shell (`../custom.ts`). Importing
 * this file does it. The shell draws each group; a piece here is only the rows of one.
 */

import { DrawerRow } from "@volvel/ui";
import { Search } from "lucide-react";
import { columnOptions, type Env } from "../controls.tsx";
import { registerDrawer, registerSettingControl } from "../custom.ts";
import { heading, searchColumns, visualOf } from "../model.ts";
import { type ColumnSetting, columnsOf, shownCount } from "./columnModel.ts";
import { ListLookSection } from "./listDrawer.tsx";
import { SlotsControl, SlotsGroup, slotSettings } from "./slots.tsx";
import {
  BUTTONS_NOTE,
  ROW_ACTIONS_NOTE,
  TableButtonsSection,
  TableColumnsSection,
  TableLookSection,
  TableRowActionsSection,
  TableRowClickSection,
  TableSelectSection,
} from "./tableDrawer.tsx";

const TABLE = "core/table";

/** The page's search box this table follows, with the columns it looks in (board 13's "Searching"). */
function searchOf(env: Env): { label: string; columns: string[] } | undefined {
  const bound = env.widget.data?.rows?.filters ?? [];
  const found = env.filters.find(
    (one) => one.type === "search" && bound.some((b) => b.filter === one.name),
  );
  const table = visualOf(env.widget.data?.rows)?.table;
  if (!found || !table) return undefined;
  return {
    label: found.label ?? heading(found.name),
    columns: searchColumns(env.widget, table, env.catalog),
  };
}

registerDrawer(TABLE, {
  tab: "data",
  group: "Searching",
  order: 50,
  when: (env) => searchOf(env) !== undefined,
  note: "Which columns the search box looks in is set on the Search and filter widget, where the box is.",
  render: (env) => {
    const found = searchOf(env);
    return (
      <DrawerRow
        label="Search box"
        icon={Search}
        value={
          found
            ? `${found.label}${found.columns.length > 0 ? `, in ${found.columns.map(heading).join(", ")}` : ""}`
            : undefined
        }
      />
    );
  },
});
const LIST = "core/list";

registerDrawer(TABLE, {
  tab: "display",
  group: "Columns",
  order: 1,
  headingLast: true,
  hides: ["columns"],
  aside: (env) =>
    shownCount(
      columnsOf(
        env.config.columns as ColumnSetting[] | undefined,
        columnOptions(env, "rows").map((one) => one.value),
      ),
    ),
  note: "Drag to reorder, the eye to hide, click to rename or format. Clicking a heading on the page opens the same thing.",
  render: (env) => <TableColumnsSection env={env} bare />,
  dot: (env) => Array.isArray(env.config.columns) && env.config.columns.length > 0,
});

registerDrawer(TABLE, {
  tab: "display",
  group: "Look",
  order: 2,
  hides: ["rowHeight", "pageSize", "empty", "stripes"],
  render: (env) => <TableLookSection env={env} bare />,
});

registerDrawer(TABLE, {
  tab: "actions",
  group: "When a row is clicked",
  order: 1,
  render: (env) => <TableRowClickSection env={env} bare />,
});

registerDrawer(TABLE, {
  tab: "actions",
  group: "Row actions",
  order: 2,
  hides: ["rowActions"],
  note: ROW_ACTIONS_NOTE,
  render: (env) => <TableRowActionsSection env={env} bare />,
});

registerDrawer(TABLE, {
  tab: "actions",
  group: "Buttons above the table",
  order: 3,
  hides: ["buttons"],
  note: BUTTONS_NOTE,
  render: (env) => <TableButtonsSection env={env} bare />,
});

registerDrawer(TABLE, {
  tab: "actions",
  group: "Selecting rows",
  order: 4,
  hides: ["select"],
  render: (env) => <TableSelectSection env={env} bare />,
});

// The List: the sample row with its places, and a row for each. The five places are hidden from
// the generic rows; the two groups share one picker.
const PLACES = ["title", "subtitle", "right", "badge", "picture"];

registerDrawer(LIST, {
  tab: "actions",
  group: "When a row is clicked",
  order: 1,
  render: (env) => <TableRowClickSection env={env} bare />,
});

registerDrawer(LIST, {
  tab: "display",
  group: "Each row looks like",
  order: 1,
  headingLast: true,
  hides: PLACES,
  render: (env) => <SlotsGroup env={env} bare part="preview" />,
});

registerDrawer(LIST, {
  tab: "display",
  group: "What goes where",
  order: 2,
  note: "Click a slot in the preview or a row here. Empty slots take no space.",
  render: (env) => <SlotsGroup env={env} bare part="rows" />,
});

registerDrawer(LIST, {
  tab: "display",
  group: "Look",
  order: 3,
  hides: ["look"],
  render: (env) => <ListLookSection env={env} bare />,
});

// Where a shell draws a place on its own (the shell's `slots` control), it draws a row that opens
// the same picker.
for (const place of PLACES) {
  registerSettingControl(LIST, place, (env) => {
    const setting = slotSettings(env).find((one) => one.name === place);
    return setting ? <SlotsControl env={env} setting={setting} /> : null;
  });
}
