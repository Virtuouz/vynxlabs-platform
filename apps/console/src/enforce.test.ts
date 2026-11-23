import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
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
      if (/import \{[^}]*\bTable\b[^}]*\} from "@volvel\/ui"/.test(line)) {
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
    /<Badge\b[^>]*>\s*(Active|Running|Failed|Succeeded|Paused|Revoked|Expired|Enabled|Disabled|Verified|Not verified|Draft|Deployed|On|Off|Ended|Waiting|Queued|Canceled|Reached|Not tested)\s*</;
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
      // `open={true}` is a sheet put on the page already open: it has no starting style, and goes in one frame.
      if (/\bopen=\{true\}/.test(line)) {
        found.push(`${where(path)}:${index + 1} born open: use Closing and pass its open`);
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
 * A list that is put in order by dragging its handle is moved by `useSortable` (packages/ui): the
 * row follows the pointer, the others slide, it settles, Esc puts it back, and nothing moves under
 * reduced motion. No screen makes a drag of its own with the browser's `draggable` and drop events
 * (the row pops into place), except a tree that moves things between folders (`Tree`, which the
 * docs and the data screens use), and the Columns menu, which is dnd-kit's and slides.
 */
test("a list reordered by a handle uses the shared sortable", () => {
  const found: string[] = [];
  for (const path of new Set(drawn())) {
    if (/packages\/ui\/src\/(Tree|drawer\/useSortable)\.tsx?$/.test(path)) continue;
    if (/apps\/console\/src\/(kit\/views|screens\/docs\/Docs)\.tsx$/.test(path)) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/\bonDragStart=|\bdraggable(=|\s*$)/.test(line) && !/draggable=\{false\}/.test(line)) {
        found.push(`${where(path)}:${index + 1} a drag of its own: use useSortable`);
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
 * uses `useFlip`, `useSortable` or the shared placement. An arrow that moves nothing, such
 * as the next match in a log, says so with `move-allowed:` on the line before.
 */
test("every move by a button or a key is animated by the shared pieces", () => {
  const found: string[] = [];
  for (const path of new Set(drawn())) {
    if (/packages\/ui\/src\/(MoveButtons|useFlip)\.tsx?$/.test(path)) continue;
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    const flips = /\buseFlip\b|\busePlacement\b|\buseSortable\b/.test(text);
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

/**
 * A table to read is given room and its reader's tools (phase 19, M5). An
 * answer is drawn by `ReadTable`, which sorts, filters and orders columns, so
 * no screen draws one with the bare `Grid`; and a dialog that holds one is
 * the `table` size, since a table in a small dialog is always scrolled.
 * `grid-allowed:` on the line before says why a `Grid` is not an answer,
 * such as a table's rows that are edited in place.
 */
test("a table that is read has its tools, and a dialog that holds one is big enough", () => {
  const found: string[] = [];
  for (const path of new Set([...files(join(here, "screens")), ...files(join(here, "kit"))])) {
    if (/kit\/(ReadTable|DataTable)\.tsx$/.test(path)) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/<Grid\b/.test(line) && !/grid-allowed:/.test(`${lines[index - 1]}${lines[index - 2]}`)) {
        found.push(`${where(path)}:${index + 1} a Grid of its own`);
      }
      if (!/<Dialog\b/.test(line)) return;
      const end = lines.findIndex((later, at) => at > index && /<\/Dialog>/.test(later));
      const inside = lines.slice(index, end < 0 ? index + 1 : end).join("\n");
      // The tag itself: its first few lines, before what it holds.
      const opening = lines.slice(index, index + 8).join("\n");
      if (/<(ReadTable|ResultTable)\b/.test(inside) && !/size="table"/.test(opening)) {
        found.push(`${where(path)}:${index + 1} a table in a dialog that is not the table size`);
      }
    });
  }
  expect(found).toEqual([]);
});

/**
 * Every section in the navigation is measured by `e2e/polish-setup.ts` (shared by the `polish-*.spec.ts` files), or that module
 * lists it in `NOT_MEASURED` (the polish gate, step 6, `docs/polish`). A section
 * added to `nav.ts` without either fails here, so its layout is not left unseen by
 * default, as the data screens were (A2-31).
 */
test("every section in the navigation is measured for polish, or says it is not", async () => {
  const { INSTANCE_SECTIONS, TENANT_SECTIONS, WORKSPACE_SECTIONS } = await import("./nav.ts");
  const sections = [
    ...Object.values(WORKSPACE_SECTIONS).flatMap((list) => list.map((s) => `workspace/${s.slug}`)),
    ...TENANT_SECTIONS.map((s) => `tenant/${s.slug}`),
    ...INSTANCE_SECTIONS.map((s) => `instance/${s.slug}`),
  ];
  const spec = readFileSync(join(here, "../../../e2e/polish-setup.ts"), "utf8");
  const start = spec.indexOf("export const workbenches = (");
  const listed = spec.slice(start, spec.indexOf("export const NOT_MEASURED", start));
  const measured = new Set<string>();
  for (const [, slug] of listed.matchAll(/\$\{ctx\.ws\}\/([\w-]+)/g))
    measured.add(`workspace/${slug}`);
  for (const [, slug] of listed.matchAll(/\/t\/\$\{ctx\.tenant\.id\}\/([\w-]+)/g)) {
    measured.add(`tenant/${slug}`);
  }
  if (/\/t\/\$\{ctx\.tenant\.id\}`/.test(listed)) measured.add("tenant/overview");
  for (const [, slug] of listed.matchAll(/"\/instance\/([\w-]+)"/g))
    measured.add(`instance/${slug}`);
  if (/\["tenants", "\/"\]/.test(listed)) measured.add("instance/");
  const block = spec.slice(spec.indexOf("export const NOT_MEASURED"));
  const skipped = new Set(
    [...block.slice(0, block.indexOf("];")).matchAll(/"([\w/-]+)"/g)].map(([, key]) => key ?? ""),
  );
  expect(start).toBeGreaterThan(0);
  expect(sections.filter((key) => !measured.has(key) && !skipped.has(key))).toEqual([]);
  // A section measured now comes off the list, and the list names only real sections.
  expect([...skipped].filter((key) => measured.has(key) || !sections.includes(key))).toEqual([]);
});

/**
 * A list is a screen of its own (`ListScreen` draws a page header with an `h1`), so one
 * drawn inside another screen is `as="section"`, or the page has two `h1`s (R-01,
 * phase 22 M7). A component that renders a `ListScreen` and is drawn by a screen that has
 * its own `PageHeader` carries that choice: it passes `as` on, and the one who draws it says
 * which. `list-allowed:` on the line before says why a list stands alone on a page that
 * has a header.
 */
test("a list drawn inside another screen is a section, not a second page", () => {
  const found: string[] = [];
  const all = [...files(join(here, "screens")), ...files(join(here, "kit"))];
  const tagAt = (lines: string[], index: number, name: string) => {
    // The opening tag, up to where its props are done: a list's `path`, or the line that closes it.
    let end = index;
    const done =
      name === "ListScreen"
        ? (line: string) => /^\s*(path|columns)=/.test(line)
        : (line: string) => /\/?>\s*$/.test(line) && !/=>\s*$/.test(line);
    while (
      end < lines.length - 1 &&
      !done(lines[end + (name === "ListScreen" ? 1 : 0)] as string)
    ) {
      end++;
    }
    return lines.slice(index, end + 1).join("\n");
  };
  // Components that draw a list, and whether they let their caller say `as`.
  const lists = new Map<string, "page" | "passes">();
  for (const path of all) {
    const lines = readFileSync(path, "utf8").split("\n");
    let owner = "";
    lines.forEach((line, index) => {
      owner = /^(?:export )?function ([A-Z]\w*)\b/.exec(line)?.[1] ?? owner;
      if (!/<ListScreen\b/.test(line) || owner === "") return;
      const tag = tagAt(lines, index, "ListScreen");
      const as = /\bas=(\{[^}]*\}|"\w+")/.exec(tag)?.[1];
      if (as === undefined) lists.set(owner, "page");
      else if (as.startsWith("{") && !lists.has(owner)) lists.set(owner, "passes");
    });
  }
  for (const path of all) {
    const text = readFileSync(path, "utf8");
    if (!/<PageHeader\b/.test(text)) continue;
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (/list-allowed:/.test(`${lines[index - 1]}${lines[index - 2]}`)) return;
      const used = /<(ListScreen|[A-Z]\w*)\b/g;
      for (const [, name] of line.matchAll(used)) {
        if (name !== "ListScreen" && !lists.has(name as string)) continue;
        if (/^\s*(export )?function /.test(line)) continue;
        const tag = tagAt(lines, index, name as string);
        if (!/\bas="section"/.test(tag)) {
          found.push(`${where(path)}:${index + 1} draws <${name}> as a page inside a screen`);
        }
      }
    });
  }
  expect(found).toEqual([]);
});

/**
 * A key typed into a field is the field's only when it is one the field uses. A handler
 * that stops every key from going further (an unconditional `stopPropagation()` as its
 * first statement) takes F1 and ⌘K away as well (A3-08, phase 22 M7). It stops the keys
 * it handles, under an `if`, or says why with `keys-allowed:` on the line before.
 */
test("no key handler on a field stops every key", () => {
  const found: string[] = [];
  for (const path of new Set(drawn())) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/keys-allowed:/.test(`${lines[index - 1]}${lines[index - 2]}`)) return;
      // A handler's opening: `const keys = (event…) => {`, `onKeyDown={(event) => {`,
      // `function onKeys(event…) {`; its first statement is on the next line.
      const opens =
        /\b(onKeyDown|onKeyDownCapture|onKeyUp)=\{\s*\(?\w*\)?\s*(:[^=]*)?=>\s*\{\s*$/.test(line) ||
        /\b(const|function)\s+\w*[kK]ey\w*\b.*(=>\s*)?\{\s*$/.test(line);
      if (/\bonKey(Down|Up)=\{\s*\(\w*\)\s*=>\s*\w+\.stopPropagation\(\)\s*\}/.test(line)) {
        found.push(`${where(path)}:${index + 1} stops every key`);
      }
      if (!opens) return;
      let next = index + 1;
      while (/^\s*(\/\/.*)?$/.test(lines[next] ?? "")) next++;
      if (/^\s*\w+\.stopPropagation\(\);?\s*$/.test(lines[next] ?? "")) {
        found.push(`${where(path)}:${next + 1} stops every key`);
      }
    });
  }
  expect(found).toEqual([]);
});

/**
 * A widget's view is written against the contract and nothing else (decision 0005): a
 * pack's views import `react`, `@volvel/widgets`, `@volvel/ui` (and their subpaths) and
 * their own relative files. A view that reaches for the console, the renderer, the
 * manifest or a library of its own would work in one host and not in another, and could
 * not be shipped as a pack. Tests may import what they test with.
 */
test("a pack's views import only react, the widget contract, the kit and their own files", () => {
  // A pack is its package: its views may import its own definitions in `src/`.
  const roots = ["packages/widgets-core", "packages/widgets-labs"].map((path) =>
    resolve(here, "../../..", path),
  );
  const allowed = /^(react|react\/jsx-runtime|@volvel\/widgets|@volvel\/ui)(\/.*)?$/;
  const found: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === "node_modules" || entry.name === "dist") return [];
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
      });
    for (const path of walk(root)) {
      const text = readFileSync(path, "utf8");
      for (const [, from] of text.matchAll(
        /(?:\bfrom\s+|\bimport\s+|\bimport\(\s*|\brequire\(\s*)["']([^"']+)["']/g,
      )) {
        const name = from as string;
        const own = name.startsWith(".")
          ? resolve(join(path, ".."), name).startsWith(root + sep) ||
            resolve(join(path, ".."), name) === root
          : false;
        if (!own && !allowed.test(name)) found.push(`${where(path)} imports "${name}"`);
      }
    }
  }
  expect(found).toEqual([]);
});

/**
 * A served app runs under a content security policy with no `eval`. The manifest's main
 * entry compiles validators, which `eval` code, so what draws pages takes only types from it,
 * and the action model's values from `@volvel/manifest/action`, which compiles nothing.
 * (Phase 26: a served page went blank when the renderer took `conditionsHold` from the main entry.)
 */
test("what draws a served page takes only types from the manifest's main entry", () => {
  const roots = [
    "packages/screens/src",
    "packages/screens/runtime",
    "packages/widgets-core",
    "packages/widgets-labs",
  ].map((path) => resolve(here, "../../..", path));
  const found: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === "node_modules" || entry.name === "dist") return [];
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
      });
    for (const path of walk(root)) {
      const text = readFileSync(path, "utf8");
      for (const [statement] of text.matchAll(
        /import\s+(?!type\b)[^;]*?from\s+["']@volvel\/manifest["']/g,
      )) {
        // `import { type A, type B } from` is types only too.
        const names = statement.match(/\{([^}]*)\}/)?.[1] ?? "x";
        const values = names
          .split(",")
          .map((one) => one.trim())
          .filter((one) => one !== "" && !one.startsWith("type "));
        if (values.length > 0) found.push(`${where(path)} imports ${values.join(", ")}`);
      }
    }
  }
  expect(found).toEqual([]);
});

/**
 * Every string a person reads is in American spelling (phase 29, VOC-20..33): canceled,
 * color, gray. Stored values and code names (`cancelled` in the database and API fields,
 * `isColour`) stay, so a string with no space in it is a value, not prose, and is left alone.
 * A line that must keep a British spelling says why with `british-ok:` on it or the line before.
 * The documentation's own content (`packages/docs/content`) is not read here.
 */
test("no string a person reads is in British spelling", () => {
  const root = resolve(here, "../../..");
  const dirs = [
    "apps/console/src",
    "apps/control-plane/src",
    "packages/screens/src",
    "packages/ui/src",
    "packages/widgets-core",
    "packages/widgets-labs",
    "packages/widget-sdk/src",
    "packages/cli/src",
    "packages/app/src",
    "packages/sdk/src",
    "packages/worker/src",
    "packages/manifest/src",
    "examples/fernhill",
  ];
  const british =
    /\b(cancell(?:ed|ing|ation)|colour\w*|greys?|greyed|greying|centred|centre|behaviours?|organis\w+|customis\w+|initialis\w+|synchronis\w+|licence|catalogue|analys(?:e|ed|es|ing)|normalis\w+|recognis\w+|authoris\w+|summaris\w+|visualis\w+|optimis\w+|artefacts?|neighbours?|labelled|labelling|honour\w*|whilst|amongst)\b/i;
  const found: string[] = [];
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (["node_modules", "dist", "content", ".next", "build"].includes(entry.name)) return [];
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return /\.(tsx?|mjs)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });
  for (const dir of dirs) {
    const full = join(root, dir);
    if (!existsSync(full)) continue;
    for (const path of walk(full)) {
      const lines = readFileSync(path, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (/british-ok:/.test(line) || /british-ok:/.test(lines[index - 1] ?? "")) return;
        // Each quoted string, and what is inside a template's `${...}`, which is read on its own.
        const strings: string[] = [];
        const read = (code: string) => {
          for (const one of code.matchAll(
            /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g,
          )) {
            const text = one[1] ?? one[2] ?? one[3] ?? "";
            for (const inner of text.matchAll(/\$\{([^}]*)\}/g)) read(inner[1] ?? "");
            strings.push(text.replace(/\$\{[^}]*\}/g, " ").replace(/`[^`]*`/g, " "));
          }
        };
        read(line);
        // JSX text between tags.
        for (const one of line.matchAll(/>([^<>{}]+)</g)) strings.push(one[1] ?? "");
        for (const text of strings) {
          // A word alone is a stored value (`cancelled`) unless it is a label, which starts in capitals.
          if (!/\s/.test(text.trim()) && !/^[A-Z]/.test(text.trim())) continue;
          // A word inside a code name or attribute (aria-labelledby) is not prose.
          const hit = text.match(british);
          if (hit && !/^(?:aria-|[a-z]+[A-Z])/.test(text.trim())) {
            found.push(`${path.slice(root.length + 1)}:${index + 1} says "${hit[0]}"`);
          }
        }
      });

 * The word is "flow", never "workflow", in anything a person sees (vocabulary, VOC-01..16).
 * Code names and stored values stay: the lucide `Workflow` icon is not text, and a search
 * alias that lets an old habit find a card says so with `search-alias:` on its line.
 */
test("no string of the console, screens, widgets or ui says workflow", () => {
  const root = join(here, "..", "..", "..");
  const all = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory())
        return entry.name === "node_modules" || entry.name === "dist" ? [] : all(path);
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    });
  const found: string[] = [];
  for (const dir of [
    join(here),
    join(root, "packages", "screens", "src"),
    join(root, "packages", "widgets-core", "src"),
    join(root, "packages", "ui", "src"),
  ]) {
    for (const path of all(dir)) {
      if (path.endsWith("enforce.test.ts")) continue;
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (line.includes("search-alias:")) return;
          const text = line.replace(
            /<Workflow\b|\bicon: Workflow\b|\bWorkflow(?=[,}\s]*(,|\}|$|\s+from))|\bflow: Workflow\b|\? Workflow\b/g,
            "",
          );
          if (/workflow/i.test(text))
            found.push(`${path.slice(root.length + 1)}:${index + 1} says workflow`);
        });
    }
  }
  expect(found).toEqual([]);
});
