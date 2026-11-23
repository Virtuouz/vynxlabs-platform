// The pictures of the area "scripts". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/scripts.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

// A script's last run is the day the scene was built, and the address an agent connects to holds
// the tenant's and the workspace's IDs.
const MASK = [
  ...TIMES,
  { role: "gridcell", hasText: "\\d+\\w ago" },
  { role: "gridcell", hasText: "\\d{4}-\\d\\d-\\d\\d" },
  { role: "code", hasText: "^http" },
  // The code editor's scrollbar and the marks beside it fade in and out with the pointer and the timing.
  ".monaco-editor .scrollbar, .monaco-editor .decorationsOverviewRuler",
];

const shot = (name, address, ready, extra = {}) => ({
  name,
  address,
  as: "admin",
  setup: "scripts-lab",
  themes: THEMES,
  viewport: VIEW,
  ready,
  steps: [],
  mask: MASK,
  ...extra,
});

export default [
  shot("console/scripts-list", "scripts", [{ role: "heading", level: 1, name: "Scripts" }], {
    // The list's description folds once the member's reading of it has loaded, and a page that
    // opens before that keeps it for the visit: the screen is left and come back to, then a row is chosen.
    steps: [
      { click: { role: "link", name: "Flows" } },
      { role: "heading", level: 1, name: "Flows" },
      { click: { role: "link", name: "Scripts" } },
      { role: "heading", level: 1, name: "Scripts" },
      { focus: "td[data-cell='0:0']" },
      { press: "Enter" },
      { role: "button", name: "Open editor" },
    ],
  }),
  shot("console/script-settings-tab", "scripts/visit-summary?tab=settings", [
    { text: "Stops after" },
  ]),
  shot("console/script-editor", "scripts/edit/greet", [{ css: ".monaco-editor" }]),
  shot("console/scripts-test-pane", "scripts/edit/greet", [{ css: ".monaco-editor" }], {
    setup: "scripts-test",
    viewport: { width: 1440, height: 1000 },
    // The run's log line carries the time it was written, and the run its own waiting and running.
    mask: [...MASK, "text=/^\\d\\d:\\d\\d:\\d\\d\\.\\d{3}$/", "text=/^waited /"],
    steps: [
      { focus: "input[name='/name']" },
      ...[..."Rowan"].map((key) => ({ press: key })),
      { click: { role: "button", name: "Run the draft" } },
      { role: "tab", name: "Result" },
      { css: "span.text-success", within: { role: "region", name: "Test pane" } },
    ],
  }),
  shot(
    "console/scripts-offer-done",
    "scripts?item=greet",
    [{ role: "button", name: "Open editor" }],
    {
      steps: [
        { click: { role: "button", name: "Offer to an agent…" } },
        { role: "dialog", name: "Offer to an agent" },
        { focus: "select[name='account']" },
        // The dialog's focus runs from the account to Cancel to Offer (it reads Continue once the
        // account has been offered the script, as it has in the second look): the third is pressed.
        { press: "Tab" },
        { press: "Tab" },
        { press: "Enter" },
        { text: "Copy the address" },
      ],
    },
  ),
];
