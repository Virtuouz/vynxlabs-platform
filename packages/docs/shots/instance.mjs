// The pictures of the area "instance". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/instance.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

/** The cells and buttons that read as a moment on the Instance screens (the audit log's, a bare date). */
const MOMENTS = [
  ...TIMES,
  // A time as the audit log writes it, and an ID in the entry beside it.
  "text=/^\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d$/",
  "aside >> text=/^[0-9a-f]{8}-[0-9a-f]{4}-/",
];

const instance = (name, address, ready, extra = {}) => ({
  name: `self-host/instance-${name}`,
  address,
  as: "admin",
  setup: "handbook",
  themes: THEMES,
  viewport: VIEW,
  ready,
  steps: [],
  mask: MOMENTS,
  ...extra,
});
const heading = (name) => [{ role: "heading", level: 1, name }];

export default [
  // The one tenant that is Fernhill's own: each run of the pictures also makes a tenant called Fernhill.
  instance("tenants", "/?q=veterinary", heading("Tenants"), {
    steps: [
      // A row is named by all its cells: the first Fernhill is the one whose slug is `fernhill`, not
      // a copy ("Fernhill Veterinary Group (fernhill-w0) fernhill-w0 …").
      { click: { role: "row", name: /^Fernhill Veterinary Group fernhill / } },
      { role: "heading", level: 2, name: "Fernhill Veterinary Group" },
    ],
  }),
  instance("members", "/instance/members?q=fernhill.example", heading("All members")),
  instance("operators", "/instance/operators", heading("Operators"), {
    setup: "instance-operators",
  }),
  instance("databases", "/instance/databases", heading("Database locations"), {
    setup: "instance-databases",
    steps: [
      { click: { role: "row", name: "eu-tables" } },
      { role: "heading", level: 2, name: "eu-tables" },
    ],
  }),
  instance("triggers", "/instance/triggers", heading("Triggers")),
  instance("health", "/instance/health", heading("Health"), {
    viewport: { width: 1440, height: 1480 },
    mask: [...MOMENTS, "text=/^\\d+ ms$/", "text=/^[0-9a-f]{16}$/"],
  }),
  instance("import-check", "/instance/import", heading("Import a tenant"), {
    setup: "instance-import",
    viewport: { width: 1440, height: 1800 },
    mask: [...MOMENTS, "text=/kept until/"],
    steps: [
      { click: { role: "button", name: "Open" } },
      { click: { role: "textbox", name: "Its passphrase" } },
      ...[..."willow-passphrase-2026"].map((key) => ({ press: key })),
      { css: "li[data-check=ok]", text: "The passphrase opens it" },
    ],
  }),
  instance("audit", "/instance/audit?area=tenant_import", heading("Instance audit log"), {
    setup: "instance-import",
    steps: [{ role: "heading", level: 2, name: "Entry details" }],
  }),
  instance("branding", "/instance/branding", heading("Console branding"), {
    viewport: { width: 1440, height: 2200 },
  }),
];
