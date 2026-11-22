/**
 * The drawers of the record, action, layout and filter widgets (phase 28, B6), registered with
 * the drawer shell (`../custom.ts`) as a side effect of importing this file. Each widget's
 * section is one piece; it replaces the generic rows of the settings it draws (`hides`), and
 * `FlatSection` keeps it from being boxed twice inside the shell's group.
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
import { ButtonPreview, FlatSection, iconOf } from "./recordShared.tsx";
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
  group: string,
  Section: Section,
  hides: readonly string[],
  dot?: (env: Env) => boolean,
) {
  registerDrawer(type, {
    tab,
    group,
    order: 0,
    hides,
    render: (env) => createElement(FlatSection, null, createElement(Section, { env })),
    ...(dot ? { dot } : {}),
  });
}

piece(
  "core/detail",
  "data",
  "Shows",
  DetailDataSection,
  [],
  (env) => env.widget.data?.record !== undefined,
);
piece("core/detail", "display", "Fields", DetailDisplaySection, ["fields", "across", "edit"]);
piece("core/form", "display", "Fields", FormDisplaySection, ["fields", "submitLabel"]);
piece("core/button", "display", "Label", ButtonDisplaySection, [
  "label",
  "icon",
  "tone",
  "full",
  "place",
]);
piece("core/actions", "display", "Buttons", ActionsDisplaySection, ["lineUp", "showUpTo", "place"]);
piece("core/section", "display", "Holds", SectionDisplaySection, ["look", "folds"]);
piece("core/tabs", "display", "Tabs", TabsDisplaySection, [
  "tabs",
  "opensFirst",
  "look",
  "remember",
]);
piece("core/filter", "display", "Filters", FilterDisplaySection, ["sit"]);

// What a style tile draws: the real button in its tone, the callout in its look.
registerTilePreview("core/button", "tone", (value, env) =>
  createElement(ButtonPreview, {
    tone: value,
    label: typeof env.config.label === "string" ? env.config.label : "Button",
    icon: iconOf(typeof env.config.icon === "string" ? env.config.icon : undefined)?.Icon,
  }),
);
registerTilePreview("core/text", "look", (value) => createElement(CalloutPreview, { look: value }));
piece("core/text", "display", "Style", TextContentSection, ["text", "look"]);
