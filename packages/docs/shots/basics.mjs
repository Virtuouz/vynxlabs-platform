// The pictures of the area "basics". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/basics.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

const MAYA = "fernhill:maya.brooks@fernhill.example";

export default [
  {
    name: "console/basics-tenants",
    // A search in the address keeps the console from reopening Maya's last workspace.
    address: "/?q=",
    as: MAYA,
    setup: "basics-fernhill",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "link", name: "Fernhill Veterinary Group" }],
    steps: [],
    mask: TIMES,
  },
  {
    name: "console/basics-workspace-overview",
    address: "overview",
    as: MAYA,
    setup: "basics-fernhill",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", name: "Needs attention" }],
    steps: [],
    // The median time is what the runs happened to take.
    mask: [...TIMES, "xpath=//*[text()='Median time']/.."],
  },
  {
    name: "console/basics-sign-in",
    // A locum of Fernhill's, who is only there to sign out: signing out ends the session for good,
    // so it is never Maya's, whose session the other pictures use.
    address: "/",
    as: "fernhill:locum.59@fernhill.example",
    setup: "basics-fernhill",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "button", name: "Your account" }],
    steps: [
      { click: { role: "button", name: "Your account" } },
      { click: { role: "menuitem", name: "Sign out" } },
      { role: "heading", name: "Sign in" },
    ],
    mask: [],
  },
  {
    name: "start/basics-finding-your-way",
    address: "runs",
    as: MAYA,
    setup: "basics-fernhill",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ css: "table, [role=grid]" }],
    steps: [],
    // A run's ID is eight characters of what the server chose.
    mask: [...TIMES, { role: "gridcell", hasText: "^[0-9a-f]{8}$" }],
  },
];
