import { changelogOf, type DocSet, urlOf } from "@volvel/docs-engine";
import { renderText } from "@volvel/markup";

export interface FeedOptions {
  /** The site's name. */
  title: string;
  /** Where the site is served, starting and ending in a slash. */
  base: string;
  /** `https://example.com`. With it every link is whole; without it they are paths, as the sitemap's are. */
  origin?: string;
  /** What the site is for, in a sentence. */
  description?: string;
}

/** The longest an entry's words in the feed run before they are cut: the feed points at the page for the rest. */
const EXCERPT = 600;

/** Text for an XML element: what XML may not hold is left out, and what it reads as markup is escaped. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to take them out.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
const xml = (text: string) =>
  text
    .replace(CONTROL, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const excerpt = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= EXCERPT ? flat : `${flat.slice(0, EXCERPT).replace(/\s+\S*$/, "")}…`;
};

/**
 * A site's changelog as an RSS 2.0 feed, newest first, or nothing when the site has no entries. An
 * entry's day is its date at midnight UTC; one that nothing dates has no `pubDate`.
 */
export function changelogFeed(
  set: Pick<DocSet, "pages">,
  options: FeedOptions,
): string | undefined {
  const entries = changelogOf(set);
  if (entries.length === 0) return undefined;
  const at = (path: string) => `${options.origin ?? ""}${options.base}${path}`;
  const own = at("changelog.xml");
  const home = at("");
  const dated = entries.flatMap((entry) => (entry.date ? [entry.date] : []));
  const items = entries.map((entry) => {
    const link = at(urlOf(entry.path) === "" ? "" : `${urlOf(entry.path)}/`);
    const words = entry.page.frontmatter.description ?? excerpt(renderText(entry.page.tree));
    return [
      "<item>",
      `<title>${xml(entry.title)}</title>`,
      `<link>${xml(link)}</link>`,
      `<guid isPermaLink="true">${xml(link)}</guid>`,
      ...(entry.date
        ? [`<pubDate>${new Date(`${entry.date}T00:00:00Z`).toUTCString()}</pubDate>`]
        : []),
      ...(words ? [`<description>${xml(excerpt(words))}</description>`] : []),
      "</item>",
    ].join("");
  });
  const newest = dated[0];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${xml(`${options.title}: changelog`)}</title>`,
    `<link>${xml(home)}</link>`,
    `<description>${xml(options.description ?? `What changed in ${options.title}, newest first.`)}</description>`,
    "<language>en</language>",
    `<atom:link href="${xml(own)}" rel="self" type="application/rss+xml"/>`,
    ...(newest
      ? [`<lastBuildDate>${new Date(`${newest}T00:00:00Z`).toUTCString()}</lastBuildDate>`]
      : []),
    ...items,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}
