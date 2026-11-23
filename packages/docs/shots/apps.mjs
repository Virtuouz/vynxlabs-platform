// The pictures of the area "apps". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/apps.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

// The tenant's slug is in each address shown, and is not the same in each run.
const ADDRESSES = "text=/\\/apps\\/pictures-/";

export default [
  {
    name: "console/apps-list",
    address: "apps",
    as: "admin",
    setup: "apps-shared",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "gridcell", name: "Desk desk" }],
    steps: [{ click: { role: "gridcell", name: "Desk desk" } }, { role: "button", name: "Share" }],
    mask: [...TIMES, ADDRESSES],
  },
  {
    name: "console/apps-share",
    address: "apps?app=desk",
    as: "admin",
    setup: "apps-shared",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "button", name: "Share" }],
    steps: [{ click: { role: "button", name: "Share" } }, { text: "Add an audience" }],
    // The list behind the sheet is masked by its cells; the inspector under the sheet is not seen.
    mask: [...TIMES, `[role=grid] a[href*="/apps/pictures-"]`, `[role=dialog] >> ${ADDRESSES}`],
  },
];
