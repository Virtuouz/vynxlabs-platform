// The pictures of the area "access". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/access.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

const MAYA = "fernhill:maya.brooks@fernhill.example";

const access = (name, address, ready, extra = {}) => ({
  name,
  address,
  as: MAYA,
  setup: "access-fernhill",
  themes: THEMES,
  viewport: VIEW,
  ready,
  steps: [],
  mask: TIMES,
  ...extra,
});

export default [
  access("administer/access-groups", "groups", [
    { role: "heading", level: 1, name: "Members & access" },
  ]),
  access("administer/access-list", "access", [
    { role: "heading", level: 1, name: "Members & access" },
  ]),
  access("administer/access-end-users", "end-users", [
    { role: "heading", level: 1, name: "End users" },
  ]),
  access(
    "administer/access-changes",
    "releases",
    [{ role: "heading", level: 1, name: "Members & access" }],
    { as: "sam", setup: "access-waiting" },
  ),
  // A person of the run's own, so the Sessions table lists only the sessions of this look; the address is hidden.
  access(
    "console/account-sessions",
    "/account/api-keys",
    [{ role: "heading", level: 2, name: "Sessions" }],
    {
      as: "dana",
      viewport: { width: 1440, height: 1500 },
      setup: "access-account",
      mask: [...TIMES, "text=/^dana\\.whitfield\\.[a-z0-9]+@example\\.com$/"],
      steps: [{ text: "This session" }],
    },
  ),
];
