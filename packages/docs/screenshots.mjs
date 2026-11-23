// The pictures the documentation shows, as data. One list says what each is: its name,
// the screen it is of, who is signed in, what is set up first, the themes and the size,
// and what is hidden. `e2e/screenshots.spec.ts` takes them from it, `pnpm docs:check`
// fails a page that names one that is not here, and the build and the consoles read the
// pictures by NAME through the index written beside them.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import access from "./shots/access.mjs";
import appBuilder from "./shots/app-builder.mjs";
import apps from "./shots/apps.mjs";
import basics from "./shots/basics.mjs";
import { PHONE, THEMES, TIMES, VIEW } from "./shots/common.mjs";
import configure from "./shots/configure.mjs";
import docs from "./shots/docs.mjs";
import extensions from "./shots/extensions.mjs";
import flows from "./shots/flows.mjs";
import instance from "./shots/instance.mjs";
import operate from "./shots/operate.mjs";
import queries from "./shots/queries.mjs";
import releases from "./shots/releases.mjs";
import scripts from "./shots/scripts.mjs";
import sso from "./shots/sso.mjs";
import tutorials from "./shots/tutorials.mjs";
import widgets from "./shots/widgets.mjs";

/** The day every picture is taken on, so a time on a screen is the same in each run. */
export const CLOCK = "2026-03-02T10:00:00.000Z";

/** The index that names the files taken: name -> { theme -> file }. */
export const INDEX = "index.json";

/**
 * Each shot:
 *   name     what a page writes in `::screenshot{name=…}`.
 *   address  the screen, after `/t/<tenant>/workspaces/<workspace>/`.
 *   as       who is signed in: "admin" is the instance's first administrator.
 *   setup    the scene the spec builds first (see SCENES in e2e/screenshots.spec.ts).
 *   themes   the looks it is taken in.
 *   viewport the browser's size.
 *   ready    what must be on the screen before it is taken: { role, name?, level?, text? }
 *            inside the region { within: { role, name } } or a { css } selector.
 *   steps    what a person does first: { press }, { focus: css } or { click: { role, name } },
 *            each followed by the `ready` that comes after it, if any.
 *   mask     what changes between runs, painted over and never shown: a selector, or
 *            { role, hasText } for the elements of that role whose text matches the pattern.
 */
export { PHONE, THEMES, TIMES, VIEW };

/** The first shots: the Tables sample (phase 31 M1). */
const FIRST = [
  {
    name: "console/table-help",
    address: "tables/orders",
    as: "admin",
    setup: "handbook",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ within: { role: "grid", name: "Rows of orders" }, text: "A-1043" }],
    steps: [
      { focus: "#main" },
      { press: "F1" },
      { within: { role: "complementary", name: "Help" }, role: "heading", name: "Tables" },
    ],
    mask: TIMES,
  },
  {
    name: "console/tables-list",
    address: "tables",
    as: "admin",
    setup: "handbook",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "link", name: "orders" }],
    steps: [],
    mask: TIMES,
  },
  {
    name: "console/table-rows",
    address: "tables/orders",
    as: "admin",
    setup: "handbook",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ within: { role: "grid", name: "Rows of orders" }, text: "A-1043" }],
    steps: [],
    mask: TIMES,
  },
  {
    name: "console/table-definition",
    address: "tables/customers?view=definition",
    as: "admin",
    setup: "handbook",
    themes: THEMES,
    // Tall: the page shows its columns, then what stands for a row, the indexes and who sees rows.
    viewport: { width: 1440, height: 1500 },
    ready: [{ role: "heading", level: 2, name: "Columns" }],
    steps: [],
    mask: TIMES,
  },
  {
    name: "console/documentation",
    address: "docs/handbook/support/refunds",
    as: "admin",
    setup: "handbook",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", level: 2, name: "Refund an order" }],
    steps: [],
    mask: TIMES,
  },
  {
    name: "console/page-editor",
    address: "docs/handbook/support/refunds",
    as: "admin",
    setup: "handbook",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", level: 2, name: "Refund an order" }],
    steps: [
      { click: { role: "button", name: "Edit" } },
      { css: ".monaco-editor" },
      { within: { role: "region", name: "The page as it will be served" }, text: "Mind the limit" },
    ],
    mask: TIMES,
  },
  {
    name: "console/table-rows-filtered",
    address: "tables/orders?sort=status%2C-total&filter=%7B%22total%22%3A%2220..90%22%7D",
    as: "admin",
    setup: "handbook",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ within: { role: "grid", name: "Rows of orders" }, text: "A-1043" }],
    steps: [],
    mask: TIMES,
  },
  {
    name: "start/visit-notes-definition",
    address: "tables/visit-notes?view=definition",
    as: "admin",
    setup: "visit-notes",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "button", name: "Add column" }],
    steps: [],
    mask: TIMES,
  },
  {
    name: "start/visit-notes-filtered",
    address: "tables/visit-notes?filter=%7B%22minutes%22%3A%22%3E%3D20%22%7D&sort=-minutes",
    as: "admin",
    setup: "visit-notes",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ within: { role: "grid", name: "Rows of visit-notes" }, text: "Moss: dental clean" }],
    steps: [],
    mask: TIMES,
  },
];

// Each area's shots, in a file of its own beside this one (shots/<area>.mjs), so that the
// areas are added to without touching each other. Their scenes are in e2e/scenes/<area>.ts.
export const SHOTS = [
  ...FIRST,
  ...access,
  ...appBuilder,
  ...apps,
  ...basics,
  ...configure,
  ...docs,
  ...extensions,
  ...flows,
  ...instance,
  ...operate,
  ...queries,
  ...releases,
  ...scripts,
  ...sso,
  ...tutorials,
  ...widgets,
];

export const shotNames = () => SHOTS.map((shot) => shot.name);

/** `console/table-help.dark.3f2a9c1b7d4e.png`: the name, the look, and a hash of the picture's bytes. */
export function fileName(name, theme, bytes) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  return `${name}.${theme}.${hash}.png`;
}

export function readIndex(folder) {
  const file = join(folder, INDEX);
  if (!existsSync(file)) return {};
  const found = JSON.parse(readFileSync(file, "utf8"));
  return found && typeof found === "object" && found.shots ? found.shots : {};
}

export function writeIndex(folder, shots) {
  const sorted = Object.fromEntries(
    Object.keys(shots)
      .sort()
      .map((key) => [key, shots[key]]),
  );
  writeFileSync(join(folder, INDEX), `${JSON.stringify({ shots: sorted }, null, 2)}\n`);
}

/** Every shot and look the list asks for that the index does not have, as "name (theme)". */
export function missing(taken) {
  return SHOTS.flatMap((shot) =>
    shot.themes
      .filter((theme) => !taken[shot.name]?.[theme])
      .map((theme) => `${shot.name} (${theme})`),
  );
}
