/**
 * A docs app's pages, drawn here. The app is a folder of the workspace's
 * pages of documentation, and each request is answered with HTML that reads
 * and works with scripts turned off: navigation is links, search is a form,
 * tabs are sections one under another. One small script of the platform's
 * own, served as a file, then makes tabs into tabs.
 *
 * Nothing a tenant wrote is ever sent as markup. A page is drawn from its
 * tree by the same renderer the console's preview uses, which escapes every
 * word and attribute.
 */

import {
  type BuiltApp,
  buildApp,
  buildSearchIndex,
  type Collection,
  type DocSet,
  type DocsApp,
  loadSearchIndex,
  type PageRef,
  pagesInOrder,
  type ResourceLike,
  resolveAsset,
  resolveLink,
  type SearchHit,
  urlOf,
} from "@volvel/docs-engine";
import { DOC_CSS, imageKind, linkKind, plain, renderHtml, walk } from "@volvel/markup";
import { escapeHtml, iconLinks, type PageFrame } from "./pages.js";

/** What a docs app's page may load. As an app's, and a picture may also come from an https address its author gave. */
export const DOCS_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // No inline style either: the renderer writes classes, never a style attribute.
  "style-src 'self'",
  "img-src 'self' https: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/** The stylesheet of a docs app: its frame, then the page's own, on the theme's tokens. */
export const DOCS_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--vx-canvas); color: var(--vx-ink); font-family: var(--vx-font);
  font-size: 16px; line-height: 1.5;
}
a { color: var(--vx-action); }
:focus-visible { outline: 2px solid var(--vx-action); outline-offset: 2px; }
.skip { position: absolute; left: -10000px; }
.skip:focus { left: 12px; top: 12px; z-index: 20; padding: 8px 12px; background: var(--vx-surface); border: 1px solid var(--vx-line); border-radius: var(--vx-radius-control); }
.top {
  position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px;
  padding: 10px 20px; background: var(--vx-surface); border-bottom: 1px solid var(--vx-line);
}
.top .name { display: flex; align-items: center; gap: 10px; font-weight: 600; color: var(--vx-ink); text-decoration: none; }
.top .name img { max-height: 28px; max-width: 120px; }
.top form { display: flex; gap: 6px; margin-left: auto; }
.top input[type=search] {
  width: min(16rem, 50vw); padding: 6px 10px; font: inherit; font-size: 14px; color: var(--vx-ink);
  background: var(--vx-canvas); border: 1px solid var(--vx-line); border-radius: var(--vx-radius-control);
}
.top button {
  padding: 6px 12px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; color: var(--vx-ink);
  background: var(--vx-sunken); border: 1px solid var(--vx-line); border-radius: var(--vx-radius-control);
}
.collections { display: flex; flex-wrap: wrap; gap: 4px; width: 100%; margin: 0; padding: 0; list-style: none; font-size: 14px; }
.collections a { display: block; padding: 4px 10px; border-radius: var(--vx-radius-control); color: var(--vx-ink-muted); text-decoration: none; font-weight: 500; }
.collections a[aria-current] { background: var(--vx-action-soft); color: var(--vx-action); }
.frame { display: grid; grid-template-columns: minmax(0, 1fr); max-width: 1180px; margin: 0 auto; }
.side { padding: 16px 20px 0; font-size: 14px; }
.side details > summary { cursor: pointer; font-weight: 600; padding: 6px 0; }
.side ul { margin: 0; padding: 0; list-style: none; }
.side li a { display: block; padding: 5px 10px; border-radius: var(--vx-radius-control); color: var(--vx-ink); text-decoration: none; }
.side li a:hover { background: var(--vx-sunken); }
.side li a[aria-current] { background: var(--vx-action-soft); color: var(--vx-action); font-weight: 600; }
.side .group { margin: 10px 0 2px; padding: 0 10px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--vx-ink-muted); }
.side .group a { padding: 0; color: inherit; }
.side .group + ul { margin-bottom: 6px; }
main { min-width: 0; padding: 24px 20px 64px; }
main > header { margin-bottom: 24px; }
main > header h1 { margin: 0 0 6px; font-size: 30px; line-height: 1.2; }
main > header p { margin: 0; color: var(--vx-ink-muted); font-size: 17px; }
.trail { margin: 0 0 10px; font-size: 13px; color: var(--vx-ink-muted); }
.pager { display: flex; justify-content: space-between; gap: 16px; margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--vx-line); font-size: 14px; }
.pager a { text-decoration: none; font-weight: 600; }
.pager small { display: block; font-weight: 400; color: var(--vx-ink-muted); }
.pager .next { margin-left: auto; text-align: right; }
.results { margin: 0; padding: 0; list-style: none; }
.results li { margin: 0 0 18px; }
.results a { font-weight: 600; font-size: 17px; }
.results p { margin: 2px 0 0; color: var(--vx-ink-muted); }
.onpage { display: none; }
@media (min-width: 820px) {
  .frame { grid-template-columns: 250px minmax(0, 1fr); }
  .side { position: sticky; top: 92px; align-self: start; max-height: calc(100vh - 92px); overflow-y: auto; padding: 24px 12px 24px 20px; }
  .side details > summary { display: none; }
  main { padding: 32px 40px 80px; }
}
@media (min-width: 1180px) {
  .frame { grid-template-columns: 250px minmax(0, 1fr) 200px; }
  .onpage { display: block; position: sticky; top: 92px; align-self: start; padding: 32px 20px 0 0; font-size: 13px; }
  .onpage p { margin: 0 0 6px; font-weight: 600; color: var(--vx-ink-muted); }
  .onpage ul { margin: 0; padding: 0; list-style: none; }
  .onpage a { display: block; padding: 3px 0; color: var(--vx-ink-muted); text-decoration: none; }
  .onpage .deep a { padding-left: 12px; }
}
.vd-doc {
  --vd-ink: var(--vx-ink); --vd-muted: var(--vx-ink-muted); --vd-line: var(--vx-line);
  --vd-surface: var(--vx-surface); --vd-sunken: var(--vx-sunken); --vd-action: var(--vx-action);
  --vd-info: var(--vx-action); --vd-info-soft: var(--vx-action-soft);
  --vd-success: var(--vx-success); --vd-success-soft: var(--vx-success-soft);
  --vd-attention: var(--vx-attention); --vd-attention-soft: var(--vx-attention-soft);
  --vd-danger: var(--vx-danger); --vd-danger-soft: var(--vx-danger-soft);
  --vd-radius: var(--vx-radius-control); --vd-font-code: var(--vx-font-code);
  max-width: 46rem;
}
${DOC_CSS}`;

/** A docs app as it is deployed: its set, its search, and what to draw it with. */
export interface Docs {
  built: BuiltApp;
  search: ReturnType<typeof loadSearchIndex>;
}

const kept = new Map<string, Docs>();
const KEEP = 32;

/**
 * A docs app's pages, read and indexed once for each deployed bundle. A
 * deploy makes a new bundle, so what is kept is never out of date, and the
 * oldest is dropped when there are many.
 */
export function docsOf(
  bundleId: string,
  app: DocsApp,
  resources: readonly ResourceLike[],
  product: { terms: readonly string[]; topics: readonly string[] } | undefined,
): Docs {
  const key = `${bundleId}:${app.path}`;
  const found = kept.get(key);
  if (found) return found;
  const built = buildApp(app, resources, { product });
  const made = { built, search: loadSearchIndex(buildSearchIndex(built.set)) };
  kept.set(key, made);
  if (kept.size > KEEP) kept.delete(kept.keys().next().value as string);
  return made;
}

/** The page an address under the app names: `support/refunds`, a folder for its index, or nothing for the home page. */
export function pageAt(set: DocSet, address: string): string | undefined {
  const clean = address.replace(/\/+$/, "").replace(/\.md$/, "");
  return [clean, clean === "" ? "index" : `${clean}/index`].find((path) => set.pages.has(path));
}

export interface Drawn {
  frame: PageFrame;
  app: DocsApp;
  /** The app's own address, ending in a slash. Every link on the page is made from it. */
  base: string;
  set: DocSet;
  /** Where a picture kept beside the pages is served from, by its path under the app's folder. */
  asset?: (path: string) => string | undefined;
}

const attr = escapeHtml;
const href = (at: Drawn, url: string) => attr(`${at.base}${url}`);

function collectionOf(set: DocSet, path: string): Collection | undefined {
  return set.nav.collections.find(
    (collection) =>
      collection.index?.path === path ||
      collection.items.some((item) =>
        item.type === "page"
          ? item.path === path
          : item.index?.path === path || item.pages.some((page) => page.path === path),
      ),
  );
}

function side(at: Drawn, collection: Collection | undefined, current: string | undefined): string {
  if (!collection) return "";
  const link = (page: PageRef) =>
    `<li><a href="${href(at, page.url)}"${page.path === current ? ' aria-current="page"' : ""}>${escapeHtml(page.title)}</a></li>`;
  const items = collection.items
    .map((item) => {
      if (item.type === "page") return `<ul>${link(item)}</ul>`;
      const title = item.index
        ? `<a href="${href(at, item.index.url)}"${item.index.path === current ? ' aria-current="page"' : ""}>${escapeHtml(item.title)}</a>`
        : escapeHtml(item.title);
      return `<p class="group">${title}</p><ul>${item.pages.map(link).join("")}</ul>`;
    })
    .join("");
  // Folded on a phone, where it would push the page down. Always open on a wider screen.
  return `<nav class="side" aria-label="${attr(collection.title)}"><details open><summary>${escapeHtml(collection.title)}</summary>${items}</details></nav>`;
}

function shell(
  at: Drawn,
  options: {
    title: string;
    current?: string | undefined;
    collection?: Collection | undefined;
    main: string;
    aside?: string;
    query?: string;
    /** A page nobody should find by a search engine: results, and what is not there. */
    noindex?: boolean;
  },
): string {
  const { frame, app, set } = at;
  const collections = set.nav.collections.filter((one) => one.index || one.items.length > 0);
  const first = (collection: Collection) =>
    collection.index ??
    collection.items.flatMap((item) =>
      item.type === "page" ? [item] : [...(item.index ? [item.index] : []), ...item.pages],
    )[0];
  const tabs =
    collections.length > 1
      ? `<ul class="collections">${collections
          .map((collection) => {
            const to = first(collection);
            return to
              ? `<li><a href="${href(at, to.url)}"${collection === options.collection ? ' aria-current="true"' : ""}>${escapeHtml(collection.title)}</a></li>`
              : "";
          })
          .join("")}</ul>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${options.noindex ? '\n<meta name="robots" content="noindex">' : ""}
<title>${escapeHtml(options.title === app.title ? app.title : `${options.title} · ${app.title}`)}</title>
<link rel="stylesheet" href="${attr(frame.themeHref)}">
<link rel="stylesheet" href="/_platform/docs.css">${iconLinks(frame.iconsHref)}
<script src="/_platform/docs.js" defer></script>
</head>
<body>
<a class="skip" href="#content">Skip to the page</a>
<header class="top">
<a class="name" href="${attr(at.base)}">${frame.logoHref ? `<img src="${attr(frame.logoHref)}" alt="">` : ""}<span>${escapeHtml(app.title)}</span></a>
<form action="${href(at, "_search")}" method="get" role="search">
<input type="search" name="q" aria-label="Search ${attr(app.title)}" placeholder="Search" value="${attr(options.query ?? "")}">
<button type="submit">Search</button>
</form>
${tabs}
</header>
<div class="frame">
${side(at, options.collection, options.current)}
<main id="content">
${options.main}
</main>
${options.aside ?? ""}
</div>
</body>
</html>
`;
}

/** One page of the app, drawn. */
export function docPage(at: Drawn, path: string): string {
  const { set } = at;
  const entry = set.pages.get(path);
  if (!entry) return notFoundPage(at);
  const collection = collectionOf(set, path);
  const body = renderHtml(entry.tree, {
    profile: "docs",
    // The page's title is its first heading. What the author wrote as `#` comes under it.
    headingShift: 1,
    link: (written) => {
      if (linkKind(written) !== "relative") return undefined;
      const target = resolveLink(set, path, written);
      // A link that leads nowhere is its words. Its author was told when the page was deployed.
      if ("missing" in target) return null;
      return `${at.base}${urlOf(target.path)}${target.anchor ? `#${target.anchor}` : ""}`;
    },
    image: (src) => {
      if (imageKind(src) !== "relative") return undefined;
      const file = resolveAsset(path, src);
      return (file === undefined ? undefined : at.asset?.(file)) ?? null;
    },
    term: (props) => {
      const term = props.id ? set.terms[props.id] : undefined;
      if (!term) return null;
      return term.path === path
        ? { short: term.short }
        : { short: term.short, href: `${at.base}${urlOf(term.path)}` };
    },
  });

  const order = pagesInOrder(set.nav);
  const index = order.findIndex((one) => one.path === path);
  const before = index > 0 ? order[index - 1] : undefined;
  const after = index >= 0 ? order[index + 1] : undefined;
  const pager =
    before || after
      ? `<nav class="pager" aria-label="Pages before and after">${
          before
            ? `<a href="${href(at, before.url)}"><small>Before</small>${escapeHtml(before.title)}</a>`
            : ""
        }${
          after
            ? `<a class="next" href="${href(at, after.url)}"><small>Next</small>${escapeHtml(after.title)}</a>`
            : ""
        }</nav>`
      : "";

  const headings: { id: string; text: string; deep: boolean }[] = [];
  for (const { node } of walk(entry.tree)) {
    if (node.type === "heading" && node.depth <= 2) {
      headings.push({ id: node.id, text: plain(node), deep: node.depth === 2 });
    }
  }
  const aside =
    headings.length > 1
      ? `<nav class="onpage" aria-label="On this page"><p>On this page</p><ul>${headings
          .map(
            (one) =>
              `<li${one.deep ? ' class="deep"' : ""}><a href="#${attr(one.id)}">${escapeHtml(one.text)}</a></li>`,
          )
          .join("")}</ul></nav>`
      : "";

  const trail =
    collection && collection.id !== "" && collection.index?.path !== path
      ? `<p class="trail">${escapeHtml(collection.title)}</p>`
      : "";
  const { title, description } = entry.frontmatter;
  return shell(at, {
    title,
    current: path,
    collection,
    aside,
    main: `<header>${trail}<h1>${escapeHtml(title)}</h1>${
      description ? `<p>${escapeHtml(description)}</p>` : ""
    }</header>
<article class="vd-doc">${body}</article>
${pager}`,
  });
}

/** What a search of the app found. A page of its own, so that search needs no script. */
export function searchPage(at: Drawn, query: string, hits: readonly SearchHit[]): string {
  const asked = query.trim();
  const found =
    asked === ""
      ? "<p>Type what you are looking for.</p>"
      : hits.length === 0
        ? `<p>Nothing here matches “${escapeHtml(asked)}”.</p>`
        : `<ul class="results">${hits
            .map(
              (hit) =>
                `<li><a href="${href(at, hit.url)}">${escapeHtml(hit.title)}</a><p>${escapeHtml(hit.description || hit.excerpt)}</p></li>`,
            )
            .join("")}</ul>`;
  return shell(at, {
    title: asked === "" ? "Search" : `Search: ${asked}`,
    query: asked,
    noindex: true,
    main: `<header><h1>Search</h1>${asked === "" ? "" : `<p>${hits.length} ${hits.length === 1 ? "page" : "pages"} for “${escapeHtml(asked)}”</p>`}</header>
${found}`,
  });
}

/** For an address under the app that names no page. It keeps the app's frame, so the way back is there. */
export function notFoundPage(at: Drawn): string {
  return shell(at, {
    title: "Not found",
    noindex: true,
    main: `<header><h1>There is no page here</h1><p>It may have been moved or removed.</p></header>
<p><a href="${attr(at.base)}">Go to the first page</a>, or search above.</p>`,
  });
}
