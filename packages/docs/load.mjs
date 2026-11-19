// Reads the product's pages into a set. The build and the check both start here.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocSet, pagePath, readPage } from "@volvel/docs-engine";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const VERSION = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).version;

/** Where pages come from, and the folder under the docs root each is read into. */
const ROOTS = [
  { folder: join(HERE, "content"), under: "" },
  // Written by the generators, never by hand: `pnpm docs:generate`.
  { folder: join(HERE, "generated"), under: "reference" },
];

function filesUnder(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .sort()
    .flatMap((name) => {
      const full = join(folder, name);
      return statSync(full).isDirectory() ? filesUnder(full) : [full];
    });
}

/** Every page, read, with what is wrong with any of them. */
export function loadDocs() {
  const issues = [];
  const entries = [];
  const assets = new Set();
  for (const { folder, under } of ROOTS) {
    for (const file of filesUnder(folder)) {
      const name = join(under, relative(folder, file)).split("\\").join("/");
      // The API's description is kept beside its page for the website. Every instance
      // serves its own, so the console carries no copy.
      if (name.endsWith("openapi.json")) continue;
      if (!name.endsWith(".md")) {
        assets.add(name);
        continue;
      }
      const named = pagePath(name);
      if ("problem" in named) {
        issues.push({
          path: name,
          line: 1,
          column: 1,
          code: "path_invalid",
          message: named.problem,
          severity: "error",
        });
        continue;
      }
      const read = readPage(named.path, readFileSync(file, "utf8"), { profile: "product" });
      entries.push(read.entry);
      issues.push(...read.issues);
    }
  }
  const built = buildDocSet(entries, { asset: (path) => assets.has(path) });
  issues.push(...built.issues);
  return { set: built.set, issues, assets };
}

export function report(issues) {
  for (const issue of issues) {
    console.error(`${issue.path}.md:${issue.line}:${issue.column}  ${issue.message}`);
  }
}
