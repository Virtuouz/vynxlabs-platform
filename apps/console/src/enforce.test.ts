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

/** Source files of any kind, tests left out. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Times, durations, counts and sizes are turned into text in one place,
 * `kit/format.ts` (07 §7.3), so that "1.2s" and "1.2 s" never stand in one
 * column. Names in the code face go through `Code`, not a helper of each screen's own.
 */
test("every time, duration and count is formatted by kit/format.ts", () => {
  const found: string[] = [];
  for (const path of sources(here)) {
    if (path.endsWith("kit/format.ts")) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const where = `${path.slice(here.length)}:${index + 1}`;
      if (/\.toLocale(String|DateString|TimeString)\(/.test(line)) found.push(`${where} toLocale…`);
      if (/new Intl\.(DateTimeFormat|RelativeTimeFormat|NumberFormat)/.test(line)) {
        found.push(`${where} new Intl…`);
      }
      if (/const code = \(/.test(line)) found.push(`${where} a code helper of its own`);
      if (/\b(ms|seconds?) < (1000|60)\b.*`\$\{/.test(line))
        found.push(`${where} a duration by hand`);
    });
  }
  expect(found).toEqual([]);
});

/**
 * `Panel` is the one container (07 §7.5): a notice or a set of facts inside it
 * drops its own border, so no box is drawn inside another. A screen that
 * draws a panel by hand loses that, and fails here.
 */
test("no screen draws a panel by hand", () => {
  const found: string[] = [];
  for (const path of [
    ...files(join(here, "screens")),
    ...files(join(here, "kit")),
    ...files(here),
  ]) {
    // The kit's sheet shows boxes as boxes; branding previews a tenant's own theme.
    if (path.endsWith("KitSheet.tsx") || path.endsWith("Branding.tsx")) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const why = `${lines[index - 1] ?? ""}${lines[index - 2] ?? ""}`;
      if (
        /rounded-panel border border-line bg-surface/.test(line) &&
        !why.includes("panel-allowed:")
      ) {
        found.push(`${path.slice(here.length)}:${index + 1}`);
      }
    });
  }
  expect([...new Set(found)]).toEqual([]);
});

/**
 * Icons come in three sizes, 14, 16 and 20 px, at one stroke (07, P4-3), and a
 * mark the kit draws is an icon, not a character that each font draws its own
 * way. The brand mark and the junction motif have sizes of their own.
 */
test("icons are 14, 16 or 20 px, and no character stands in for one", () => {
  const kit = join(here, "../../../packages/ui/src");
  const found: string[] = [];
  for (const path of [...files(here), ...files(kit)]) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const where = `${path.includes("packages/ui") ? "kit:" : ""}${path.split("/src/")[1]}:${index + 1}`;
      const size = /\bsize=\{(\d+)\}/.exec(line)?.[1];
      const motif = /BrandMark|Junction/.test(
        `${lines[index - 3]}${lines[index - 2]}${lines[index - 1]}${line}`,
      );
      if (size && !["14", "16", "20"].includes(size) && !motif) {
        found.push(`${where} size ${size}`);
      }
      if (/>\s*[✓×▲▼▾▸‹›↑↓]\s*</.test(line) || /^\s*[✓×▲▼▾▸‹›↑↓]\s*$/.test(line)) {
        found.push(`${where} a character for an icon`);
      }
    });
  }
  expect(found).toEqual([]);
});

/**
 * Motion is named by a token (07 §7.10): a transition says how long with
 * `motion-instant`, `motion-fast`, `motion-base` or `motion-slow`, never a
 * duration of its own, and the only things that loop or play are the running
 * icon, a spinner, a loading shape and a row arriving. Under reduced motion,
 * nothing moves at all.
 */
test("every transition is timed by a motion token, and reduced motion stops all of them", () => {
  const kit = join(here, "../../../packages/ui/src");
  const found: string[] = [];
  for (const path of [...files(here), ...files(kit)]) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const where = `${path.split("/src/")[1]}:${index + 1}`;
      if (
        /\btransition(-[\w[\],-]+)?\b/.test(line) &&
        /className/.test(`${lines[index - 1]}${line}`)
      ) {
        const classes = line.match(/\btransition(-[\w[\],-]+)?/g) ?? [];
        if (classes.length > 0 && !/\bmotion-(instant|fast|base|slow)\b/.test(line)) {
          found.push(`${where} a transition without a motion token`);
        }
      }
      if (/\bduration-\d+\b/.test(line)) found.push(`${where} a duration of its own`);
      for (const kind of line.match(/\banimate-[\w-]+/g) ?? []) {
        if (
          ![
            "animate-spin",
            "animate-spin-slow",
            "animate-pulse",
            "animate-arrive",
            "animate-none",
          ].includes(kind)
        ) {
          found.push(`${where} ${kind}`);
        }
      }
    });
  }
  expect(found).toEqual([]);
  const tokens = readFileSync(join(kit, "tokens.css"), "utf8");
  expect(tokens).toMatch(
    /@media \(prefers-reduced-motion: reduce\) \{\s*\* \{\s*transition: none !important;\s*animation: none !important;/,
  );
});

/**
 * Every sheet and dialog arrives and leaves with motion (07 §7.10). One that
 * is drawn only while it is wanted, with `open` written bare, is on the page
 * for one frame less than its motion needs and goes in one: it is opened for
 * its subject with `Closing`, or stays on the page with `open={…}` and no
 * `key` that changes as it closes. The
 * inspector is the exception, because the list beside it keeps it while it
 * shuts. A panel that covers the page is made by the kit's `SideSheet`,
 * `Dialog` or `Appear`, which carry the motion, and never by hand.
 * `overlay-allowed:` on the line before says why one is not.
 */
test("every sheet and dialog can arrive and leave with motion", () => {
  const found: string[] = [];
  for (const path of new Set(drawn())) {
    const inKit = /packages\/ui\/src\//.test(path) || path.endsWith("kit/layout.tsx");
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/overlay-allowed:/.test(`${lines[index - 1]}${lines[index - 2]}`)) return;
      const bare = /^\s*open$/.test(line) || /<[A-Z]\w*\b[^=]*\sopen(\s+\w+=|\s*\/?>)/.test(line);
      if (bare) {
        // The tag it is written on: this line's, or the nearest one opened above.
        let at = index;
        while (at > 0 && !/<[A-Z]\w*/.test(lines[at] as string)) at--;
        const tag = (lines[at] as string).match(/<([A-Z]\w*)(?![\s\S]*<[A-Z])/)?.[1];
        if (tag !== "Inspector") found.push(`${where(path)}:${index + 1} <${tag} open>`);
      }
      // A key that changes as it closes makes a new one, shut, and the open one is gone at once.
      const keyed = line.match(/^\s*key=\{String\((\w+)\)\}/)?.[1];
      if (
        keyed &&
        lines.slice(index - 3, index + 6).some((near) => near.includes(`open={${keyed}}`))
      ) {
        found.push(`${where(path)}:${index + 1} keyed by whether it is open`);
      }
      if (!inKit && /(?<!\[)role="dialog"/.test(line)) {
        found.push(`${where(path)}:${index + 1} a dialog made by hand`);
      }
      if (!inKit && /className=.*\bfixed\b.*\binset-(y-)?0\b/.test(line)) {
        found.push(`${where(path)}:${index + 1} a panel over the page made by hand`);
      }
    });
  }
  expect(found).toEqual([]);
});

/**
 * Whatever is moved a place by a button or a key is seen to move (phase 19,
 * M2). The buttons are the kit's `MoveButtons`, and what they move is held by
 * `useFlip`, which plays each thing from where it was. So no screen draws
 * move buttons of its own, and a file that moves things from the arrow keys
 * uses `useFlip` or the shared placement. An arrow that moves nothing, such
 * as the next match in a log, says so with `move-allowed:` on the line before.
 */
test("every move by a button or a key is animated by the shared pieces", () => {
  const found: string[] = [];
  for (const path of new Set(drawn())) {
    if (/packages\/ui\/src\/(MoveButtons|useFlip)\.tsx?$/.test(path)) continue;
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    const flips = /\buseFlip\b|\busePlacement\b/.test(text);
    lines.forEach((line, index) => {
      if (/move-allowed:/.test(`${lines[index - 1]}${lines[index - 2]}`)) return;
      if (/aria-label=\{?[`"']Move [^`"']*\b(up|down|earlier|later|left|right)[`"']/.test(line)) {
        found.push(`${where(path)}:${index + 1} move buttons of its own`);
      }
      if (
        />\s*(Move up|Move down|Up|Down)\s*</.test(line) ||
        /^\s*(Move up|Move down)$/.test(line)
      ) {
        found.push(`${where(path)}:${index + 1} move buttons of its own`);
      }
      if (/event\.key\s*[!=]==?\s*"Arrow(Up|Down|Left|Right)"/.test(line) && !flips) {
        if (
          /\b(onMove|move|moved|arrayMove|reorder)\(/.test(lines.slice(index, index + 6).join("\n"))
        ) {
          found.push(`${where(path)}:${index + 1} a move from the keyboard that is not animated`);
        }
      }
    });
  }
  expect(found).toEqual([]);
});
