import { plain, renderText, walk } from "@volvel/markup";
import MiniSearch from "minisearch";
import { type DocSet, pagesInOrder, urlOf } from "./set.js";

/** One page as search knows it. */
interface Indexed {
  id: string;
  url: string;
  title: string;
  description: string;
  headings: string;
  text: string;
}

export interface SearchHit {
  path: string;
  url: string;
  title: string;
  description: string;
  /** A few words of the page around what was asked for. */
  excerpt: string;
}

const OPTIONS = {
  fields: ["title", "description", "headings", "text"],
  storeFields: ["url", "title", "description", "text"],
  searchOptions: {
    boost: { title: 4, headings: 2, description: 2 },
    prefix: true,
    fuzzy: 0.15,
    combineWith: "AND" as const,
  },
};

/**
 * Builds a set's search index, as text to store or send. The index holds the
 * words of every page of the set, so it is given only to someone who may open
 * the whole set.
 */
export function buildSearchIndex(set: DocSet, options: { productName?: string } = {}): string {
  const index = new MiniSearch<Indexed>(OPTIONS);
  const order = pagesInOrder(set.nav).map((page) => page.path);
  const rest = [...set.pages.keys()].filter((path) => !order.includes(path)).sort();
  for (const path of [...order, ...rest]) {
    const entry = set.pages.get(path);
    if (!entry) continue;
    const headings: string[] = [];
    for (const { node } of walk(entry.tree))
      if (node.type === "heading") headings.push(plain(node));
    index.add({
      id: path,
      url: urlOf(path),
      title: entry.frontmatter.title,
      description: entry.frontmatter.description ?? "",
      headings: headings.join("\n"),
      text: renderText(entry.tree, options.productName ? { productName: options.productName } : {}),
    });
  }
  return JSON.stringify(index);
}

function excerpt(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, " ");
  const lower = flat.toLowerCase();
  let at = -1;
  for (const term of terms) {
    at = lower.indexOf(term.toLowerCase());
    if (at !== -1) break;
  }
  if (at === -1) return flat.slice(0, 160).trim();
  const start = Math.max(0, flat.lastIndexOf(" ", Math.max(0, at - 60)));
  const piece = flat.slice(start, start + 160).trim();
  return `${start > 0 ? "… " : ""}${piece}${start + 160 < flat.length ? " …" : ""}`;
}

/** Reads an index back, to ask it questions. */
export function loadSearchIndex(json: string): {
  search(query: string, limit?: number): SearchHit[];
} {
  const index = MiniSearch.loadJSON<Indexed>(json, OPTIONS);
  return {
    search(query, limit = 20) {
      if (query.trim() === "") return [];
      return index
        .search(query)
        .slice(0, limit)
        .map((hit) => ({
          path: String(hit.id),
          url: hit.url as string,
          title: hit.title as string,
          description: hit.description as string,
          excerpt: excerpt(hit.text as string, hit.terms),
        }));
    },
  };
}
