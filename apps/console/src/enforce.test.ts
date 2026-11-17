import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

/**
 * Every list in the console is drawn by `DataTable` (08 §3.6), so a list is learned
 * once. A screen that writes its own `<table>` or uses the kit's plain `Table` fails
 * here. A table that is not a list, such as a form laid out as a grid or a chart's
 * numbers for screen readers, says why on the line before it with `table-allowed:`.
 */
const here = new URL(".", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

test("no screen draws a list of its own", () => {
  const found: string[] = [];
  for (const path of [
    ...files(join(here, "screens")),
    ...files(join(here, "kit")),
    join(here, "ListScreen.tsx"),
  ]) {
    if (path.endsWith("DataTable.tsx")) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const why = `${lines[index - 1] ?? ""}${lines[index - 2] ?? ""}`;
      if (/<table\b/.test(line) && !why.includes("table-allowed:")) {
        found.push(`${path.slice(here.length)}:${index + 1} draws a <table>`);
      }
      if (/import \{[^}]*\bTable\b[^}]*\} from "@vynxlabs\/ui"/.test(line)) {
        found.push(`${path.slice(here.length)}:${index + 1} imports the kit's Table`);
      }
    });
  }
  expect(found).toEqual([]);
});

/**
 * Something loading is shown by `LoadState`, `Pending` or `Loading` (08 §3.24):
 * nothing for the first moments, then the shape of what comes, and what failed
 * when it fails. A paragraph that says "Loading…" never ends if the read fails.
 * The words may still stand inside a control, such as a button that loads more.
 */
test("nothing says Loading… in a paragraph of its own", () => {
  const found: string[] = [];
  for (const path of [
    ...files(join(here, "screens")),
    ...files(join(here, "kit")),
    ...files(here),
  ]) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/<(p|Panel|div)\b[^>]*>\s*Loading…\s*<\/(p|Panel|div)>/.test(line)) {
        found.push(`${path.slice(here.length)}:${index + 1}`);
      }
    });
  }
  expect([...new Set(found)]).toEqual([]);
});

/**
 * Every screen's heading is `PageHeader` (08 §3.1), so a title, its state and
 * its actions sit in the same place everywhere and focus lands on it when the
 * screen opens. Sign-in and the approval link stand outside the console's shell.
 */
test("no screen writes its own h1", () => {
  const outside = ["PageHeader.tsx", "SignIn.tsx", "ApproveLink.tsx"];
  const found: string[] = [];
  for (const path of [...files(join(here, "screens")), ...files(join(here, "kit"))]) {
    if (outside.some((name) => path.endsWith(name))) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/<h1\b/.test(line)) found.push(`${path.slice(here.length)}:${index + 1}`);
    });
  }
  expect(found).toEqual([]);
});

/** The console, the component kit and the page renderer: what draws the console and tenant apps. */
const drawn = () => [
  ...files(join(here, "screens")),
  ...files(join(here, "kit")),
  ...files(here),
  ...files(join(here, "../../../packages/ui/src")),
  ...files(join(here, "../../../packages/screens/src")),
];
const where = (path: string) => path.replace(/^.*\/(apps|packages)\//, "$1/");

/**
 * Sizes, corners, shadows and layers come from the tokens (07 §7.2–7.6): a
 * value written by hand is one a brand or a density cannot reach. A value that
 * must be its own says why on the line before it with `token-allowed:`.
 */
test("no type size, corner, shadow, layer or spacing step is written by hand", () => {
  const rules: [RegExp, string][] = [
    [/\btext-\[\d/, "a type size: use a type role"],
    [/\brounded(-[trbl]{1,2})?-\[\d/, "a corner: use rounded-inner, -control, -panel or -overlay"],
    [
      /\bshadow-(sm|md|lg|xl|2xl)\b|(?<![\w-])shadow(?![\w-])/,
      "a shadow: use shadow-overlay, -modal or -drag",
    ],
    [
      /\bz-(\[\d+\]|[2-9]\d)\b/,
      "a layer: use layer-sticky, -sheet, -dialog, -popover, -toast or -skip",
    ],
    [
      /(?<![\w-])(p[xytblr]?|m[xytblr]?|gap(-[xy])?)-(2\.5|3\.5|7|9)\b/,
      "a retired spacing step: use 2, 3, 4, 8",
    ],
  ];
  const found: string[] = [];
  for (const path of drawn()) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if ((lines[index - 1] ?? "").includes("token-allowed:")) return;
      for (const [pattern, what] of rules) {
        if (pattern.test(line)) found.push(`${where(path)}:${index + 1} writes ${what}`);
      }
    });
  }
  expect([...new Set(found)]).toEqual([]);
});

/**
 * A state is shown by `StatePill`, a kind or a source by `Tag`, and a number by
 * `Badge` (08 §3.11). A Badge that says a state word is a state drawn the old
 * way. The kit's own previews say why on the line before with `badge-allowed:`.
 */
test("no Badge says a state", () => {
  const states =
    /<Badge\b[^>]*>\s*(Active|Running|Failed|Succeeded|Paused|Revoked|Expired|Enabled|Disabled|Verified|Not verified|Draft|Deployed|On|Off|Ended|Waiting|Queued|Canceled|Reachable|Not reachable)\s*</;
  const found: string[] = [];
  for (const path of [
    ...files(join(here, "screens")),
    ...files(join(here, "kit")),
    ...files(here),
  ]) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if ((lines[index - 1] ?? "").includes("badge-allowed:")) return;
      if (states.test(line)) found.push(`${where(path)}:${index + 1}`);
    });
  }
  expect(found).toEqual([]);
});
