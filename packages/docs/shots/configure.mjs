// The pictures of the area "configure". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/configure.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

const shot = (name, address, setup, ready, extra = {}) => ({
  name,
  address,
  as: "admin",
  setup,
  themes: THEMES,
  viewport: VIEW,
  ready,
  steps: [],
  mask: TIMES,
  ...extra,
});

export default [
  shot(
    "console/configure-connections",
    "connections",
    "configure-connections",
    [{ role: "heading", name: "Connection groups" }],
    {
      // How long a test took, and the day it was made, are not the same in each run.
      mask: [...TIMES, "text=/^\\d+ ms/", "text=/^tested \\d{4}/"],
    },
  ),
  shot("console/configure-variables", "variables", "configure-values", [
    { css: "table, [role=grid]" },
  ]),
  shot(
    "console/configure-secrets",
    "secrets",
    "configure-values",
    [{ css: "table, [role=grid]" }],
    {
      // When a value was set is the day the pictures are taken.
      mask: [...TIMES, { role: "cell", hasText: "\\d{4}-\\d\\d-\\d\\d" }],
    },
  ),
  shot(
    "console/configure-alerts",
    "alerts",
    "configure-alerts",
    [{ role: "heading", name: "Recent alerts" }],
    {
      // The day an alert was sent is the day the pictures are taken.
      mask: [...TIMES, "text=/^\\d{4}-\\d\\d-\\d\\d$/"],
    },
  ),
  shot(
    "console/configure-connection-sheet",
    "connections",
    "configure-sheet",
    [{ role: "button", name: "New connection" }],
    {
      // Tall, so that part 4 of the sheet, with the result, is on the picture.
      viewport: { width: 1440, height: 1200 },
      steps: [
        { click: { role: "button", name: "Change" } },
        { role: "button", name: "Save again" },
        { click: { role: "button", name: "Save again" } },
        { css: "[role=dialog] >> text=/^Reached/" },
      ],
      mask: [...TIMES, "text=/\\d+ ms/"],
    },
  ),
];
