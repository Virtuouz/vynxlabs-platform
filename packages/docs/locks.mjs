// What the product's documentation keeps once it has said it. Two files beside the pages hold it:
//
//   paths.lock  every path a page has had in a release. Each must still be a page, or be
//               redirected to one (`moved_from` in the page that took its place, or an entry in
//               redirects.json for a page that was deleted). A reader's bookmark, a link in
//               another site and a saved `?help=` all hold such a path.
//   names.lock  every topic and term id the product has had. None may go: a tenant's page that
//               extends a topic is refused at deploy when it is gone. A new one must start with
//               `volvel-`, which a tenant's page may not, so that a tenant's name can never be
//               one the product takes later.
//
// Neither file is written by hand. `node packages/docs/check.mjs --lock` adds what is new,
// when a release is made, and never takes anything away.
import { readFileSync, writeFileSync } from "node:fs";

/** The lines of a lock file: no blank lines, no comments. */
export function readLock(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export function writeLock(file, header, lines) {
  const body = [...new Set(lines)].sort().join("\n");
  writeFileSync(file, `${header.map((line) => `# ${line}`).join("\n")}\n${body}\n`);
}

/** Every released path that is neither a page now nor redirected to one. */
export function pathProblems({ released, pages, redirects }) {
  return released
    .filter((path) => !pages.has(path) && redirects[path] === undefined)
    .sort()
    .map(
      (path) =>
        `paths.lock  "${path}" was released, and is no page now and leads nowhere. Add moved_from: [${path}] to the page that took its place, or an entry to redirects.json.`,
    );
}

/** The names of the lock that are gone, and the names that are new and not the product's. */
export function nameProblems({ locked, topics, terms, prefix }) {
  const problems = [];
  const now = { topic: new Set(topics), term: new Set(terms) };
  const had = new Set(locked);
  for (const line of [...locked].sort()) {
    const [kind, name] = line.split(" ");
    if (!now[kind]?.has(name)) {
      problems.push(
        `names.lock  the ${kind} "${name}" was released, and no page has it now. A tenant's page may extend it, and would be refused: keep it on the page that took its place.`,
      );
    }
  }
  for (const kind of ["topic", "term"]) {
    for (const name of [...now[kind]].sort()) {
      if (had.has(`${kind} ${name}`) || name.startsWith(prefix)) continue;
      problems.push(
        `The ${kind} "${name}" is new, and does not start with ${prefix}. A tenant's page could have taken it first: name it ${prefix}${name}.`,
      );
    }
  }
  return problems;
}

/** The lines names.lock holds for a set's names. */
export const nameLines = (topics, terms) => [
  ...topics.map((name) => `topic ${name}`),
  ...terms.map((name) => `term ${name}`),
];
