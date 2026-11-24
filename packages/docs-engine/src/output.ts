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
    date?: string;
    updated?: string;
    /** For a typed page: its type, and what it is about. */
    docType?: string;
    subjects?: string[];
  }[];
  topics: Record<string, string>;
  terms: Record<string, Term>;
  attachments: Record<string, string[]>;
  extensions: Record<string, string[]>;
  /** For a site with pages that moved: an old path to the page's path now. */
  redirects?: Record<string, string>;
  /**
   * The names of the screenshots that were taken for this version. A page that
   * shows one that is not here shows what the picture would have been of.
   */
  screenshots?: string[];
  /**
   * The file of each of those, by look: `{ "console/table-help": { light: "…png", dark: "…png" } }`,
   * under `assets/screenshots/`. The names carry a hash of the picture, so a file never changes.
   * A build before these were kept has none, and a page then shows its words.
   */
  screenshotFiles?: Record<string, Record<string, string>>;
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
      const { title, description, topic, since, date } = entry.frontmatter;
      return [
        {
          path,
          url: urlOf(path),
          title,
          ...(description ? { description } : {}),
          ...(topic ? { topic } : {}),
          ...(since ? { since } : {}),
          ...(date ? { date } : {}),
          ...(entry.updated ? { updated: entry.updated } : {}),
          ...(set.types[path] ? { docType: set.types[path] } : {}),
          ...(entry.frontmatter.subjects?.length ? { subjects: entry.frontmatter.subjects } : {}),
        },
      ];
    }),
    topics: set.topics,
    terms: set.terms,
    attachments: set.attachments,
    extensions: set.extensions,
    ...(Object.keys(set.redirects).length > 0 ? { redirects: set.redirects } : {}),
  };
}

/**
 * A set as files to ship: `manifest.json`, one `pages/<path>.json` for each
 * page, and `search.json`. A reader of the files loads the manifest, then
 * only the pages that are opened.
 */
export function packageOutput(
  set: DocSet,
  options: { version: string; productName?: string; generated?: ReadonlySet<string> },
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
    buildSearchIndex(set, {
      ...(options.productName ? { productName: options.productName } : {}),
      ...(options.generated ? { generated: options.generated } : {}),
    }),
  );
  return files;
}
