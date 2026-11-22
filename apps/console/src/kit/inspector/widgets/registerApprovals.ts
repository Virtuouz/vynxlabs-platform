/**
 * Registers the Approvals widget's drawer with the shell (`../custom.ts`); `registerAll.ts`
 * imports it. Its rows that the definition's hints already draw (Looks like, A click opens,
 * Decided ones) are left to the shell; what is its own is which requests, what each shows, and
 * deciding. Each piece is a whole section drawing its own groups.
 */

import { createElement } from "react";
import { registerDrawer, registerTilePreview } from "../custom.ts";
import {
  ApprovalsActionsSection,
  ApprovalsDataSection,
  ApprovalsFieldsSection,
  LookPreview,
} from "./approvalsDrawer.tsx";

const TYPE = "core/approvals";

registerDrawer(TYPE, {
  tab: "data",
  order: 0,
  section: ApprovalsDataSection,
});

registerDrawer(TYPE, {
  tab: "display",
  order: 2,
  section: ApprovalsFieldsSection,
  hides: ["fields"],
  headingLast: true,
});

registerDrawer(TYPE, {
  tab: "actions",
  order: 0,
  section: ApprovalsActionsSection,
  hides: ["approveLabel", "rejectLabel", "askWhy", "confirm", "advance"],
});

// What each tile of "Looks like" draws: the arrangement, as a few shapes.
registerTilePreview(TYPE, "look", (value) => createElement(LookPreview, { look: value }));
