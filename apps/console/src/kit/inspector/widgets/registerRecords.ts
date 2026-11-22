/**
 * The drawers of the record, action, layout and filter widgets (phase 28, B6), registered with
 * the drawer shell (`../custom.ts`) as a side effect of importing this file. Each widget's
 * section is a piece of its own that draws its `DrawerGroup`s; it replaces the generic rows of
 * the settings it draws (`hides`).
 */

import type { Tab } from "@volvel/widgets";
import { type ComponentType, createElement } from "react";
import type { Env } from "../controls.tsx";
import { registerDrawer, registerTilePreview } from "../custom.ts";
import { ActionsDisplaySection } from "./actionsDrawer.tsx";
import { ButtonDisplaySection } from "./buttonDrawer.tsx";
import { DetailDataSection, DetailDisplaySection } from "./detailDrawer.tsx";
import { FilterDisplaySection } from "./filterDrawer.tsx";
import { FormDisplaySection } from "./formDrawer.tsx";
import { ButtonPreview, iconOf } from "./recordShared.tsx";
import { SectionDisplaySection } from "./sectionDrawer.tsx";
import { TabsDisplaySection } from "./tabsDrawer.tsx";
import { CalloutPreview, TextContentSection } from "./textDrawer.tsx";

export { ActionsDisplaySection } from "./actionsDrawer.tsx";
export { ButtonActionsSection, ButtonDisplaySection } from "./buttonDrawer.tsx";
export { DetailDataSection, DetailDisplaySection } from "./detailDrawer.tsx";
export { FilterDisplaySection } from "./filterDrawer.tsx";
export { FormDisplaySection } from "./formDrawer.tsx";
export { SectionDisplaySection } from "./sectionDrawer.tsx";
export { TabsDisplaySection } from "./tabsDrawer.tsx";
export { TextContentSection } from "./textDrawer.tsx";

type Section = ComponentType<{ env: Env }>;

function piece(
  type: string,
  tab: Tab,
  section: Section,
  options: {
    hides?: readonly string[];
    hidesData?: readonly ("source" | "conditions" | "sort" | "limit" | "measure" | "breakdown")[];
    headingLast?: boolean;
    ownHeading?: boolean;
    dot?: (env: Env) => boolean;
  } = {},
) {
  registerDrawer(type, { tab, order: 0, section, ...options });
}

piece("core/detail", "data", DetailDataSection, {
  hidesData: ["source"],
  dot: (env) => env.widget.data?.record !== undefined,
});
piece("core/detail", "display", DetailDisplaySection, {
  hides: ["fields", "across", "edit"],
  headingLast: true,
});
piece("core/form", "display", FormDisplaySection, {
  hides: ["fields", "submitLabel"],
  headingLast: true,
});
piece("core/button", "display", ButtonDisplaySection, {
  hides: ["label", "icon", "tone", "full", "place"],
});
piece("core/actions", "display", ActionsDisplaySection, {
  hides: ["actions", "lineUp", "showUpTo", "place"],
});
piece("core/section", "display", SectionDisplaySection, { hides: ["look", "folds", "folded"] });
// The tabs have no heading group of their own (board 18): "ownHeading" with none placed.
piece("core/tabs", "display", TabsDisplaySection, {
  ownHeading: true,
  hides: ["tabs", "opensFirst", "look", "remember"],
});
piece("core/filter", "display", FilterDisplaySection, { hides: ["filters", "sit", "reset"] });

// What a style tile draws: the real button in its tone, the callout in its look.
registerTilePreview("core/button", "tone", (value, env) =>
  createElement(ButtonPreview, {
    tone: value,
    label: typeof env.config.label === "string" ? env.config.label : "Button",
    icon: iconOf(typeof env.config.icon === "string" ? env.config.icon : undefined)?.Icon,
  }),
);
registerTilePreview("core/text", "look", (value) => createElement(CalloutPreview, { look: value }));
piece("core/text", "display", TextContentSection, { hides: ["text", "look"] });
