import MiniSearch from "minisearch";

/**
 * A page as search knows it, and each part of it under a heading. A page is
 * found by its title, its description and all its words. A part is found by
 * its heading and its words, so that a search can lead to the very section.
 */
export interface Indexed {
  id: string;
  kind: "page" | "section";
  /** The page's path. */
  path: string;
  url: string;
  title: string;
  description: string;
  /** The page's top-level folder: what search can be narrowed to. Empty for a page in none. */
  collection: string;
  /** The page's type, stored and never searched. Empty for a page with none. */
  docType: string;
  headings: string;
  /** For a section: its heading, and what a link to it ends in. */
  heading: string;
  anchor: string;
  /** What is searched: a page's words before its first heading, a section's words. Not stored. */
  text: string;
  /**
   * What is kept to draw a result from: the first words of `text`, clipped.
   * An index built before this one kept `text` and `intro` whole.
   */
  passage: string;
}

/** Whether a page is reference, which a search shows after pages that explain, unless it is asked for by name. */
export function isReference(path: string, type: unknown): boolean {
  return type === "reference" || path.split("/").slice(0, -1).includes("reference");
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
  /** The page's type, when it has one. */
  docType?: string;
  /** How well it matched, of the index that found it: to put the answers of several indexes in order. */
  score: number;
  places: PlaceHit[];
}

export const OPTIONS = {
  fields: ["title", "description", "headings", "heading", "text"],
  storeFields: [
    "kind",
    "path",
    "url",
    "title",
    "description",
    "collection",
    "docType",
    "heading",
    "anchor",
    "passage",
  ],
  searchOptions: {
    boost: { title: 4, heading: 3, headings: 2, description: 2 },
    prefix: true,
    fuzzy: 0.15,
    combineWith: "AND" as const,
  },
};

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

/** What an index kept of a hit's words: a passage, or in an older index the whole text. */
function passageOf(hit: Record<string, unknown>): string {
  const own = hit.kind === "section" ? hit.text : hit.intro;
  // An index built before passages were cleaned of list markers may start with one.
  return String(hit.passage ?? own ?? hit.text ?? "").replace(
    /^\s*(?:[-*+\u2022]|\d+[.)]|#{1,6}|>)\s+/,
    "",
  );
}

/** Reads an index back, to ask it questions. */
export function loadSearchIndex(json: string): {
  /** Pages, best first: for a page of results. */
  search(query: string, limit?: number, options?: { type?: string }): SearchHit[];
  /** Pages, best first, each with the places on it: for results as they are typed. */
  grouped(
    query: string,
    options?: { collection?: string; type?: string; limit?: number },
  ): PageHit[];
} {
  const index = MiniSearch.loadJSON<Indexed>(json, OPTIONS);
  const titleOf = (path: string) => String(index.getStoredFields(path)?.title ?? "");
  /**
   * Hits, best first. A page of reference comes after pages that explain, unless
   * what was typed is its title, or a heading on it, in full.
   */
  const found = (query: string, filter?: (hit: Record<string, unknown>) => boolean) => {
    const asked = query.trim().toLowerCase();
    return index
      .search(query, filter ? { filter } : {})
      .map((hit) => {
        const path = hit.path as string;
        const exact =
          titleOf(path).toLowerCase() === asked ||
          String(hit.heading ?? "").toLowerCase() === asked;
        const reference = isReference(path, index.getStoredFields(path)?.docType);
        return { hit, score: reference && !exact ? hit.score * 0.6 : hit.score };
      })
      .sort((a, b) => b.score - a.score)
      .map((one) => one.hit);
  };
  return {
    search(query, limit = 20, options = {}) {
      if (query.trim() === "") return [];
      const pages = new Map<string, SearchHit>();
      // A page is found by its own words or by those of a section of it.
      for (const hit of found(
        query,
        options.type !== undefined ? (hit) => hit.docType === options.type : undefined,
      )) {
        const path = hit.path as string;
        if (pages.has(path) || pages.size >= limit) continue;
        const own = index.getStoredFields(path);
        pages.set(path, {
          path,
          url: hit.url as string,
          title: String(own?.title ?? hit.title ?? ""),
          description: String(own?.description ?? hit.description ?? ""),
          excerpt: excerpt(passageOf(hit), hit.terms),
        });
      }
      return [...pages.values()];
    },
    grouped(query, options = {}) {
      const asked = query.trim();
      if (asked === "") return [];
      const words = asked.split(/\s+/);
      const hits = found(
        asked,
        options.collection !== undefined || options.type !== undefined
          ? (hit) =>
              (options.collection === undefined || hit.collection === options.collection) &&
              (options.type === undefined || hit.docType === options.type)
          : undefined,
      );
      const pages = new Map<string, PageHit>();
      for (const hit of hits) {
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
            score: (hit as unknown as { score: number }).score,
            ...(hit.docType ? { docType: hit.docType as string } : {}),
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
        const text = passageOf(hit);
        const lower = text.toLowerCase();
        // A section found by words beyond its passage still shows how it begins.
        if (hit.kind !== "section" && !terms.some((term) => lower.includes(term.toLowerCase())))
          continue;
        if (text === "") continue;
        page.places.push({ type: "text", url, words: mark(sentence(text, terms), terms) });
      }
      return [...pages.values()];
    },
  };
}
