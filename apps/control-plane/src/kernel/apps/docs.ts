/**
 * A docs app as the control plane serves it: its pages read and indexed once for each deployed
 * bundle, and what a docs page may load. The pages themselves are drawn by `@volvel/docs-site`;
 * who may read them, the feedback, the hosts and the caching stay here.
 */

import {
  type BuiltApp,
  buildApp,
  buildSearchIndex,
  type DocsApp,
  loadSearchIndex,
  type ResourceLike,
} from "@volvel/docs-engine";

export { DOCS_POLICY } from "@volvel/docs-site";

/** A docs app as it is deployed: its set, its search, and what to draw it with. */
export interface Docs {
  built: BuiltApp;
  search: ReturnType<typeof loadSearchIndex>;
}

const kept = new Map<string, Docs>();
const KEEP = 32;

/** Whether a docs app of a bundle is already read and indexed. */
export function docsKept(bundleId: string, app: DocsApp): boolean {
  return kept.has(`${bundleId}:${app.path}`);
}

/**
 * A docs app's pages, read and indexed once for each deployed bundle. A
 * deploy makes a new bundle, so what is kept is never out of date, and the
 * oldest is dropped when there are many. `updated` is when each page, by its
 * path in the workspace, last changed.
 */
export function docsOf(
  bundleId: string,
  app: DocsApp,
  resources: readonly ResourceLike[],
  product: { terms: readonly string[]; topics: readonly string[] } | undefined,
  updated?: ReadonlyMap<string, Date>,
): Docs {
  const key = `${bundleId}:${app.path}`;
  const found = kept.get(key);
  if (found) return found;
  const dated = updated
    ? resources.map((one) =>
        one.kind === "doc" && updated.has(one.path)
          ? { ...one, updated: updated.get(one.path) }
          : one,
      )
    : resources;
  const built = buildApp(app, dated, { product });
  const made = { built, search: loadSearchIndex(buildSearchIndex(built.set)) };
  kept.set(key, made);
  if (kept.size > KEEP) kept.delete(kept.keys().next().value as string);
  return made;
}
