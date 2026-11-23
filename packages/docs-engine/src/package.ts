import { type Root, TREE_VERSION } from "@volvel/markup";
import type { DocType } from "./diataxis.js";
import type { Manifest, PageFile } from "./output.js";
import type { DocEntry } from "./page.js";
import { redirectedPath } from "./redirects.js";
import type { Frontmatter } from "./schema.js";
import { loadSearchIndex } from "./search.js";
import type { DocSet } from "./set.js";

/** How many page trees are held at once. Others are read again from the files when asked for. */
const TREES_KEPT = 64;

/** A package of documentation as `packageOutput` wrote it, opened to be served. */
export interface OpenedPackage {
  /** The pages. Each page's tree is read from its file when it is first used, and not all are kept. */
  set: DocSet;
  manifest: Manifest;
  version: string;
  /** Old path to the path now, from the manifest and from `redirects.json`. */
  redirects: Record<string, string>;
  /** The search index, read on the first search. */
  search(): ReturnType<typeof loadSearchIndex>;
  /** A page's source as written, for "Copy as Markdown". Undefined where the package has none. */
  source(path: string): string | undefined;
  /** The path an old address now has, if the package knows it. */
  moved(address: string): string | undefined;
}

/**
 * Opens the files `packageOutput` wrote, by a function that reads one by its name (`manifest.json`,
 * `pages/<path>.json`, `search.json`, `md/<path>.md`, `redirects.json`). The manifest is read at
 * once, a page's tree when the page is drawn, the search index when somebody searches. A file that
 * is missing is a page with nothing on it, or no search results, never a thrown error.
 */
export function openPackage(read: (name: string) => string | undefined): OpenedPackage {
  const text = read("manifest.json");
  if (text === undefined) throw new Error("The package has no manifest.json.");
  const manifest = JSON.parse(text) as Manifest;

  const trees = new Map<string, Root>();
  const treeOf = (path: string): Root => {
    const kept = trees.get(path);
    if (kept) {
      trees.delete(path);
      trees.set(path, kept);
      return kept;
    }
    let tree: Root = { type: "root", v: TREE_VERSION, children: [] };
    try {
      const file = read(`pages/${path}.json`);
      if (file !== undefined) tree = (JSON.parse(file) as PageFile).tree;
    } catch {
      // A page file that cannot be read is an empty page.
    }
    trees.set(path, tree);
    if (trees.size > TREES_KEPT) trees.delete(trees.keys().next().value as string);
    return tree;
  };

  const pages = new Map<string, DocEntry>();
  const types: Record<string, DocType> = {};
  const subjects: Record<string, string[]> = {};
  for (const page of manifest.pages) {
    const frontmatter: Frontmatter = {
      title: page.title,
      ...(page.description ? { description: page.description } : {}),
      ...(page.topic ? { topic: page.topic } : {}),
      ...(page.since ? { since: page.since } : {}),
      ...(page.subjects ? { subjects: page.subjects } : {}),
    };
    const entry = { path: page.path, frontmatter } as DocEntry;
    Object.defineProperty(entry, "tree", {
      enumerable: true,
      get: () => treeOf(page.path),
    });
    if (page.updated) entry.updated = page.updated;
    pages.set(page.path, entry);
    if (page.docType) types[page.path] = page.docType as DocType;
    for (const subject of page.subjects ?? []) {
      subjects[subject] = [...(subjects[subject] ?? []), page.path];
    }
  }

  const set: DocSet = {
    pages,
    nav: manifest.nav,
    topics: manifest.topics,
    terms: manifest.terms,
    attachments: manifest.attachments,
    extensions: manifest.extensions,
    types,
    subjects,
    redirects: manifest.redirects ?? {},
  };

  let moves: Record<string, string> | undefined;
  const redirects = () => {
    if (moves) return moves;
    moves = { ...(manifest.redirects ?? {}) };
    try {
      const file = read("redirects.json");
      if (file !== undefined) Object.assign(moves, JSON.parse(file));
    } catch {
      // Without the file the manifest's own moves stand.
    }
    return moves;
  };

  let index: ReturnType<typeof loadSearchIndex> | undefined;
  const none = { search: () => [], grouped: () => [] };
  return {
    set,
    manifest,
    version: manifest.version,
    get redirects() {
      return redirects();
    },
    search() {
      if (index) return index;
      try {
        const file = read("search.json");
        index = file === undefined ? none : loadSearchIndex(file);
      } catch {
        index = none;
      }
      return index;
    },
    source: (path) => read(`md/${path}.md`),
    moved(address) {
      const found = redirectedPath(redirects(), address);
      return found !== undefined && pages.has(found) ? found : undefined;
    },
  };
}
