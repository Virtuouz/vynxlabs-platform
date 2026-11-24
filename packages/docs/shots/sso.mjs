// The pictures of the area "sso". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/sso.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

const sso = (name, address, ready, extra = {}) => ({
  name: `administer/sso-${name}`,
  address,
  as: "admin",
  setup: "sso-provider",
  themes: THEMES,
  viewport: VIEW,
  ready,
  steps: [],
  mask: TIMES,
  ...extra,
});

/** What differs between runs on the provider's screen: its ID in the addresses, and when the last try was. */
const PROVIDER = [...TIMES, "text=/sso\\/[0-9a-f-]{36}\\//", "text=/^The provider answered /"];

/** The moments and IDs of an audit entry, and of a hostname's record. */
const ENTRY = [
  ...TIMES,
  "text=/^\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d$/",
  "aside >> text=/^[0-9a-f]{8}-[0-9a-f]{4}-/",
];

export default [
  sso("provider-setup", "single-sign-on", [{ role: "button", name: "Acme Keycloak" }], {
    viewport: { width: 1440, height: 1100 },
    mask: PROVIDER,
    steps: [
      { click: { role: "button", name: "Acme Keycloak" } },
      { click: { role: "tab", name: "Set up" } },
      { css: "dd" },
    ],
  }),
  sso("branding-theme", "branding", [{ role: "heading", level: 1, name: "Branding" }], {
    viewport: { width: 1440, height: 2700 },
    mask: [...TIMES, "text=/\\/portal\\/pictures-/"],
    setup: "sso-tenant",
    steps: [
      { click: { role: "textbox", name: "ink-muted, light" } },
      ...[..."#cccccc"].map((key) => ({ press: key })),
      { click: { role: "textbox", name: "action, light" } },
      ...[..."notacolor"].map((key) => ({ press: key })),
    ],
  }),
  sso("domains-details", "domains", [{ role: "heading", level: 1, name: "Domains" }], {
    setup: "sso-domain",
    // The connection's state is under the sheet's shade here, and shows through a mask drawn over it.
    mask: [...TIMES.filter((one) => one !== "[data-volatile]"), "text=/^vx-domain=/"],
    steps: [
      { click: { role: "button", name: "Details" } },
      { text: "_vx-challenge.portal.example.com" },
    ],
  }),
  sso("workers-pools", "workers", [{ role: "heading", level: 1, name: "Workers" }], {
    setup: "sso-workers",
    // "1 online", and the day it was last heard from.
    mask: [...TIMES, "text=/^\\d{4}-\\d\\d-\\d\\d$/"],
  }),
  sso(
    "audit-filters",
    "audit?q=Acme%20Keycloak",
    [{ role: "heading", level: 1, name: "Audit log" }],
    {
      mask: ENTRY,
      steps: [{ click: { role: "button", name: "More filters" } }],
    },
  ),
];
