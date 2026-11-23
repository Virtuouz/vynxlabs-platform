// The pictures of the area "operate". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/operate.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

// What the server chose or the run's own speed decided: a run's ID, how long it ran, and a date
// that is the day the scene was built (the browser's clock stands on another).
const RUNS = [
  ...TIMES,
  // By text and not by role: behind a dialog the list is hidden from the page's roles.
  "text=/^[0-9a-f]{8}$/",
  "text=/^\\d+ ms$/",
  { role: "gridcell", hasText: "^\\d{4}-\\d\\d-\\d\\d$" },
  { role: "gridcell", hasText: "^\\d+\\w ago$" },
  // "Updated 10:02" follows the description of the list when the page is not streaming.
  "text=/^Scripts and flows that ran here/",
];

const shot = (name, setup, address, ready, extra = {}) => ({
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
    "console/operate-runs",
    "operate-stockroom",
    "runs",
    [{ role: "heading", level: 1, name: "Runs" }],
    {
      mask: RUNS,
    },
  ),
  shot(
    "console/operate-run-failed",
    "operate-failed-run",
    "runs",
    [{ role: "heading", level: 1, name: "Runs" }],
    {
      steps: [{ click: { role: "link", name: "orders/lookup" } }, { text: "Why it failed" }],
      mask: [
        ...TIMES,
        "text=/^[0-9a-f]{8}-[0-9a-f]{4}-/",
        "text=/^\\d\\d:\\d\\d:\\d\\d\\.\\d{3}$/",
        "text=/^\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d$/",
        "text=/^waited /",
        "text=/^Trace /",
      ],
    },
  ),
  shot(
    "console/operate-cancel-by-age",
    "operate-stockroom",
    "runs",
    [{ role: "heading", level: 1, name: "Runs" }],
    {
      steps: [{ click: { role: "button", name: "Cancel by age…" } }, { role: "dialog" }],
      mask: RUNS,
    },
  ),
  shot(
    "console/operate-triggers",
    "operate-stockroom",
    "triggers?trigger=orders%2Fmorning-check",
    [{ role: "heading", level: 1, name: "Triggers" }],
    {
      mask: [...TIMES, "text=/^Next \\d{4}-/", "text=/^\\d{4}-\\d\\d-\\d\\d$/"],
    },
  ),
  shot(
    "console/operate-events",
    "operate-stockroom",
    "events",
    [{ role: "heading", level: 1, name: "Events" }],
    {
      steps: [{ focus: "td[data-cell='0:0']" }, { press: "Enter" }],
      mask: [
        ...RUNS,
        "text=/^\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d$/",
        "text=/^[0-9a-f]{8}-[0-9a-f]{4}-/",
      ],
    },
  ),
  shot(
    "console/operate-approvals",
    "operate-stockroom",
    "approvals",
    [{ text: "Item: Ear drops" }],
    {
      mask: [...TIMES, "text=/^\\d{4}-\\d\\d-\\d\\d$/"],
    },
  ),
  shot("console/configure-alerts-default", "operate-alerts", "alerts", [
    { role: "button", name: "Send a test alert" },
  ]),
];
