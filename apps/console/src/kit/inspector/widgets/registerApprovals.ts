/**
 * Registers the Approvals widget's drawer with the shell (`../custom.ts`). Importing this file
 * does it. Its rows that the definition's hints already draw (Looks like, A click opens, Decided
 * ones) are left to the shell; what is its own is which requests, what each shows, and deciding.
 */
import { createElement } from "react";
import { registerDrawer, registerTilePreview } from "../custom.ts";
import {
  ApprovalsActionsSection,
  ApprovalsDataSection,
  ApprovalsFieldsSection,
  LookPreview,
} from "./approvalsDrawer.tsx";
import { FlatSection } from "./recordShared.tsx";

const TYPE = "core/approvals";

registerDrawer(TYPE, {
  tab: "data",
  group: "Which requests",
  order: 0,
  render: (env) => createElement(FlatSection, null, createElement(ApprovalsDataSection, { env })),
  dot: (env) => env.widget.data?.requests !== undefined,
});

registerDrawer(TYPE, {
  tab: "display",
  group: "What each shows",
  order: 2,
  hides: ["fields"],
  render: (env) => createElement(FlatSection, null, createElement(ApprovalsFieldsSection, { env })),
  dot: (env) => Array.isArray(env.config.fields) && env.config.fields.length > 0,
});

registerDrawer(TYPE, {
  tab: "actions",
  group: "Deciding",
  order: 0,
  hides: ["approveLabel", "rejectLabel", "askWhy", "confirm", "advance"],
  render: (env) =>
    createElement(FlatSection, null, createElement(ApprovalsActionsSection, { env })),
});

// What each tile of "Looks like" draws: the arrangement, as a few shapes.
registerTilePreview(TYPE, "look", (value) => createElement(LookPreview, { look: value }));
