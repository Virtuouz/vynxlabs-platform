import type { Root } from "@volvel/markup";
import { buildSearchIndex } from "./search.js";
import { type DocSet, type Nav, pagesInOrder, type Term, urlOf } from "./set.js";

/** What a built set says about itself: enough to list, link and look up without opening a page. */
export interface Manifest {
  /** The version of what the pages describe. */
  version: string;
  nav: Nav;
  pages: {
    path: string;
    url: string;
    title: string;
    description?: string;
    topic?: string;
    since?: string;
    updated?: string;
  }[];
  topics: Record<string, string>;
  terms: Record<string, Term>;
  attachments: Record<string, string[]>;
  extensions: Record<string, string[]>;
  /**
   * The names of the screenshots that were taken for this version. A page that
   * shows one that is not here shows what the picture would have been of.
   */
  screenshots?: string[];
}

/** What is written for one page: its tree, and what its frontmatter said. */
export interface PageFile {
  path: string;
  title: string;
  description?: string;
  tree: Root;
}

export function manifestOf(set: DocSet, version: string): Manifest {
  const order = pagesInOrder(set.nav).map((page) => page.path);
  const rest = [...set.pages.keys()].filter((path) => !order.includes(path)).sort();
  return {
    version,
    nav: set.nav,
    pages: [...order, ...rest].flatMap((path) => {
      const entry = set.pages.get(path);
      if (!entry) return [];
      const { title, description, topic, since } = entry.frontmatter;
      return [
        {
          path,
          url: urlOf(path),
          title,
          ...(description ? { description } : {}),
          ...(topic ? { topic } : {}),
          ...(since ? { since } : {}),
          ...(entry.updated ? { updated: entry.updated } : {}),
        },
      ];
    }),
    topics: set.topics,
    terms: set.terms,
    attachments: set.attachments,
    extensions: set.extensions,
  };
}

/**
 * A set as files to ship: `manifest.json`, one `pages/<path>.json` for each
 * page, and `search.json`. A reader of the files loads the manifest, then
 * only the pages that are opened.
 */
export function packageOutput(
  set: DocSet,
  options: { version: string; productName?: string },
): Map<string, string> {
  const files = new Map<string, string>();
  files.set("manifest.json", `${JSON.stringify(manifestOf(set, options.version))}\n`);
  for (const [path, entry] of [...set.pages].sort(([a], [b]) => a.localeCompare(b))) {
    const page: PageFile = { path, title: entry.frontmatter.title, tree: entry.tree };
    if (entry.frontmatter.description) page.description = entry.frontmatter.description;
    files.set(`pages/${path}.json`, `${JSON.stringify(page)}\n`);
  }
  files.set(
    "search.json",
    buildSearchIndex(set, options.productName ? { productName: options.productName } : {}),
  );
  return files;
}
