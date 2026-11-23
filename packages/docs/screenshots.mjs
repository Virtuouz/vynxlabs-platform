// The pictures the documentation shows, as data. One list says what each is: its name,
// the screen it is of, who is signed in, what is set up first, the themes and the size,
// and what is hidden. `e2e/screenshots.spec.ts` takes them from it, `pnpm docs:check`
// fails a page that names one that is not here, and the build and the consoles read the
// pictures by NAME through the index written beside them.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The day every picture is taken on, so a time on a screen is the same in each run. */
export const CLOCK = "2026-03-02T10:00:00.000Z";

export const THEMES = ["light", "dark"];

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
const VIEW = { width: 1440, height: 900 };
// A time the server wrote is the moment the scene was built, whatever the clock of the
// browser says: it is painted over, as a <time> or as a cell that reads like one.
const TIMES = [
  "time",
  // What the console itself marks as changing from one look to the next (the connection's state).
  "[data-volatile]",
  { role: "gridcell", hasText: "\\d{4}, \\d+:\\d\\d\\s[AP]M" },
];

export const SHOTS = [
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
