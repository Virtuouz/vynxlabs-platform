// The pictures of the area "widgets". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/widgets.ts (or "handbook", "visit-notes", "fernhill").
import { PHONE, THEMES, TIMES, VIEW } from "./common.mjs";

export default [
  {
    name: "console/widgets-table-data",
    address: "screens/screens/wdg-visits",
    as: "admin",
    setup: "widgets-visits",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", name: "Pages" }],
    steps: [
      { click: { role: "button", name: "Appointments" } },
      { click: { role: "tab", name: "Data" } },
      { text: "at most 25" },
    ],
    mask: TIMES,
  },
  {
    name: "console/widgets-chart-scatter",
    address: "screens/screens/wdg-visits",
    as: "admin",
    setup: "widgets-visits",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", name: "Pages" }],
    steps: [
      { click: { role: "button", name: "Visits by length" } },
      { click: { role: "tab", name: "Display" } },
      { role: "heading", name: "Chart type" },
    ],
    mask: TIMES,
  },
  {
    name: "console/widgets-phone-page",
    address: "",
    as: "admin",
    setup: "widgets-phone",
    themes: THEMES,
    viewport: PHONE,
    ready: [],
    steps: [],
    mask: TIMES,
  },
];
