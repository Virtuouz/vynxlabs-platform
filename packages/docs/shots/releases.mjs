// The pictures of the area "releases". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/releases.ts (or "handbook", "visit-notes", "fernhill").
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

// The day a thing was saved or agreed is the day the pictures are taken, and git chooses a commit's name.
const DAYS = "text=/\\d{4}-\\d\\d-\\d\\d/";
const COMMIT = "text=/^[0-9a-f]{7}$/";
const ADDRESS = "text=/^http:\\/\\/127\\.0\\.0\\.1:\\d+\\//";

export default [
  shot(
    "console/releases-review",
    "release",
    "releases-review",
    [{ role: "button", name: "Deploy 4 changes" }],
    { mask: [...TIMES, DAYS] },
  ),
  shot("console/git-sync", "git", "releases-git", [{ role: "button", name: "Pull 1 change" }], {
    // A commit is named by what git chose, and a time by when it was made.
    mask: [...TIMES, DAYS, COMMIT, ADDRESS],
  }),
  // The scene's address is a workspace; these are the tenant's own pages, beside it.
  shot("administer/workspaces", "../../workspaces", "releases-tenant", [
    { role: "button", name: "Create workspace" },
  ]),
  shot(
    "administer/repository",
    "../../repository",
    "releases-tenant",
    [{ role: "heading", name: "Code in the console" }],
    // Tall: the section Code in the console is below the form.
    { viewport: { width: 1440, height: 1250 } },
  ),
  shot(
    "console/workspace-settings",
    "settings",
    "releases-tenant",
    [{ role: "heading", name: "Run limit" }],
    // Tall: the page goes on to the time zone and the run limit.
    { viewport: { width: 1440, height: 1500 } },
  ),
];
