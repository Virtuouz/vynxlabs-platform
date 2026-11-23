// The pictures of the area "flows". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/flows.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

// A flow's last run and the day it was deployed are the day the scene was built.
const MASK = [
  ...TIMES,
  { role: "gridcell", hasText: "\\d+\\w ago" },
  { role: "gridcell", hasText: "\\d{4}-\\d\\d-\\d\\d" },
];

const shot = (name, address, ready, extra = {}) => ({
  name,
  address,
  as: "admin",
  setup: "flows-lab",
  themes: THEMES,
  viewport: VIEW,
  ready,
  steps: [],
  mask: MASK,
  ...extra,
});

export default [
  shot("console/flows-list", "flows", [{ role: "heading", level: 1, name: "Flows" }], {
    // The list's description folds once the member's reading of it has loaded, and a page that
    // opens before that keeps it for the visit: the screen is left and come back to, then a row is chosen.
    steps: [
      { click: { role: "link", name: "Scripts" } },
      { role: "heading", level: 1, name: "Scripts" },
      { click: { role: "link", name: "Flows" } },
      { role: "heading", level: 1, name: "Flows" },
      { focus: "td[data-cell='3:0']" },
      { press: "Enter" },
      { role: "button", name: "Remove" },
    ],
  }),
  shot("console/flow-editor", "flows/edit/orders/decide?step=approve", [
    { text: "Approve a large amount" },
  ]),
];
