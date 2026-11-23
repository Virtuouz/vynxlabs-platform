// The pictures of the area "app-builder". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/app-builder.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

export default [
  {
    name: "console/app-builder-page-settings",
    address: "screens/screens/front-desk",
    as: "admin",
    setup: "app-builder-list-app",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", name: "Pages" }],
    steps: [
      { click: { role: "button", name: "Appointment detail Side sheet" } },
      { role: "heading", name: "Page type" },
    ],
    mask: TIMES,
  },
  {
    name: "console/app-builder-settings",
    address: "screens/screens/front-desk",
    as: "admin",
    setup: "app-builder-list-app",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", name: "Pages" }],
    steps: [
      { focus: 'button:has-text("Appointments"):not(:has-text("Page")):not([aria-label])' },
      { press: "Enter" },
      { focus: "#main" },
      { click: { role: "tab", name: "Data" } },
      { text: "at most 25" },
    ],
    mask: TIMES,
  },
  {
    name: "console/app-builder-publish-check",
    address: "screens/screens/front-desk",
    as: "admin",
    setup: "app-builder-list-app",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", name: "Pages" }],
    steps: [
      { focus: 'button:text-is("Publish")' },
      { press: "Enter" },
      { text: "Ready to publish" },
    ],
    mask: TIMES,
  },
  {
    name: "console/app-builder-list",
    address: "screens",
    as: "admin",
    setup: "app-builder-apps",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "link", name: "Clinic operations" }],
    steps: [],
    // The address holds the run's tenant, and the edit date is the server's own clock.
    mask: [...TIMES, 'a[href^="http"]', "text=/edited \\d{4}/"],
  },
  {
    name: "console/app-builder-workbench",
    address: "screens/screens/front-desk",
    as: "admin",
    setup: "app-builder-list-app",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", name: "Pages" }],
    steps: [
      { focus: 'button:has-text("Appointments"):not(:has-text("Page")):not([aria-label])' },
      { press: "Enter" },
      { focus: "#main" },
      { role: "tab", name: "Data" },
    ],
    mask: TIMES,
  },
];
