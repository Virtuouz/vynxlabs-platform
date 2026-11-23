// Fails when the documentation and the console have come apart. Run by `pnpm docs:check`.
//
//   - a page that does not read, validate or link (the same checks as the build);
//   - a topic the console asks for that no page has;
//   - a page that names a screenshot the list in screenshots.mjs does not have;
//   - a page nothing leads to: no screen opens it and no other page links to it.
//
// That every section and editor of the console names a topic at all is held by
// its types. That React and HTML draw the same thing is held by markup's tests.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveLink } from "@volvel/docs-engine";
import { linkKind, walk } from "@volvel/markup";
import { GENERATED, stale, write } from "./generate.mjs";
import { coverage } from "./generators/reference.mjs";
import { HERE, loadDocs, report } from "./load.mjs";
import { shotNames } from "./screenshots.mjs";

const REPO = join(HERE, "../..");
const CONSOLE = join(REPO, "apps/console/src");

function sources(folder) {
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Every topic the console asks for, and where: `help: "…"`, `useHelpTopic("…")`, `<HelpTopic topic="…">`, `openHelp("…")`. */
function asked() {
  const found = new Map();
  const patterns = [
    /\bhelp:\s*"([a-z0-9][a-z0-9/_-]*)"/g,
    /\buseHelpTopic\(\s*"([a-z0-9][a-z0-9/_-]*)"/g,
    /<HelpTopic\s+topic="([a-z0-9][a-z0-9/_-]*)"/g,
    /\bopenHelp\(\s*"([a-z0-9][a-z0-9/_-]*)(?:#[^"]*)?"/g,
  ];
  for (const file of sources(CONSOLE)) {
    const text = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split("\n").length;
        if (!found.has(match[1])) found.set(match[1], `${relative(REPO, file)}:${line}`);
      }
    }
  }
  return found;
}

const problems = [];

// The pages of reference are what the code says now. A checkout that has never
// been built has none yet, and is given them: only a copy that is there can be old.
// `pnpm docs:check` asks this first (`--staleness`), before the API's generator rewrites
// every page: asked after it, nothing could ever be old.
if (process.argv.includes("--staleness")) {
  const old = existsSync(GENERATED) ? stale() : [];
  for (const one of old) console.error(`${one} Run pnpm docs:generate.`);
  if (old.length > 0) {
    console.error(
      `\ndocs:check found ${old.length} generated page${old.length === 1 ? "" : "s"} out of date.`,
    );
    process.exit(1);
  }
  process.exit(0);
}
if (!existsSync(GENERATED)) write();
for (const one of stale()) {
  problems.push(`${one} Run pnpm docs:generate.`);
}

// What the kinds' schemas say of their own fields never gets less.
const floor = JSON.parse(readFileSync(join(HERE, "coverage.json"), "utf8")).kinds;
const covered = coverage();
if (covered.share + 1e-9 < floor) {
  problems.push(
    `packages/manifest  ${covered.described} of ${covered.fields} fields of the kinds say what they are (${(covered.share * 100).toFixed(1)}%). It was ${(floor * 100).toFixed(1)}%: a field was added, or lost its description. Describe it in its kind's schema.`,
  );
}

const { set, issues } = loadDocs();
report(issues);

const topics = asked();
const opened = new Set();
for (const [topic, where] of topics) {
  const path = set.topics[topic] ?? (set.pages.has(topic) ? topic : undefined);
  if (path === undefined) {
    problems.push(
      `${where}  asks for the help "${topic}", and no page has that topic. Add topic: ${topic} to a page under packages/docs/content.`,
    );
  } else opened.add(path);
}

const linked = new Set();
const shots = new Set(shotNames());
for (const entry of set.pages.values()) {
  for (const { node } of walk(entry.tree)) {
    if (
      node.type === "component" &&
      node.name === "screenshot" &&
      !shots.has(node.props?.name ?? "")
    ) {
      problems.push(
        `${entry.path}.md  shows the screenshot "${node.props?.name ?? ""}", and packages/docs/screenshots.mjs does not list it. Add it there, or name one of: ${[...shots].join(", ")}.`,
      );
    }
  }
  for (const { node } of walk(entry.tree)) {
    if (node.type !== "link" || linkKind(node.href) !== "relative") continue;
    const target = resolveLink(set, entry.path, node.href);
    if (!("missing" in target) && target.path !== entry.path) linked.add(target.path);
  }
}
for (const path of [...set.pages.keys()].sort()) {
  if (path === "index" || path.endsWith("/index")) continue;
  if (opened.has(path) || linked.has(path)) continue;
  problems.push(
    `${path}.md  nothing leads here: no screen of the console opens it, and no other page links to it.`,
  );
}

for (const problem of problems) console.error(problem);
const count = issues.length + problems.length;
if (count > 0) {
  console.error(`\ndocs:check found ${count} problem${count === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log(
  `docs:check: ${set.pages.size} pages, ${topics.size} topics asked for by the console, all found. ${covered.described} of ${covered.fields} fields of the kinds are described (${(covered.share * 100).toFixed(1)}%).`,
);
if (covered.share - floor > 0.005) {
  console.log(
    `More fields are described than packages/docs/coverage.json asks for. Raise it to ${Math.floor(covered.share * 1000) / 1000} to keep them.`,
  );
}
