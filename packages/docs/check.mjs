// Fails when the documentation and the console have come apart. Run by `pnpm docs:check`.
//
//   - a page that does not read, validate or link (the same checks as the build);
//   - a topic the console asks for that no page has;
//   - a page that names a screenshot the list in screenshots.mjs does not have;
//   - a word the style guide avoids, or a British spelling, in prose of the product's own pages;
//   - a page with no fact-check record, or a tutorial or how-to with no run log (unchecked.json
//     lists the pages that had none when this began, and only gets shorter);
//   - a page that its folder's `pages:` does not list, or a folder its parent's does not.
//
// That every section and editor of the console names a topic at all is held by
// its types. That React and HTML draw the same thing is held by markup's tests.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { walk } from "@volvel/markup";
import { topicsAsked } from "./asked.mjs";
import { GENERATED, stale, write } from "./generate.mjs";
import { coverage } from "./generators/reference.mjs";
import { HERE, loadDocs, report } from "./load.mjs";
import { nameLines, nameProblems, pathProblems, readLock, writeLock } from "./locks.mjs";
import { recordProblems } from "./records.mjs";
import { shotNames } from "./screenshots.mjs";
import { wordProblems } from "./words.mjs";

const REPO = join(HERE, "../..");
const CONSOLE = join(REPO, "apps/console/src");

function sources(folder) {
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Every topic the console asks for, and where (see asked.mjs), with the arguments that cannot be read. */
function asked() {
  const found = new Map();
  const unreadable = [];
  for (const file of sources(CONSOLE)) {
    const where = (line) => `${relative(REPO, file)}:${line}`;
    const { topics, problems } = topicsAsked(readFileSync(file, "utf8"));
    for (const { topic, line } of topics) if (!found.has(topic)) found.set(topic, where(line));
    for (const { line, problem } of problems) unreadable.push(`${where(line)}  ${problem}`);
  }
  return { found, unreadable };
}

const problems = [];

// The pages of reference are what the code says now. A checkout that has never
// been built has none yet, and is given them: only a copy that is there can be old.
// `pnpm docs:check` asks this first (`--staleness`), before the API's generator rewrites
// every page: asked after it, nothing could ever be old.
if (process.argv.includes("--staleness")) {
  const old = existsSync(GENERATED) ? await stale() : [];
  for (const one of old) console.error(`${one} Run pnpm docs:generate.`);
  if (old.length > 0) {
    console.error(
      `\ndocs:check found ${old.length} generated page${old.length === 1 ? "" : "s"} out of date.`,
    );
    process.exit(1);
  }
  process.exit(0);
}
if (!existsSync(GENERATED)) await write();
for (const one of await stale()) {
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

const { set, issues: found, redirects, written, sources: pageSources } = loadDocs();
// A warning about a page's type or subjects that is known and not yet mended is listed in
// lint-allow.json as "<path>:<code>". The list only gets shorter: an entry that no longer fires
// is a problem, so that it is taken out.
const allowed = new Set(JSON.parse(readFileSync(join(HERE, "lint-allow.json"), "utf8")).allow);
const fired = new Set(found.map((one) => `${one.path}:${one.code}`));
const issues = found.filter((one) => !allowed.has(`${one.path}:${one.code}`));
for (const one of allowed) {
  if (!fired.has(one)) problems.push(`lint-allow.json  "${one}" no longer fires. Take it out.`);
}
report(issues);

// What was released stays reachable and keeps its names (see locks.mjs).
const PATHS = join(HERE, "paths.lock");
const NAMES = join(HERE, "names.lock");
const PREFIX = "volvel-";
const names = nameLines(Object.keys(set.topics), Object.keys(set.terms));
if (process.argv.includes("--lock")) {
  // A release adds what is new. After the first one, a name that does not start volvel-
  // is never added: the check has refused it already.
  const first = readLock(NAMES).length === 0;
  const fresh = names.filter((line) => first || line.split(" ")[1].startsWith(PREFIX));
  writeLock(
    PATHS,
    ["Every path of the product's documentation that a release has had. See locks.mjs."],
    [...readLock(PATHS), ...set.pages.keys()],
  );
  writeLock(
    NAMES,
    ["Every topic and term of the product's help that a release has had. See locks.mjs."],
    [...readLock(NAMES), ...fresh],
  );
  console.log(
    `Locked ${set.pages.size} paths. Names are locked as they were, with the new volvel- ones.`,
  );
  process.exit(0);
}
problems.push(...pathProblems({ released: readLock(PATHS), pages: set.pages, redirects }));
problems.push(
  ...nameProblems({
    locked: readLock(NAMES),
    topics: Object.keys(set.topics),
    terms: Object.keys(set.terms),
    prefix: PREFIX,
  }),
);

const { found: topics, unreadable } = asked();
problems.push(...unreadable);
for (const [topic, where] of topics) {
  const path = set.topics[topic] ?? (set.pages.has(topic) ? topic : undefined);
  if (path === undefined) {
    problems.push(
      `${where}  asks for the help "${topic}", and no page has that topic. Add topic: ${topic} to a page under packages/docs/content.`,
    );
  }
}

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
}
// Every page written by hand is listed in its folder's `pages:`, and every folder with one in its
// parent's, so that the order a reader sees is written down and a page cannot be left out of it by
// being forgotten. A generated page is placed by the generator and comes after, by title.
const folders = new Set();
for (const path of written) {
  const parts = path.split("/");
  for (let n = 1; n < parts.length; n++) folders.add(parts.slice(0, n).join("/"));
}
const listed = (folder) => {
  const index = set.pages.get(folder === "" ? "index" : `${folder}/index`);
  return index === undefined ? undefined : (index.frontmatter.pages ?? []);
};
const leftOut = (folder, name, what) => {
  const where = folder === "" ? "index.md" : `${folder}/index.md`;
  const list = listed(folder);
  if (list === undefined) {
    problems.push(
      `${folder}/  has no index.md, so ${what} "${name}" is in no folder's pages:. Add ${where} that lists it.`,
    );
  } else if (!list.includes(name)) {
    problems.push(
      `${where}  does not list ${what} "${name}" in pages:. Add it, in the order a reader should meet it.`,
    );
  }
};
for (const path of [...written].sort()) {
  if (path === "index" || path.endsWith("/index")) continue;
  const at = path.lastIndexOf("/");
  leftOut(at === -1 ? "" : path.slice(0, at), path.slice(at + 1), "the page");
}
for (const folder of [...folders].sort()) {
  const at = folder.lastIndexOf("/");
  leftOut(at === -1 ? "" : folder.slice(0, at), folder.slice(at + 1), "the folder");
}

// The words the style guide avoids, in the product's own pages (never a tenant's site). Pages that
// have them today are in unchecked.json under "words", which only gets shorter.
const ratchet = JSON.parse(readFileSync(join(HERE, "unchecked.json"), "utf8"));
const dirty = new Set();
for (const path of [...written].sort()) {
  const found = wordProblems(pageSources.get(path) ?? "");
  if (found.length > 0) dirty.add(path);
  if ((ratchet.words ?? []).includes(path)) continue;
  for (const { line, word, say } of found) {
    problems.push(`${path}.md:${line}  says "${word}". Write ${say}.`);
  }
}
for (const path of ratchet.words ?? []) {
  if (!dirty.has(path)) {
    problems.push(
      `unchecked.json  "${path}" has none of the avoided words now. Take it out of "words".`,
    );
  }
}
// A fact-check record for every page, and a run log for a tutorial or how-to.
const RECORDS = join(REPO, "docs/documentation");
problems.push(
  ...recordProblems({
    written,
    types: set.types,
    has: (path) => existsSync(join(RECORDS, path)),
    unchecked: ratchet.pages,
  }),
);

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
