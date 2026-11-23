/**
 * A docs site's pages, drawn. A site is a set of pages (`@volvel/docs-engine`) and a `SiteView`:
 * where it is served, how it looks, and how what a page names is resolved. Each request is
 * answered with HTML that reads and works with scripts turned off: navigation is links and folds,
 * search is a form, tabs are sections one under another. One small script of the platform's own,
 * served as a file, then makes tabs into tabs, search into a dialog that answers as it is typed,
 * and the page's contents follow the reader.
 *
 * Nothing a tenant wrote is ever sent as markup. A page is drawn from its tree by the same
 * renderer the console's preview uses, which escapes every word and attribute.
 */

import {
  asDirectory,
  type Collection,
  DOC_TYPE_LABELS,
  DOC_TYPE_PLURALS,
  DOC_TYPES,
  type DocSet,
  type DocType,
  type Folder,
  folderItems,
  glossaryOf,
  type Marked,
  type PageHit,
  type PageRef,
  pagesInOrder,
  relatedTo,
  resolveAsset,
  resolveLink,
  type SearchHit,
  splitFrontmatter,
  trailOf,
  typeCardsOf,
  urlOf,
} from "@volvel/docs-engine";
import {
  type FieldInfo,
  highlightCode,
  imageKind,
  linkKind,
  type ProfileName,
  plain,
  type Root,
  renderHtml,
  type TermInfo,
  walk,
} from "@volvel/markup";
import { docsAssetHref } from "./assets.js";
import { escapeHtml, iconLinks } from "./html.js";
import { icon } from "./icons.js";

/** The page an address under the app names: `support/refunds`, a folder for its index, or nothing for the home page. */
export function pageAt(set: DocSet, address: string): string | undefined {
  const clean = address.replace(/\/+$/, "");
  return [clean, clean === "" ? "index" : `${clean}/index`].find((path) => set.pages.has(path));
}

/** The Markdown of a page, without what its top says of it, for "Copy as Markdown". */
export function pageMarkdown(
  set: DocSet,
  address: string,
  source: (path: string) => string | undefined,
): string | undefined {
  if (!address.endsWith(".md")) return undefined;
  const path = pageAt(set, address.slice(0, -3));
  if (path === undefined) return undefined;
  const text = source(path);
  if (text === undefined) return undefined;
  const entry = set.pages.get(path);
  const { body } = splitFrontmatter(text);
  return `# ${entry?.frontmatter.title ?? ""}\n\n${body.replace(/^\n+/, "")}`;
}

/** How a site looks: the stylesheet of its theme, and the mark and icons of whoever it belongs to. */
export interface SiteLook {
  themeHref: string;
  logoHref?: string | undefined;
  /** Where the icons are, by size. Without it a page names no icon. */
  iconsHref?: string | undefined;
  /** A script of the host's own, run before the page is drawn: the reader's choice of light or dark. */
  scriptHref?: string | undefined;
}

/**
 * What a site is drawn from: everything the pages need to know of where they are and who is
 * reading, and nothing of how the server finds it. The control plane makes one for each request.
 */
export interface SiteView {
  /** The site's name, shown on every page and in the title. */
  title: string;
  set: DocSet;
  /** The site's own address, ending in a slash. Every link on the page is made from it. */
  base: string;
  /** Where the platform's own files are served: the stylesheet, the script. Ends in a slash. `/_platform/` when left out. */
  platform?: string;
  look: SiteLook;
  /** What may be written on a page. `docs` when left out; the product's own help uses `product`. */
  profile?: ProfileName;
  /** What `:product[]` is drawn as, when the profile allows it. */
  productName?: string;
  /** What a page names, resolved. Each is left out when the site has nothing to give. */
  resolve?: {
    /** Where a picture kept beside the pages is served from, by its path under the site's folder. */
    asset?: (path: string) => string | undefined;
    /** Where a screenshot is served from, by its name. */
    screenshot?: (name: string) => string | null | undefined;
    /** What a field of a resource means. */
    field?: (path: string) => FieldInfo | null | undefined;
    /** What a term means, when the site's own glossary does not say. */
    term?: (props: Record<string, string>, page: string) => TermInfo | null | undefined;
  };
  /** Where search is answered: by the server, as a form, or from an index served as a file. Server when left out. */
  search?: { kind: "server" } | { kind: "static"; index: string };
  /** Whether a page's address ends in a slash, as a static site's does. */
  trailingSlash?: boolean;
  /** The version of what the pages describe, shown at the foot of the navigation. Left out, none is. */
  version?: string;
  /** Said across the top of every page: that this is a preview, and for whom. */
  notice?: string;
  /**
   * Whether readers are asked if a page helped, and whether this reader
   * already said, by the page's path. Left out, they are not asked.
   */
  feedback?: { said: (path: string) => boolean; recording: boolean };
}

const attr = escapeHtml;
const href = (at: SiteView, url: string) => attr(`${at.base}${url}`);
/** A page's address under the site, with the slash a static site ends it with. */
const slashed = (at: SiteView, url: string) =>
  at.trailingSlash && url !== "" && !url.endsWith("/") ? `${url}/` : url;
const pageHref = (at: SiteView, url: string) => href(at, slashed(at, url));

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function initials(title: string): string {
  const words = title.split(/\s+/).filter((word) => /\p{L}|\p{N}/u.test(word));
  const letters =
    words.length > 1
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "D";
}

function brand(at: SiteView): string {
  const { look, title } = at;
  const mark = look.logoHref
    ? `<img src="${attr(look.logoHref)}" alt="">`
    : `<span class="tile" aria-hidden="true">${escapeHtml(initials(title))}</span>`;
  return `<a class="brand" href="${attr(at.base)}">${mark}<span>${escapeHtml(title)}</span></a>`;
}

/** The collections a reader can go to: those with something in them. */
function collectionsOf(set: DocSet): Collection[] {
  return set.nav.collections.filter((one) => one.index || one.items.length > 0);
}

/** A collection's first page: its own, or the first in it. */
function firstOf(folder: Folder): PageRef | undefined {
  return pagesInOrder({ collections: [folder] })[0];
}

function collectionOf(set: DocSet, path: string): Collection | undefined {
  return trailOf(set.nav, path)[0];
}

function contains(folder: Folder, path: string): boolean {
  if (folder.index?.path === path) return true;
  return folder.items.some((item) =>
    item.type === "page" ? item.path === path : contains(item, path),
  );
}

function treeOf(
  at: SiteView,
  items: readonly (PageRef | Folder)[],
  current: string | undefined,
): string {
  const link = (page: PageRef, title = page.title) =>
    `<a href="${pageHref(at, page.url)}"${page.path === current ? ' aria-current="page"' : ""}>${escapeHtml(title)}</a>`;
  return `<ul class="tree">${items
    .map((item) => {
      if (item.type === "page") return `<li>${link(item)}</li>`;
      const here = current !== undefined && contains(item, current);
      const head = item.index
        ? link(item.index, item.title)
        : `<span class="label">${escapeHtml(item.title)}</span>`;
      return `<li${here ? ' class="open-folder"' : ""}><details${here ? " open" : ""}><summary>${head}<span class="chevron">${icon("chevron-right", 14)}</span></summary>${treeOf(at, item.items, current)}</details></li>`;
    })
    .join("")}</ul>`;
}

function badge(folder: Folder, size = 16): string {
  return icon(folder.icon, size) || icon("book-open", size);
}

function side(
  at: SiteView,
  collection: Collection | undefined,
  current: string | undefined,
): string {
  const collections = collectionsOf(at.set);
  let switcher = "";
  if (collection && collections.length > 1) {
    switcher = `<details class="switcher"><summary><span class="badge">${badge(collection)}</span><span class="words"><b>${escapeHtml(collection.title)}</b>${
      collection.description ? `<small>${escapeHtml(collection.description)}</small>` : ""
    }</span>${icon("chevrons-up-down", 16)}</summary><ul>${collections
      .map((one) => {
        const to = firstOf(one);
        if (!to) return "";
        return `<li><a href="${pageHref(at, to.url)}"${one === collection ? ' aria-current="true"' : ""}><span class="badge">${badge(one)}</span><span class="words"><b>${escapeHtml(one.title)}</b>${
          one.description ? `<small>${escapeHtml(one.description)}</small>` : ""
        }</span></a></li>`;
      })
      .join("")}</ul></details>`;
  }
  let tree: string;
  if (collection) {
    const own = collection.index ? [{ ...collection.index, title: "Overview" }] : [];
    tree = treeOf(at, [...own, ...collection.items], current);
  } else {
    tree = treeOf(
      at,
      at.set.nav.collections.flatMap((one) => (one.id === "" ? one.items : [one])),
      current,
    );
  }
  return `<aside class="side" id="nav" aria-label="Navigation">
<a class="iconbutton close" href="#" data-nav-close aria-label="Close the navigation">${icon("x", 20)}</a>
${brand(at)}
<a class="find" href="${href(at, "_search")}" data-search>${icon("search", 16)}<span class="grow">Search</span><kbd class="key">⌘</kbd><kbd class="key">K</kbd></a>
${switcher}
<nav aria-label="${attr(collection?.title ?? at.title)}">${tree}</nav>${
    at.version ? `\n<p class="version">Version ${escapeHtml(at.version)}</p>` : ""
  }
</aside>`;
}

/** The types a site's pages have, in the order a reader thinks of them. Empty for a site with none. */
function typesOf(set: DocSet): DocType[] {
  const present = new Set(Object.values(set.types));
  return DOC_TYPES.filter((one) => present.has(one));
}

/** What the script reads: never run, only read. */
function data(at: SiteView, extra: Record<string, unknown>): string {
  const types = typesOf(at.set);
  const json = JSON.stringify({
    base: at.base,
    ...(types.length > 0
      ? { types: types.map((id) => ({ id, title: DOC_TYPE_PLURALS[id] })) }
      : {}),
    ...(at.platform ? { platform: at.platform } : {}),
    ...(at.search?.kind === "static" ? { search: at.search } : {}),
    collections: collectionsOf(at.set).map((one) => ({ id: one.id, title: one.title })),
    ...extra,
  }).replace(/</g, "\\u003c");
  return `<script type="application/json" id="docs-data">${json}</script>`;
}

function head(at: SiteView, title: string, noindex: boolean): string {
  const { look, title: site } = at;
  const platform = at.platform ?? "/_platform/";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${noindex || at.notice ? '\n<meta name="robots" content="noindex">' : ""}
<title>${escapeHtml(title === site ? site : `${title} · ${site}`)}</title>
<link rel="stylesheet" href="${attr(look.themeHref)}">${look.scriptHref ? `\n<script src="${attr(look.scriptHref)}"></script>` : ""}
<link rel="stylesheet" href="${attr(docsAssetHref(platform, "css"))}">${iconLinks(look.iconsHref)}
<script src="${attr(docsAssetHref(platform, "js"))}" defer></script>
</head>`;
}

function shell(
  at: SiteView,
  options: {
    title: string;
    current?: string | undefined;
    collection?: Collection | undefined;
    main: string;
    toc?: string;
    /** A page nobody should find by a search engine: results, and what is not there. */
    noindex?: boolean;
    data?: Record<string, unknown>;
  },
): string {
  return `${head(at, options.title, options.noindex ?? false)}
<body>
<a class="skip" href="#content">Skip to the page</a>${
    at.notice ? `\n<p class="preview" role="status">${escapeHtml(at.notice)}</p>` : ""
  }
<div class="layout">
<header class="topbar">
${brand(at)}
<a class="iconbutton" href="${href(at, "_search")}" data-search aria-label="Search">${icon("search", 20)}</a>
<a class="iconbutton" href="#nav" data-nav-open aria-label="Open the navigation">${icon("menu", 20)}</a>
</header>
${side(at, options.collection, options.current)}
<div class="scrim" data-nav-close></div>
<div class="page">
<main id="content"><div class="column">
${options.main}
</div></main>
<aside class="toc" aria-label="On this page">${options.toc ?? ""}</aside>
</div>
</div>
${data(at, { collection: options.collection?.id ?? "", ...(options.data ?? {}) })}
</body>
</html>
`;
}

/** The headings a page's contents list: those the author wrote as `#` and `##`. */
function headingsOf(tree: Root): { id: string; text: string; deep: boolean }[] {
  const out: { id: string; text: string; deep: boolean }[] = [];
  for (const { node } of walk(tree)) {
    if (node.type === "heading" && node.depth <= 2)
      out.push({ id: node.id, text: plain(node), deep: node.depth === 2 });
  }
  return out;
}

function draw(at: SiteView, path: string, tree: Root): string {
  const { set } = at;
  const folder = () =>
    folderItems(set.nav, path).flatMap((item) => {
      const to = item.type === "page" ? item : (item.index ?? firstOf(item));
      if (!to) return [];
      return [
        {
          title: item.title,
          href: `${at.base}${slashed(at, to.url)}`,
          ...(item.description ? { description: item.description } : {}),
          ...(item.type === "folder" ? { folder: true } : {}),
        },
      ];
    });
  // A folder's own page with nothing written in it lists what the folder holds.
  const glossary = (scope: "collection" | "site") =>
    glossaryOf(set, path, scope).map((term) => ({
      id: term.id,
      term: term.term,
      short: term.short,
      ...(term.aliases ? { aliases: term.aliases } : {}),
      href: `${at.base}${slashed(at, urlOf(term.path))}`,
      page: set.pages.get(term.path)?.frontmatter.title ?? term.path,
    }));
  return renderHtml(asDirectory(path, tree), {
    profile: at.profile ?? "docs",
    ...(at.productName ? { productName: at.productName } : {}),
    ...(at.resolve?.field ? { field: at.resolve.field } : {}),
    ...(at.resolve?.screenshot ? { screenshot: at.resolve.screenshot } : {}),
    // Classes only, drawn here: no script and no policy to change.
    highlight: highlightCode,
    // The page's title is its first heading. What the author wrote as `#` comes under it.
    headingShift: 1,
    folder,
    glossary,
    link: (writtenHref) => {
      if (linkKind(writtenHref) !== "relative") return undefined;
      const target = resolveLink(set, path, writtenHref);
      // A link that leads nowhere is its words. Its author was told when the page was deployed.
      if ("missing" in target) return null;
      return `${at.base}${slashed(at, urlOf(target.path))}${target.anchor ? `#${target.anchor}` : ""}`;
    },
    image: (src) => {
      if (imageKind(src) !== "relative") return undefined;
      const file = resolveAsset(path, src);
      return (file === undefined ? undefined : at.resolve?.asset?.(file)) ?? null;
    },
    term: (props) => {
      const term = props.id ? set.terms[props.id] : undefined;
      if (!term) return at.resolve?.term?.(props, path) ?? null;
      return term.path === path
        ? { short: term.short }
        : { short: term.short, href: `${at.base}${slashed(at, urlOf(term.path))}` };
    },
  });
}

function crumbOf(set: DocSet, path: string): string {
  return trailOf(set.nav, path)
    .filter((folder) => folder.id !== "")
    .map((folder) => folder.title)
    .join(" › ");
}

function feedbackOf(at: SiteView, path: string): string {
  if (!at.feedback) return "";
  if (at.feedback.said(path)) {
    return '<p class="feedback" id="feedback" role="status">Thank you for saying.</p>';
  }
  const disabled = at.feedback.recording ? "" : " disabled";
  const note = at.feedback.recording
    ? ""
    : '\n<span class="muted" id="feedback-note">Answers are not kept in a preview.</span>';
  return `<form class="feedback" id="feedback" method="post" action="${href(at, "_feedback")}" data-feedback>
<span>Was this page helpful?</span>
<input type="hidden" name="page" value="${attr(path)}">
<label class="hp" aria-hidden="true">Leave empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
<span class="choices"><button class="button" type="submit" name="helpful" value="yes"${disabled}>${icon("thumbs-up", 14)}<span>Yes</span></button><button class="button" type="submit" name="helpful" value="no"${disabled}>${icon("thumbs-down", 14)}<span>No</span></button></span>${note}
</form>`;
}

/**
 * On a collection's own page, when its pages are of two types or more: a card for each, so that a
 * reader says what they are doing and is taken to the first page that does it.
 */
function typeCards(at: SiteView, path: string): string {
  const cards = typeCardsOf(at.set, path);
  if (cards.length === 0) return "";
  return `<section class="types" aria-labelledby="types"><h2 id="types">What do you want to do?</h2><ul class="cards">${cards
    .map(
      (card) =>
        `<li><section class="card" data-type="${card.type}"><h3><a href="${pageHref(at, card.first.url)}">${escapeHtml(card.title)}</a></h3><p>${escapeHtml(card.summary)}</p><a class="more" href="${pageHref(at, card.first.url)}">${card.count} ${card.count === 1 ? "page" : "pages"} →</a></section></li>`,
    )
    .join("")}</ul></section>`;
}

/** Pages of the other types that are about the same things as this one. */
function relatedBlock(at: SiteView, path: string): string {
  const related = relatedTo(at.set, path);
  const kinds = DOC_TYPES.filter((one) => related[one]?.length);
  if (kinds.length === 0) return "";
  return `<aside class="related" aria-labelledby="related"><h2 id="related">Related</h2>${kinds
    .map(
      (one) =>
        `<section data-type="${one}"><h3>${escapeHtml(DOC_TYPE_PLURALS[one])}</h3><ul>${(
          related[one] ?? []
        )
          .map(
            (page) => `<li><a href="${pageHref(at, page.url)}">${escapeHtml(page.title)}</a></li>`,
          )
          .join("")}</ul></section>`,
    )
    .join("")}</aside>`;
}

/** One page of the app, drawn. The home page is drawn as a home page. */
export function docPage(at: SiteView, path: string): string {
  const { set } = at;
  const entry = set.pages.get(path);
  if (!entry) return notFoundPage(at);
  if (path === "index") return homePage(at);
  const collection = collectionOf(set, path);
  const body = draw(at, path, entry.tree);

  const order = pagesInOrder(set.nav);
  const index = order.findIndex((one) => one.path === path);
  const before = index > 0 ? order[index - 1] : undefined;
  const after = index >= 0 ? order[index + 1] : undefined;
  const pager =
    before || after
      ? `<nav class="pager" aria-label="Pages before and after">${
          before
            ? `<a href="${pageHref(at, before.url)}"><small>${icon("chevron-left", 14)}Previous</small>${escapeHtml(before.title)}</a>`
            : ""
        }${
          after
            ? `<a class="next" href="${pageHref(at, after.url)}"><small>Next${icon("chevron-right", 14)}</small>${escapeHtml(after.title)}</a>`
            : ""
        }</nav>`
      : "";

  const headings = headingsOf(entry.tree);
  const items = headings
    .map(
      (one) =>
        `<li${one.deep ? ' class="deep"' : ""}><a href="#${attr(one.id)}">${escapeHtml(one.text)}</a></li>`,
    )
    .join("");
  const toc =
    headings.length > 0
      ? `<p>${icon("text-align-start", 16)}On this page</p><ul>${items}</ul><a class="top" href="#content">${icon("arrow-up", 14)}Back to top</a>`
      : "";
  const tocbar =
    headings.length > 0
      ? `<details class="tocbar"><summary><span class="ring" aria-hidden="true"></span><span>On this page</span>${icon("chevron-right", 14)}<span class="now">${escapeHtml(headings[0]?.text ?? "")}</span>${icon("chevron-down", 16)}</summary><ul>${items}</ul></details>`
      : "";

  const trail = trailOf(set.nav, path).filter(
    (folder) => folder.id !== "" && folder.index?.path !== path,
  );
  const crumbs =
    trail.length > 0
      ? `<ol class="crumbs" aria-label="Where this page is">${trail
          .map((folder) => {
            const to = folder.index ?? firstOf(folder);
            return `<li>${to ? `<a href="${pageHref(at, to.url)}">${escapeHtml(folder.title)}</a>` : escapeHtml(folder.title)}</li>`;
          })
          .join("")}</ol>`
      : "";
  const { title, description, since } = entry.frontmatter;
  const type = set.types[path];
  const eyebrow = type
    ? `<p class="eyebrow" data-type="${type}">${escapeHtml(DOC_TYPE_LABELS[type])}</p>`
    : "";
  const updated = entry.updated ? new Date(entry.updated) : undefined;
  return shell(at, {
    title,
    current: path,
    collection,
    toc,
    data: { page: { title, url: urlOf(path), crumb: crumbOf(set, path) } },
    main: `${tocbar}<header class="lead">${crumbs}${eyebrow}<h1>${escapeHtml(title)}</h1>${
      description ? `<p>${escapeHtml(description)}</p>` : ""
    }${since ? `<p class="since">New in version ${escapeHtml(since)}</p>` : ""}<div class="actions"><button class="button" type="button" data-copy="${href(at, `${urlOf(path) || "index"}.md`)}" hidden>${icon("copy", 14)}<span>Copy as Markdown</span></button><button class="button" type="button" data-copy="link" hidden>${icon("link", 14)}<span>Copy link</span></button></div></header>
<article class="vd-doc">${body}</article>${typeCards(at, path)}${relatedBlock(at, path)}
<footer class="foot">${feedbackOf(at, path)}${
      updated && !Number.isNaN(updated.getTime())
        ? `<p class="updated">Last updated <time datetime="${attr(updated.toISOString())}">${DATE.format(updated)}</time></p>`
        : ""
    }${pager}</footer>`,
  });
}

/** The app's home: what it is, a way to search, its collections and what changed last. */
export function homePage(at: SiteView): string {
  const { set } = at;
  const home = set.pages.get("index");
  const title = home?.frontmatter.title ?? at.title;
  const description = home?.frontmatter.description;
  const collections = collectionsOf(set);
  const pages = [...set.pages.values()];
  const dated = pages
    .filter((one) => one.updated && one.path !== "index")
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const latest = pages
    .map((one) => one.updated)
    .filter(Boolean)
    .sort()
    .at(-1);
  const own =
    home && home.tree.children.length > 0
      ? `<article class="vd-doc own">${draw(at, "index", home.tree)}</article>`
      : "";

  const cards =
    collections.length > 0
      ? `<h2 id="collections">Collections</h2><ul class="cards">${collections
          .map((one) => {
            const all = pagesInOrder({ collections: [one] });
            const to = all[0];
            const listed = all.filter((page) => page.path !== one.index?.path).slice(0, 3);
            return `<li><section class="card"><span class="badge">${badge(one, 18)}</span><h3>${
              to
                ? `<a href="${pageHref(at, to.url)}">${escapeHtml(one.title)}</a>`
                : escapeHtml(one.title)
            }</h3>${one.description ? `<p>${escapeHtml(one.description)}</p>` : ""}${
              listed.length > 0
                ? `<ul>${listed.map((page) => `<li><a href="${pageHref(at, page.url)}">${escapeHtml(page.title)}</a></li>`).join("")}</ul>`
                : ""
            }${to ? `<a class="more" href="${pageHref(at, to.url)}">${all.length} ${all.length === 1 ? "page" : "pages"} →</a>` : ""}</section></li>`;
          })
          .join("")}</ul>`
      : "";
  const recent =
    dated.length > 0
      ? `<h2 id="recent">Recently updated</h2><ul class="recent">${dated
          .slice(0, 5)
          .map((one) => {
            const when = new Date(one.updated as string);
            return `<li><a href="${pageHref(at, urlOf(one.path))}"><span class="what"><b>${escapeHtml(one.frontmatter.title)}</b>${
              one.frontmatter.description
                ? `<small>${escapeHtml(one.frontmatter.description)}</small>`
                : ""
            }</span><span class="where">${escapeHtml(crumbOf(set, one.path))}</span><time datetime="${attr(when.toISOString())}">${SHORT.format(when)}</time></a></li>`;
          })
          .join("")}</ul>`
      : "";
  const nav = collections
    .map((one) => {
      const to = firstOf(one);
      return to ? `<a href="${pageHref(at, to.url)}">${escapeHtml(one.title)}</a>` : "";
    })
    .join("");
  return `${head(at, title, false)}
<body>
<a class="skip" href="#content">Skip to the page</a>${
    at.notice ? `\n<p class="preview" role="status">${escapeHtml(at.notice)}</p>` : ""
  }
<header class="homebar"><div class="inner">
${brand(at)}
<nav aria-label="Collections">${nav}</nav>
<a class="find" href="${href(at, "_search")}" data-search aria-label="Search">${icon("search", 16)}<span class="grow">Search</span><kbd class="key">⌘K</kbd></a>
</div></header>
<main id="content" class="home">
${latest ? `<p class="pill">Updated ${DATE.format(new Date(latest))}</p>` : ""}
<h1>${escapeHtml(title)}</h1>
${description ? `<p class="intro">${escapeHtml(description)}</p>` : ""}
<form class="search-form" action="${href(at, "_search")}" method="get" role="search">
<label class="find big" data-search>${icon("search", 18)}<input class="grow" type="search" name="q" placeholder="Search ${attr(title)}" aria-label="Search ${attr(title)}"><kbd class="key">⌘K</kbd></label>
</form>
${own}
${cards}
${recent}
</main>
<footer class="sitefoot"><p>${escapeHtml(at.title)}${at.version ? ` · Version ${escapeHtml(at.version)}` : ""}</p></footer>
${data(at, { collection: "" })}
</body>
</html>
`;
}

/** What a search of the app found. A page of its own, so that search needs no script. */
export function searchPage(at: SiteView, query: string, hits: readonly SearchHit[]): string {
  const asked = query.trim();
  const found =
    asked === ""
      ? '<p class="muted">Type what you are looking for.</p>'
      : hits.length === 0
        ? `<p class="muted">Nothing here matches “${escapeHtml(asked)}”.</p>`
        : `<ul class="results">${hits
            .map(
              (hit) =>
                `<li><a href="${pageHref(at, hit.url)}">${escapeHtml(hit.title)}</a><p>${escapeHtml(hit.description || hit.excerpt)}</p></li>`,
            )
            .join("")}</ul>`;
  return shell(at, {
    title: asked === "" ? "Search" : `Search: ${asked}`,
    noindex: true,
    main: `<header class="lead"><h1>Search</h1>${asked === "" ? "" : `<p>${hits.length} ${hits.length === 1 ? "page" : "pages"} for “${escapeHtml(asked)}”</p>`}</header>
<form class="search-form" action="${href(at, "_search")}" method="get" role="search"><input type="search" name="q" aria-label="Search ${attr(at.title)}" placeholder="Search" value="${attr(asked)}"><button type="submit">Search</button></form>
${found}`,
  });
}

/** What the search dialog is answered with: pages, the places on each, and where each page is. */
export function searchAnswer(
  at: Pick<SiteView, "set">,
  hits: readonly PageHit[],
): {
  pages: { url: string; title: Marked; crumb: string; places: PageHit["places"] }[];
} {
  return {
    pages: hits.map((hit) => ({
      url: hit.url,
      title: hit.title,
      crumb: crumbOf(at.set, hit.path),
      places: hit.places,
    })),
  };
}

/** For an address under the app that names no page. It keeps the app's frame, so the way back is there. */
export function notFoundPage(at: SiteView): string {
  return shell(at, {
    title: "Not found",
    noindex: true,
    main: `<header class="lead"><h1>There is no page here</h1><p>It may have been moved or removed.</p></header>
<p><a href="${attr(at.base)}">Go to the first page</a>, or <a href="${href(at, "_search")}" data-search>search</a>.</p>`,
  });
}
