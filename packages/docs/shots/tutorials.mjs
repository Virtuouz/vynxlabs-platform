// The pictures of the tutorials. Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/tutorials.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

const shot = (name, address, setup, ready, steps = [], mask = TIMES) => ({
  name,
  address,
  as: "admin",
  setup,
  themes: THEMES,
  viewport: VIEW,
  ready,
  steps,
  mask,
});

export default [
  shot("start/tut-approve-step", "flows/edit/tut-approve?step=approve", "tutorials-drafts", [
    { role: "complementary", name: "The chosen step" },
  ]),
  // The table chosen on the page, and its Display tab.
  shot(
    "start/tut-visits-builder",
    "screens/screens/tut-visits",
    "tutorials-drafts",
    [{ role: "complementary", name: "Settings" }],
    [{ click: { role: "group", name: "Visits" } }, { click: { role: "tab", name: "Display" } }],
    // The sample of the Starts at column is dated from the day of the run.
    [...TIMES, "text=/^[A-Z][a-z]{2} \\d+$/"],
  ),
  // The table chosen, and its Actions tab.
  shot(
    "console/tut-invoices-builder",
    "screens/screens/tut-invoices",
    "tutorials-drafts",
    [{ role: "complementary", name: "Settings" }],
    [
      { focus: "[aria-keyshortcuts~='Alt+ArrowUp']" },
      { press: "Enter" },
      { click: { role: "tab", name: "Actions" } },
      // Choosing a table that opens a side sheet draws the sheet over it: hidden, the table shows.
      { click: { role: "button", name: "Hide the preview" } },
    ],
    TIMES,
  ),
  shot(
    "console/tut-visit-mix",
    "",
    "tutorials-dashboard",
    [{ role: "heading", name: "tut Visit mix" }, { text: "Appointments by clinic" }],
    [],
    TIMES,
  ),
  shot(
    "console/tut-docs-feedback",
    "rota-site/swap-a-shift",
    "tutorials-docs",
    [{ text: "Was this page helpful?" }],
    [],
    // The day the site was deployed.
    ["text=/Last updated/"],
  ),
];
