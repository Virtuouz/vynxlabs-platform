import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * A resource that was renamed answers at its old path for 90 days, but only
 * where the path is looked up through `resolveResource`. A query that finds a
 * resource by its exact path skips that, and nothing fails until someone
 * renames something.
 *
 * These are the places that read the `resource` table by exact path today,
 * with how many such queries each has. Each is one of: authoring, which names
 * what is there now; a path taken from the bundle a run is pinned to; or a
 * filter that already allows for former paths. The list may shrink. A new
 * query should go through `resolveResource` when its path comes from outside
 * (an address, a request's body, a tool's name); when it should not, add it
 * here, and say why in a comment beside the query.
 */
const ALLOWED: Record<string, number> = {
  "kernel/apps/front.ts": 1,
  "kernel/authoring.ts": 2,
  "kernel/execution/runs.ts": 1,
  "kernel/execution/triggers.ts": 2,
  // The path of the change being compared: what is there now.
  "kernel/pages/standing.ts": 1,
  "kernel/resolve.ts": 1,
  "kernel/resources.ts": 4,
  "routes/apps.ts": 2,
  // Phase 24 M2: the doc writer's deploy exception looked a table up by path; it is now the shared
  // `fits` check, so one of the two is gone.
  "routes/authoring.ts": 1,
  "routes/data.ts": 1,
  "routes/execution.ts": 2,
  "routes/flows.ts": 3,
  "routes/interfaces.ts": 1,
  "routes/search.ts": 1,
  "routes/worker.ts": 3,
  // A failure alert's connection as declared now; a create refused only where something is at the
  // path now; a delete of the resource at exactly this path.
  "routes/workspaces.ts": 3,
};

const root = fileURLToPath(new URL("../src", import.meta.url));

function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

/** How many queries in a file read the resource table by an exact path. */
function lookups(text: string): number {
  const queries = text.matchAll(
    /selectFrom\("resource(?: as \w+)?"\)[\s\S]*?\.execute(?:TakeFirst(?:OrThrow)?)?\(/g,
  );
  return [...queries].filter((query) => /\.where\("(?:\w+\.)?path", "=",/.test(query[0])).length;
}

test("no new query finds a resource by its exact path without saying why", () => {
  const found: Record<string, number> = {};
  for (const file of sources(root)) {
    const count = lookups(readFileSync(file, "utf8"));
    if (count > 0) found[file.slice(root.length + 1).replaceAll("\\", "/")] = count;
  }
  const more = Object.entries(found)
    .filter(([file, count]) => count > (ALLOWED[file] ?? 0))
    .map(([file, count]) => `${file}: ${count}, where ${ALLOWED[file] ?? 0} are allowed`);
  expect(more, "use resolveResource, or add the query to ALLOWED with its reason").toEqual([]);
  // The list only shrinks: a file that lost a query has its number brought down with it.
  const fewer = Object.entries(ALLOWED)
    .filter(([file, count]) => (found[file] ?? 0) < count)
    .map(([file, count]) => `${file}: ${found[file] ?? 0}, where ALLOWED still says ${count}`);
  expect(fewer, "bring ALLOWED down to what is there").toEqual([]);
});
