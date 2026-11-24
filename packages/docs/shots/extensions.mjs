// The pictures of the area "extensions". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/extensions.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

export default [
  {
    name: "console/extensions-list",
    address: "extensions",
    as: "admin",
    setup: "extensions-list",
    themes: THEMES,
    viewport: VIEW,
    ready: [
      { role: "button", name: "New connector" },
      { role: "link", name: "connectors/shop" },
    ],
    steps: [],
    mask: TIMES,
  },
  {
    name: "console/extensions-editor",
    address: "extensions/connector/new",
    as: "admin",
    setup: "handbook",
    themes: THEMES,
    // Tall: the settings, the starter code and the Problems list under it.
    viewport: { width: 1440, height: 1500 },
    ready: [{ text: "No problems found." }],
    steps: [],
    mask: TIMES,
  },
  {
    name: "self-host/extensions-component-kit",
    address: "/instance/kit",
    as: "admin",
    setup: "handbook",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", name: "Component kit" }],
    steps: [],
    mask: TIMES,
  },
];
