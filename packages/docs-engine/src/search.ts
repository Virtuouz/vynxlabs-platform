import { type Node, plain, type Root, renderText, TREE_VERSION, walk } from "@volvel/markup";
import MiniSearch from "minisearch";
import { type Indexed, OPTIONS } from "./search-query.js";
import { type DocSet, pagesInOrder, urlOf } from "./set.js";

export type { Marked, PageHit, PlaceHit, SearchHit } from "./search-query.js";
export { loadSearchIndex, mark, RESULT_LIMIT } from "./search-query.js";

/** The most characters of a page's or a section's words an index keeps for a result's snippet. */
export const PASSAGE_LENGTH = 400;

/** A line of words without what marks it as a list item, a heading or a quote. */
export function unmarked(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*+\u2022]|\d+[.)]|#{1,6}|>)\s+/, ""))
    .join("\n");
}

/** Words clipped to a length at the end of a word. */
function clip(text: string): string {
  const flat = unmarked(text).replace(/\s+/g, " ").trim();
  if (flat.length <= PASSAGE_LENGTH) return flat;
  const cut = flat.slice(0, PASSAGE_LENGTH);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), PASSAGE_LENGTH / 2));
}

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
export function buildSearchIndex(
  set: DocSet,
  options: { productName?: string; generated?: ReadonlySet<string> } = {},
): string {
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
      docType: set.types[path] ?? "",
      ...(options.generated ? { generated: options.generated.has(path) ? "1" : "0" } : {}),
    };
    const parts = sections(entry.tree);
    // A page's own words are those before its first heading: the rest is its sections'.
    const intro = text(parts[0]?.nodes ?? []);
    index.add({
      ...base,
      id: path,
      kind: "page",
      headings: headings.join("\n"),
      heading: "",
      anchor: "",
      text: intro,
      passage: clip(intro),
    });
    for (const part of parts.slice(1)) {
      if (!part.heading) continue;
      const words = text(part.nodes);
      index.add({
        ...base,
        id: `${path}#${part.heading.id}`,
        kind: "section",
        headings: "",
        // A section is found by its own words, not by its page's title.
        title: "",
        heading: part.heading.text,
        anchor: part.heading.id,
        text: words,
        passage: clip(words),
      });
    }
  }
  return JSON.stringify(index);
}
