import { type Node, plain, type Root, renderText, TREE_VERSION, walk } from "@volvel/markup";
import MiniSearch from "minisearch";
import { type DocSet, pagesInOrder, urlOf } from "./set.js";

/**
 * A page as search knows it, and each part of it under a heading. A page is
 * found by its title, its description and all its words. A part is found by
 * its heading and its words, so that a search can lead to the very section.
 */
interface Indexed {
  id: string;
  kind: "page" | "section";
  /** The page's path. */
  path: string;
  url: string;
  title: string;
  description: string;
  /** The page's top-level folder: what search can be narrowed to. Empty for a page in none. */
  collection: string;
  headings: string;
  /** For a section: its heading, and what a link to it ends in. */
  heading: string;
  anchor: string;
  text: string;
  /** For a page: its words before its first heading, which no section holds. */
  intro: string;
}

export interface SearchHit {
  path: string;
  url: string;
  title: string;
  description: string;
  /** A few words of the page around what was asked for. */
  excerpt: string;
}

/** Words, with the ones that were asked for marked. */
export type Marked = { text: string; hit?: true }[];

/** One place on a page where what was asked for is. */
export interface PlaceHit {
  /** `heading` when the heading itself matched, `text` when the words under it did. */
  type: "heading" | "text";
  /** Where it is: the page's address, with `#anchor` for a section. */
  url: string;
  words: Marked;
}

/** A page that was found, and the places on it. */
export interface PageHit {
  path: string;
  url: string;
  title: Marked;
  description: string;
  collection: string;
  places: PlaceHit[];
}

const OPTIONS = {
  fields: ["title", "description", "headings", "heading", "text"],
  storeFields: [
    "kind",
    "path",
    "url",
    "title",
    "description",
    "collection",
    "heading",
    "anchor",
    "text",
    "intro",
  ],
  searchOptions: {
    boost: { title: 4, heading: 3, headings: 2, description: 2 },
    prefix: true,
    fuzzy: 0.15,
    combineWith: "AND" as const,
  },
};

/** The parts of a page under each of its headings of the first three levels, with what comes before them. */
function sections(tree: Root): { heading?: { id: string; text: string }; nodes: Node[] }[] {
  const out: { heading?: { id: string; text: string }; nodes: Node[] }[] = [{ nodes: [] }];
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth <= 3) {
      out.push({ heading: { id: node.id, text: plain(node) }, nodes: [] });
    } else (out.at(-1) as { nodes: Node[] }).nodes.push(node);
  }
  return out;
}

/**
 * Builds a set's search index, as text to store or send. The index holds the
 * words of every page of the set, so it is given only to someone who may open
 * the whole set.
 */
export function buildSearchIndex(set: DocSet, options: { productName?: string } = {}): string {
  const index = new MiniSearch<Indexed>(OPTIONS);
  const order = pagesInOrder(set.nav).map((page) => page.path);
  const rest = [...set.pages.keys()].filter((path) => !order.includes(path)).sort();
  const text = (nodes: Node[]) =>
    renderText(
      { type: "root", v: TREE_VERSION, children: nodes },
      options.productName ? { productName: options.productName } : {},
    );
  for (const path of [...order, ...rest]) {
    const entry = set.pages.get(path);
    if (!entry) continue;
    const headings: string[] = [];
    for (const { node } of walk(entry.tree)) {
      if (node.type === "heading") headings.push(plain(node));
    }
    const url = urlOf(path);
    const collection = path.includes("/") ? (path.split("/")[0] as string) : "";
    const base = {
      path,
      url,
      title: entry.frontmatter.title,
      description: entry.frontmatter.description ?? "",
      collection,
    };
    const parts = sections(entry.tree);
    index.add({
      ...base,
      id: path,
      kind: "page",
      headings: headings.join("\n"),
      heading: "",
      anchor: "",
      text: text(entry.tree.children),
      intro: text(parts[0]?.nodes ?? []),
    });
    for (const part of parts.slice(1)) {
      if (!part.heading) continue;
      index.add({
        ...base,
        id: `${path}#${part.heading.id}`,
        kind: "section",
        headings: "",
        // A section is found by its own words, not by its page's title.
        title: "",
        heading: part.heading.text,
        anchor: part.heading.id,
        text: text(part.nodes),
        intro: "",
      });
    }
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

/** The sentence around the first word asked for: what a result shows under its page. */
function sentence(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let at = -1;
  for (const term of terms) {
    at = lower.indexOf(term.toLowerCase());
    if (at !== -1) break;
  }
  if (at === -1) return flat.slice(0, 120);
  const before = flat.slice(0, at);
  const lastStop = before.lastIndexOf(". ");
  const start = lastStop === -1 ? 0 : lastStop + 2;
  const stop = flat.indexOf(". ", at);
  const end = stop === -1 ? flat.length : stop + 1;
  const piece = flat.slice(start, end);
  if (piece.length <= 140) return piece;
  const from = Math.max(0, at - start - 50);
  return `${from > 0 ? "… " : ""}${piece.slice(from, from + 130).trim()} …`;
}

/** Marks every word of a text that begins with a term asked for. */
export function mark(text: string, terms: readonly string[]): Marked {
  const wanted = [...new Set(terms.map((term) => term.toLowerCase()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (wanted.length === 0 || text === "") return [{ text }];
  const escaped = wanted.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const out: Marked = [];
  let last = 0;
  for (const found of text.matchAll(pattern)) {
    const at = found.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: found[0], hit: true });
    last = at + found[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Reads an index back, to ask it questions. */
export function loadSearchIndex(json: string): {
  /** Pages, best first: for a page of results. */
  search(query: string, limit?: number): SearchHit[];
  /** Pages, best first, each with the places on it: for results as they are typed. */
  grouped(query: string, options?: { collection?: string; limit?: number }): PageHit[];
} {
  const index = MiniSearch.loadJSON<Indexed>(json, OPTIONS);
  return {
    search(query, limit = 20) {
      if (query.trim() === "") return [];
      return (
        index
          // An index built before sections were indexed holds pages alone, and says no kind.
          .search(query, { filter: (hit) => hit.kind !== "section" })
          .slice(0, limit)
          .map((hit) => ({
            path: hit.path as string,
            url: hit.url as string,
            title: hit.title as string,
            description: hit.description as string,
            excerpt: excerpt(hit.text as string, hit.terms),
          }))
      );
    },
    grouped(query, options = {}) {
      const asked = query.trim();
      if (asked === "") return [];
      const words = asked.split(/\s+/);
      const found = index.search(asked, {
        ...(options.collection !== undefined
          ? { filter: (hit) => hit.collection === options.collection }
          : {}),
      });
      const pages = new Map<string, PageHit>();
      for (const hit of found) {
        const path = hit.path as string;
        let page = pages.get(path);
        if (!page) {
          if (pages.size >= (options.limit ?? 8)) continue;
          // The page's own title, from whichever of its hits came first.
          const own = hit.kind === "page" ? hit : index.getStoredFields(path);
          const terms = [...words, ...hit.terms];
          page = {
            path,
            url: hit.url as string,
            title: mark(String(own?.title ?? ""), terms),
            description: String(own?.description ?? ""),
            collection: hit.collection as string,
            places: [],
          };
          pages.set(path, page);
        }
        if (page.places.length >= 3) continue;
        const terms = [...words, ...hit.terms];
        const url = hit.kind === "section" ? `${hit.url}#${hit.anchor}` : (hit.url as string);
        const heading = String(hit.heading ?? "");
        const inHeading =
          hit.kind === "section" &&
          terms.some((term) => heading.toLowerCase().includes(term.toLowerCase()));
        if (inHeading) {
          page.places.push({ type: "heading", url, words: mark(heading, terms) });
          continue;
        }
        // A page's own words are those before its first heading: the rest is its sections'.
        const text = String((hit.kind === "page" ? hit.intro : hit.text) ?? "");
        const lower = text.toLowerCase();
        if (!terms.some((term) => lower.includes(term.toLowerCase()))) continue;
        page.places.push({ type: "text", url, words: mark(sentence(text, terms), terms) });
      }
      return [...pages.values()];
    },
  };
}
