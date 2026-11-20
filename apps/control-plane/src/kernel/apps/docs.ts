/**
 * A docs app's pages, drawn here. The app is a folder of the workspace's
 * pages of documentation, and each request is answered with HTML that reads
 * and works with scripts turned off: navigation is links and folds, search is
 * a form, tabs are sections one under another. One small script of the
 * platform's own, served as a file, then makes tabs into tabs, search into a
 * dialog that answers as it is typed, and the page's contents follow the
 * reader.
 *
 * Nothing a tenant wrote is ever sent as markup. A page is drawn from its
 * tree by the same renderer the console's preview uses, which escapes every
 * word and attribute.
 */

import {
  asDirectory,
  type BuiltApp,
  buildApp,
  buildSearchIndex,
  type Collection,
  type DocSet,
  type DocsApp,
  type Folder,
  folderItems,
  glossaryOf,
  loadSearchIndex,
  type Marked,
  type PageHit,
  type PageRef,
  pagesInOrder,
  type ResourceLike,
  resolveAsset,
  resolveLink,
  type SearchHit,
  splitFrontmatter,
  trailOf,
  urlOf,
} from "@volvel/docs-engine";
import {
  DOC_CSS,
  ENHANCE_SCRIPT,
  imageKind,
  linkKind,
  plain,
  type Root,
  renderHtml,
  walk,
} from "@volvel/markup";
import { icon } from "./docs-icons.js";
import { escapeHtml, iconLinks, type PageFrame } from "./pages.js";

/** What a docs app's page may load. As an app's, and a picture may also come from an https address its author gave. */
export const DOCS_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // The renderer writes classes, never a style. Inline styles are allowed for a diagram, which
  // Mermaid draws with a style block and style attributes; scripts stay the instance's own.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/**
 * The stylesheet of a docs app: its frame, then the page's own, on the
 * theme's tokens. The page's column is always as wide, whatever is beside it:
 * the navigation and the page's contents keep their places when they are empty.
 */
export const DOCS_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; --top: 0px; }
body {
  margin: 0; background: var(--vx-canvas); color: var(--vx-ink); font-family: var(--vx-font);
  font-size: 16px; line-height: 1.5; -webkit-font-smoothing: antialiased;
}
a { color: var(--vx-action); }
:focus-visible { outline: 2px solid var(--vx-focus, var(--vx-action)); outline-offset: 2px; }
button { font: inherit; color: inherit; }
.icon { flex: none; vertical-align: middle; }
.skip { position: absolute; left: -10000px; }
.skip:focus { left: 12px; top: 12px; z-index: 50; padding: 8px 12px; background: var(--vx-surface); border: 1px solid var(--vx-line); border-radius: var(--vx-radius-control); }
.preview { margin: 0; padding: 6px 20px; background: var(--vx-attention-soft); border-bottom: 1px solid var(--vx-line); font-size: 14px; }
.muted { color: var(--vx-ink-muted); }
kbd.key {
  display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 5px;
  border: 1px solid var(--vx-line); border-radius: 5px; background: var(--vx-sunken);
  font: 500 11px/1 var(--vx-font); color: var(--vx-ink-muted);
}

/* The brand: a logo, or the app's initials on a tile. */
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; font-weight: 600; color: var(--vx-ink); text-decoration: none; }
.brand img { max-height: 28px; max-width: 120px; }
.brand .tile {
  display: inline-grid; place-items: center; width: 28px; height: 28px; flex: none; border-radius: 7px;
  background: var(--vx-action); color: var(--vx-action-ink); font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
}
.brand span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Search, as a field that opens the dialog, and a form without script. */
.find {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 38px; padding: 0 8px 0 10px;
  border: 1px solid var(--vx-line); border-radius: 9px; background: var(--vx-surface);
  color: var(--vx-ink-muted); font-size: 14px; text-decoration: none; cursor: pointer;
}
.find:hover { border-color: var(--vx-line-strong, var(--vx-line)); }
.find .grow { flex: 1; text-align: left; }

/* The frame: navigation, the page, what is on it. */
.layout { display: grid; grid-template-columns: minmax(0, 1fr); min-height: 100vh; }
.side {
  display: flex; flex-direction: column; gap: 14px; padding: 18px 12px 24px;
  background: var(--vx-canvas); font-size: 14px;
}
.side .brand { padding: 4px 8px 6px; }
.side .close { display: none; }
.topbar {
  position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px 0 14px;
  background: var(--vx-canvas); border-bottom: 1px solid var(--vx-line);
}
.topbar .brand { flex: 1; }
.iconbutton {
  display: inline-grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 8px;
  background: none; color: var(--vx-ink); cursor: pointer; text-decoration: none;
}
.iconbutton:hover { background: var(--vx-sunken); }
/* The page and what is on it are one block, in the middle of the room beside the navigation. */
.page { display: grid; grid-template-columns: minmax(0, 56rem); justify-content: center; align-content: start; }
main { min-width: 0; padding: 20px 18px 64px; }
.column { width: 100%; max-width: 56rem; margin: 0 auto; }
.toc { display: none; }

/* On a phone, the navigation is a sheet that slides over the page: by its address without script, by a class with it. */
@media (max-width: 1023.98px) {
  .side {
    position: fixed; inset: 0 auto 0 0; z-index: 40; width: min(320px, 88vw); overflow-y: auto; padding-top: 12px;
    border-right: 1px solid var(--vx-line); box-shadow: 0 24px 64px rgb(0 0 0 / 0.35);
    transform: translateX(-102%); visibility: hidden;
    transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1), visibility 0s linear 0.24s;
  }
  .side:target, body.nav-open .side { transform: none; visibility: visible; transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1); }
  .side .close { display: inline-grid; position: absolute; top: 10px; right: 10px; }
  .scrim {
    position: fixed; inset: 0; z-index: 39; background: rgb(0 0 0 / 0.45); opacity: 0; visibility: hidden;
    transition: opacity 0.24s ease, visibility 0s linear 0.24s;
  }
  body.nav-open .scrim { opacity: 1; visibility: visible; transition: opacity 0.24s ease; }
}
@media (min-width: 1024px) {
  .layout { grid-template-columns: 280px minmax(0, 1fr); }
  .topbar, .scrim { display: none; }
  .side { position: sticky; top: 0; height: 100vh; overflow-y: auto; border-right: 1px solid var(--vx-line); }
  main { padding: 48px 40px 96px; }
}
@media (min-width: 1280px) {
  .page { grid-template-columns: minmax(0, 56rem) 220px; gap: 48px; padding: 0 32px; }
  main { padding-left: 0; padding-right: 0; }
  .toc { display: block; position: sticky; top: 0; align-self: start; max-height: 100vh; overflow-y: auto; padding: 56px 0 24px; font-size: 13px; }
  .tocbar { display: none; }
}

/* What opens and closes moves, unless the reader asked for less motion. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
.switcher > ul { transform-origin: top center; }
.finder::backdrop { transition: opacity 0.18s ease; }

/* The navigation's tree. Folders fold, and any depth draws. */
.switcher { position: relative; }
.switcher > summary {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; list-style: none; cursor: pointer;
  border: 1px solid var(--vx-line); border-radius: 10px; background: var(--vx-surface);
}
.switcher > summary::-webkit-details-marker { display: none; }
.switcher[open] > summary { border-color: var(--vx-line-strong, var(--vx-line)); }
.switcher .badge {
  display: inline-grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: 8px;
  border: 1px solid var(--vx-line); background: var(--vx-sunken); color: var(--vx-action);
}
.switcher .words { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.3; }
.switcher .words b { font-weight: 600; color: var(--vx-ink); }
.switcher .words small { color: var(--vx-ink-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.switcher ul {
  position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 30; margin: 0; padding: 6px; list-style: none;
  border: 1px solid var(--vx-line); border-radius: 10px; background: var(--vx-raised, var(--vx-surface));
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.18);
}
.switcher ul a { display: flex; align-items: center; gap: 10px; padding: 6px; border-radius: 8px; text-decoration: none; }
.switcher ul a:hover, .switcher ul a[aria-current] { background: var(--vx-sunken); }
.tree { margin: 0; padding: 0; list-style: none; }
.tree .tree { margin: 2px 0 2px 12px; padding-left: 10px; border-left: 1px solid var(--vx-line); }
.tree a, .tree .label {
  display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 5px 8px; border-radius: 8px;
  color: var(--vx-ink-muted); text-decoration: none; line-height: 1.35;
}
.tree a:hover { background: var(--vx-sunken); color: var(--vx-ink); }
.tree a[aria-current="page"] { position: relative; background: var(--vx-action-soft); color: var(--vx-action); font-weight: 500; }
.tree .tree a[aria-current="page"]::before {
  content: ""; position: absolute; left: -11px; top: 6px; bottom: 6px; width: 2px; border-radius: 2px; background: var(--vx-action);
}
.tree details > summary { display: flex; align-items: center; list-style: none; cursor: pointer; border-radius: 8px; }
.tree details > summary::-webkit-details-marker { display: none; }
.tree details > summary > :first-child { flex: 1; }
.tree details > summary .chevron { display: inline-grid; place-items: center; width: 28px; height: 28px; color: var(--vx-ink-muted); transition: transform 0.15s; }
.tree details[open] > summary .chevron { transform: rotate(90deg); }
.tree .open-folder > details > summary > .label, .tree .open-folder > details > summary > a:not([aria-current]) { color: var(--vx-ink); font-weight: 500; }
.side .section { margin: 14px 0 4px; padding: 0 8px; font-size: 12px; font-weight: 500; color: var(--vx-ink-muted); }

/* The page. */
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 10px; padding: 0; list-style: none; font-size: 14px; color: var(--vx-ink-muted); }
.crumbs a { color: inherit; text-decoration: none; }
.crumbs a:hover { color: var(--vx-ink); }
.crumbs li + li::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 8px; border-top: 1.5px solid currentColor; border-right: 1.5px solid currentColor; transform: rotate(45deg) translateY(-2px); opacity: 0.7; }
.lead h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.15; letter-spacing: -0.02em; }
.lead > p { margin: 0; color: var(--vx-ink-muted); font-size: 18px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.button {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 1px solid var(--vx-line);
  border-radius: 8px; background: var(--vx-surface); color: var(--vx-ink-muted); font-size: 13px; text-decoration: none; cursor: pointer;
}
.button:hover { color: var(--vx-ink); border-color: var(--vx-line-strong, var(--vx-line)); }
.lead { padding-bottom: 24px; margin-bottom: 28px; border-bottom: 1px solid var(--vx-line); }
.vd-doc { font-size: 16px; }
.foot { margin-top: 56px; display: grid; gap: 16px; }
.updated { margin: 0; font-size: 13px; color: var(--vx-ink-muted); }
.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pager a {
  display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border: 1px solid var(--vx-line); border-radius: 12px;
  background: var(--vx-surface); color: var(--vx-ink); text-decoration: none; font-weight: 600;
}
.pager a:hover { border-color: var(--vx-action); }
.pager small { display: flex; align-items: center; gap: 4px; font-weight: 400; font-size: 13px; color: var(--vx-ink-muted); }
.pager .next { grid-column: 2; text-align: right; align-items: flex-end; }
.feedback {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 0;
  padding: 12px 16px; border: 1px solid var(--vx-line); border-radius: 12px; background: var(--vx-surface); font-size: 14px; font-weight: 500;
}
.feedback .choices { display: flex; gap: 8px; }
.feedback button { border-radius: 999px; }
.feedback .hp { position: absolute; left: -10000px; }

/* What is on the page, beside it on a wide screen and over it on a narrow one. */
.toc p { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-weight: 600; color: var(--vx-ink); }
.toc ul, .tocbar ul { margin: 0; padding: 0; list-style: none; border-left: 1px solid var(--vx-line); }
.toc li a, .tocbar li a { display: block; margin-left: -1px; padding: 5px 0 5px 14px; border-left: 2px solid transparent; color: var(--vx-ink-muted); text-decoration: none; }
.toc li.deep a, .tocbar li.deep a { padding-left: 26px; }
.toc li a:hover { color: var(--vx-ink); }
.toc li a[aria-current="true"], .tocbar li a[aria-current="true"] { border-left-color: var(--vx-action); color: var(--vx-action); }
.toc .top { display: inline-flex; align-items: center; gap: 6px; margin-top: 18px; color: var(--vx-ink-muted); text-decoration: none; }
.tocbar { position: sticky; top: 56px; z-index: 15; margin: -20px -18px 20px; background: var(--vx-canvas); border-bottom: 1px solid var(--vx-line); font-size: 14px; }
.tocbar > summary { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 18px; list-style: none; cursor: pointer; color: var(--vx-ink-muted); }
.tocbar > summary::-webkit-details-marker { display: none; }
.tocbar .ring { width: 16px; height: 16px; flex: none; border-radius: 50%; background: conic-gradient(var(--vx-action) var(--read, 0%), var(--vx-line) 0); -webkit-mask: radial-gradient(circle, transparent 5px, #000 5.5px); mask: radial-gradient(circle, transparent 5px, #000 5.5px); }
.tocbar .now { flex: 1; min-width: 0; overflow: hidden; color: var(--vx-ink); white-space: nowrap; text-overflow: ellipsis; }
.tocbar ul { margin: 0 18px 12px; }
@media (min-width: 1024px) { .tocbar { top: 0; margin: -48px -40px 32px; } .tocbar > summary { padding: 0 40px; } .tocbar ul { margin: 0 40px 12px; } }

/* Results of a search, as a page. */
.results { margin: 0; padding: 0; list-style: none; }
.results li { margin: 0 0 22px; }
.results a { font-weight: 600; font-size: 17px; text-decoration: none; }
.results p { margin: 2px 0 0; color: var(--vx-ink-muted); }
.search-form { display: flex; gap: 8px; margin-bottom: 28px; }
.search-form input {
  flex: 1; height: 42px; padding: 0 12px; border: 1px solid var(--vx-line); border-radius: 10px;
  background: var(--vx-surface); color: var(--vx-ink); font: inherit;
}
.search-form button { height: 42px; padding: 0 16px; border: 1px solid var(--vx-line); border-radius: 10px; background: var(--vx-sunken); font-weight: 600; cursor: pointer; }

/* The home page. */
.homebar { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid var(--vx-line); background: var(--vx-canvas); }
.homebar .inner { display: flex; align-items: center; gap: 24px; max-width: 1200px; height: 60px; margin: 0 auto; padding: 0 18px; }
.homebar nav { display: none; gap: 20px; font-size: 14px; }
.homebar nav a { color: var(--vx-ink-muted); text-decoration: none; }
.homebar nav a:hover { color: var(--vx-ink); }
.homebar .find { width: auto; margin-left: auto; }
.homebar .find .grow { display: none; }
@media (min-width: 820px) { .homebar nav { display: flex; } .homebar .find { width: 240px; } .homebar .find .grow { display: inline; } }
.home { max-width: 56rem; margin: 0 auto; padding: 56px 18px 96px; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--vx-line); border-radius: 999px; font-size: 12px; color: var(--vx-ink-muted); }
.pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--vx-action); }
.home h1 { margin: 20px 0 12px; font-size: clamp(34px, 6vw, 48px); line-height: 1.05; letter-spacing: -0.03em; }
.home .intro { margin: 0 0 32px; font-size: 19px; color: var(--vx-ink-muted); }
.home .find.big { height: 54px; max-width: 37rem; padding: 0 12px 0 16px; border-radius: 12px; font-size: 16px; }
.home .find.big .grow { display: inline; }
.find input { height: 100%; padding: 0; border: 0; border-radius: 0; background: none; color: var(--vx-ink); font: inherit; outline: none; }
.find input::placeholder { color: var(--vx-ink-muted); }
.find:focus-within { border-color: var(--vx-action); }
.home h2 { margin: 64px 0 16px; font-size: 14px; font-weight: 500; color: var(--vx-ink-muted); }
.home .own { margin-top: 40px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
.card { display: flex; flex-direction: column; height: 100%; padding: 20px; border: 1px solid var(--vx-line); border-radius: 14px; background: var(--vx-surface); }
.card .badge { display: inline-grid; place-items: center; width: 38px; height: 38px; border: 1px solid var(--vx-line); border-radius: 9px; background: var(--vx-sunken); color: var(--vx-action); margin-bottom: 18px; }
.card h3 { margin: 0 0 4px; font-size: 17px; }
.card h3 a { color: var(--vx-ink); text-decoration: none; }
.card > p { margin: 0 0 16px; color: var(--vx-ink-muted); font-size: 14px; }
.card ul { margin: 0 0 16px; padding: 14px 0 0; list-style: none; border-top: 1px solid var(--vx-line); font-size: 14px; }
.card li a { display: block; padding: 4px 0; color: var(--vx-ink); text-decoration: none; }
.card li a:hover { color: var(--vx-action); }
.card .more { margin-top: auto; font-size: 13px; font-weight: 500; text-decoration: none; }
.recent { margin: 0; padding: 0; list-style: none; border: 1px solid var(--vx-line); border-radius: 14px; background: var(--vx-surface); overflow: hidden; }
.recent li + li { border-top: 1px solid var(--vx-line); }
.recent a { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; padding: 14px 18px; color: var(--vx-ink); text-decoration: none; }
.recent a:hover { background: var(--vx-sunken); }
.recent .what { flex: 1 1 16rem; display: flex; flex-direction: column; }
.recent .what b { font-weight: 600; font-size: 15px; }
.recent .what small, .recent .where, .recent time { color: var(--vx-ink-muted); font-size: 13px; }
.sitefoot { border-top: 1px solid var(--vx-line); }
.sitefoot p { max-width: 56rem; margin: 0 auto; padding: 24px 18px; font-size: 13px; color: var(--vx-ink-muted); }

/* The search dialog, made by the script. */
.finder { width: min(640px, calc(100vw - 24px)); max-height: min(560px, calc(100vh - 48px)); margin: 10vh auto auto; padding: 0; border: 1px solid var(--vx-line); border-radius: 14px; background: var(--vx-raised, var(--vx-surface)); color: var(--vx-ink); box-shadow: 0 24px 64px rgb(0 0 0 / 0.35); overflow: hidden; }
.finder[open] { display: flex; flex-direction: column; }
.finder::backdrop { background: rgb(0 0 0 / 0.45); }
.finder .bar { display: flex; align-items: center; gap: 10px; padding: 0 14px; height: 56px; border-bottom: 1px solid var(--vx-line); color: var(--vx-ink-muted); }
.finder input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--vx-ink); font: inherit; font-size: 16px; outline: none; }
.finder .chips { display: flex; gap: 6px; overflow-x: auto; padding: 10px 14px; border-bottom: 1px solid var(--vx-line); }
.finder .chips button { flex: none; height: 28px; padding: 0 10px; border: 1px solid var(--vx-line); border-radius: 999px; background: none; color: var(--vx-ink-muted); font-size: 13px; cursor: pointer; }
.finder .chips button[aria-pressed="true"] { border-color: var(--vx-action); background: var(--vx-action-soft); color: var(--vx-action); }
.finder .list { flex: 1; overflow-y: auto; margin: 0; padding: 6px; list-style: none; }
.finder .list .heading { padding: 8px 10px 4px; font-size: 12px; color: var(--vx-ink-muted); }
.finder .hit { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 9px; color: var(--vx-ink); text-decoration: none; }
.finder .hit .badge { display: inline-grid; place-items: center; width: 30px; height: 30px; flex: none; border: 1px solid var(--vx-line); border-radius: 8px; color: var(--vx-ink-muted); }
.finder .hit .words { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.finder .hit small { color: var(--vx-ink-muted); font-size: 12px; }
.finder .place { display: flex; align-items: center; gap: 10px; margin-left: 24px; padding: 7px 10px 7px 12px; border-left: 1px solid var(--vx-line); border-radius: 0 9px 9px 0; color: var(--vx-ink-muted); font-size: 14px; text-decoration: none; }
.finder .place span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.finder .hit.active, .finder .place.active { background: var(--vx-sunken); }
.finder mark { background: none; color: var(--vx-action); font-weight: 600; }
.finder .none { padding: 24px 14px; color: var(--vx-ink-muted); text-align: center; }
.finder .keys { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-top: 1px solid var(--vx-line); font-size: 12px; color: var(--vx-ink-muted); }
.finder .keys span { display: inline-flex; align-items: center; gap: 4px; }
.finder .keys .count { margin-left: auto; }
@media (max-width: 640px) { .finder { width: 100vw; max-height: 100vh; height: 100vh; margin: 0; border-radius: 0; } .finder .keys span:not(.count) { display: none; } }

.vd-doc {
  --vd-ink: var(--vx-ink); --vd-muted: var(--vx-ink-muted); --vd-line: var(--vx-line);
  --vd-surface: var(--vx-surface); --vd-sunken: var(--vx-sunken); --vd-action: var(--vx-action);
  --vd-info: var(--vx-action); --vd-info-soft: var(--vx-action-soft);
  --vd-success: var(--vx-success); --vd-success-soft: var(--vx-success-soft);
  --vd-attention: var(--vx-attention); --vd-attention-soft: var(--vx-attention-soft);
  --vd-danger: var(--vx-danger); --vd-danger-soft: var(--vx-danger-soft);
  --vd-radius: var(--vx-radius-control); --vd-font-code: var(--vx-font-code);
  --vd-scroll-margin: 4.5rem;
}
${DOC_CSS}`;

/**
 * The script of a docs app: the page's own (tabs and terms), then the site's.
 * It reads what the page says of itself from `#docs-data`, a block of JSON
 * that is never run, writes nothing as HTML, and keeps only what a reader
 * opened last, in their own browser.
 */
export const DOCS_SCRIPT = `${ENHANCE_SCRIPT}
(() => {
  "use strict";
  const dataNode = document.getElementById("docs-data");
  let data = {};
  try { data = JSON.parse(dataNode ? dataNode.textContent : "{}"); } catch (_) { data = {}; }
  const base = data.base || "/";
  const make = (tag, attrs, children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === false || value === undefined || value === null) continue;
      if (key === "text") node.textContent = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children || []) if (child) node.append(child);
    return node;
  };
  const marked = (parts) => {
    const out = document.createDocumentFragment();
    for (const part of parts || []) out.append(part.hit ? make("mark", { text: part.text }) : document.createTextNode(part.text));
    return out;
  };

  // What a reader opened last, kept in their own browser, for an empty search.
  const RECENT = "vd-recent:" + base;
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT) || "[]"); } catch (_) { return []; } };
  if (data.page) {
    try {
      const kept = recent().filter((one) => one.url !== data.page.url);
      localStorage.setItem(RECENT, JSON.stringify([data.page, ...kept].slice(0, 5)));
    } catch (_) {}
  }

  // What opens and closes moves: a fold grows and shrinks, a menu fades. Less, when the reader asks for less.
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(0.2, 0, 0, 1)";
  const moving = new WeakMap();
  const settle = (node) => { const was = moving.get(node); if (was) was.cancel(); };
  const menuOf = (details) => details.classList.contains("switcher") ? details.querySelector(":scope > ul") : null;
  const heightOf = (details, open) => {
    const was = details.open;
    details.open = open;
    const height = details.getBoundingClientRect().height;
    details.open = was;
    return height;
  };
  const fold = (details, open) => {
    if (details.open === open && !moving.get(details)) return;
    settle(details);
    const menu = menuOf(details);
    if (still || typeof details.animate !== "function") { details.open = open; return; }
    if (menu) {
      if (open) details.open = true;
      const frames = [{ opacity: 0, transform: "translateY(-6px) scale(0.98)" }, { opacity: 1, transform: "none" }];
      const run = menu.animate(open ? frames : [...frames].reverse(), { duration: open ? 160 : 120, easing: EASE });
      moving.set(details, run);
      run.onfinish = () => { moving.delete(details); if (!open) details.open = false; };
      run.oncancel = () => moving.delete(details);
      return;
    }
    const from = details.getBoundingClientRect().height;
    const to = heightOf(details, open);
    details.open = true;
    details.style.overflow = "hidden";
    const run = details.animate({ height: [from + "px", to + "px"] }, { duration: 200, easing: EASE });
    moving.set(details, run);
    const done = () => { moving.delete(details); details.style.overflow = ""; details.open = open; };
    run.onfinish = done;
    run.oncancel = () => { moving.delete(details); details.style.overflow = ""; };
  };
  for (const details of document.querySelectorAll("details")) {
    const summary = details.querySelector(":scope > summary");
    if (!summary) continue;
    summary.addEventListener("click", (event) => {
      // A link in a folder's row leads to its page; the chevron beside it opens and closes.
      if (event.target instanceof Element && event.target.closest("a")) return;
      event.preventDefault();
      fold(details, !details.open);
    });
  }
  // A menu closes when the reader clicks anywhere else, or presses Escape.
  document.addEventListener("pointerdown", (event) => {
    for (const open of document.querySelectorAll("details.switcher[open]")) {
      if (!open.contains(event.target)) fold(open, false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const open of document.querySelectorAll("details.switcher[open]")) {
      fold(open, false);
      const summary = open.querySelector(":scope > summary");
      if (summary) summary.focus();
    }
  });

  // The navigation, on a narrow screen.
  const body = document.body;
  for (const opener of document.querySelectorAll("[data-nav-open]")) {
    opener.addEventListener("click", (event) => { event.preventDefault(); body.classList.add("nav-open"); });
  }
  for (const closer of document.querySelectorAll("[data-nav-close]")) {
    closer.addEventListener("click", (event) => { event.preventDefault(); body.classList.remove("nav-open"); });
  }
  if (location.hash === "#nav") history.replaceState(null, "", location.pathname + location.search);

  // Copy as Markdown, and the page's address.
  for (const button of document.querySelectorAll("[data-copy]")) {
    button.hidden = false;
    const label = button.querySelector("span");
    const said = label ? label.textContent : "";
    button.addEventListener("click", async () => {
      try {
        const what = button.getAttribute("data-copy");
        const text = what === "link"
          ? location.href.split("#")[0]
          : await (await fetch(what, { credentials: "same-origin" })).text();
        await navigator.clipboard.writeText(text);
        if (label) { label.textContent = "Copied"; setTimeout(() => { label.textContent = said; }, 1600); }
      } catch (_) {}
    });
  }

  // What is on the page: the heading being read is marked, beside the page and over it.
  const tocLinks = [...document.querySelectorAll(".toc li a[href^='#'], .tocbar li a[href^='#']")];
  const now = document.querySelector(".tocbar .now");
  const ring = document.querySelector(".tocbar .ring");
  const headings = [...new Set(tocLinks.map((link) => decodeURIComponent(link.getAttribute("href").slice(1))))]
    .map((id) => document.getElementById(id)).filter(Boolean);
  const mark = () => {
    let current = headings[0];
    for (const heading of headings) if (heading.getBoundingClientRect().top < 120) current = heading;
    for (const link of tocLinks) {
      const on = current && link.getAttribute("href") === "#" + current.id;
      if (on) link.setAttribute("aria-current", "true"); else link.removeAttribute("aria-current");
    }
    if (now && current) now.textContent = current.textContent;
    if (ring) {
      const max = document.documentElement.scrollHeight - innerHeight;
      ring.style.setProperty("--read", (max > 0 ? Math.min(100, Math.round((scrollY / max) * 100)) : 100) + "%");
    }
  };
  if (headings.length > 0) {
    addEventListener("scroll", mark, { passive: true });
    mark();
  }
  for (const link of document.querySelectorAll(".tocbar a")) {
    link.addEventListener("click", () => { const bar = link.closest("details"); if (bar) fold(bar, false); });
  }

  // A diagram is drawn by the instance's own drawing script, fetched only for a page that has one.
  if (document.querySelector("[data-vd-mermaid]")) {
    import("/_platform/diagrams.js").then((drawing) => drawing.drawAll(document)).catch(() => {});
  }

  // Whether a page helped: said without leaving the page. Without script, the form is sent as it is.
  for (const form of document.querySelectorAll("form[data-feedback]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const pressed = event.submitter;
      const body = new URLSearchParams(new FormData(form));
      if (pressed && pressed.name) body.set(pressed.name, pressed.value);
      for (const button of form.querySelectorAll("button")) button.disabled = true;
      try {
        const answer = await fetch(form.action, {
          method: "POST",
          body,
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        const thanks = make("p", { class: "feedback", id: "feedback", role: "status" });
        thanks.textContent = answer.ok ? "Thank you for saying." : "Your answer could not be kept. Try again later.";
        form.replaceWith(thanks);
      } catch (_) {
        for (const button of form.querySelectorAll("button")) button.disabled = false;
      }
    });
  }

  // Search, as it is typed, in a dialog.
  const triggers = [...document.querySelectorAll("[data-search]")];
  if (triggers.length === 0 || typeof HTMLDialogElement === "undefined") return;
  let dialog, input, list, count, chips, active = -1, scope = data.collection || "", timer, asking;
  const items = () => [...list.querySelectorAll("a")];
  const activate = (index) => {
    const all = items();
    if (all.length === 0) { active = -1; return; }
    active = (index + all.length) % all.length;
    all.forEach((one, at) => one.classList.toggle("active", at === active));
    all[active].scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", all[active].id);
  };
  const show = (pages, asked) => {
    list.replaceChildren();
    let made = 0;
    const id = () => "vd-hit-" + ++made;
    if (!asked) {
      const kept = recent();
      if (kept.length > 0) list.append(make("li", { class: "heading", text: "Recently viewed" }));
      for (const one of kept) {
        list.append(make("li", {}, [make("a", { class: "hit", href: base + one.url, id: id(), role: "option" }, [
          make("span", { class: "badge", "aria-hidden": "true", text: "\\u21ba" }),
          make("span", { class: "words" }, [make("span", { text: one.title }), one.crumb ? make("small", { text: one.crumb }) : null]),
        ])]));
      }
      count.textContent = "";
    } else if (pages.length === 0) {
      list.append(make("li", { class: "none", text: "Nothing here matches \\u201c" + asked + "\\u201d." }));
      count.textContent = "";
    } else {
      for (const page of pages) {
        const words = make("span", { class: "words" }, [make("span", {}, [marked(page.title)]), page.crumb ? make("small", { text: page.crumb }) : null]);
        list.append(make("li", {}, [make("a", { class: "hit", href: base + page.url, id: id(), role: "option" }, [
          make("span", { class: "badge", "aria-hidden": "true", text: "\\u2630" }), words,
        ])]));
        for (const place of page.places) {
          list.append(make("li", {}, [make("a", { class: "place", href: base + place.url, id: id(), role: "option" }, [
            make("b", { "aria-hidden": "true", text: place.type === "heading" ? "#" : "\\u2261" }),
            make("span", {}, [marked(place.words)]),
          ])]));
        }
      }
      count.textContent = pages.length + (pages.length === 1 ? " page" : " pages");
    }
    active = -1;
    if (asked) activate(0);
  };
  const ask = () => {
    const asked = input.value.trim();
    clearTimeout(timer);
    if (!asked) { show([], ""); return; }
    timer = setTimeout(async () => {
      if (asking) asking.abort();
      asking = new AbortController();
      try {
        const address = base + "_search.json?q=" + encodeURIComponent(asked) + (scope ? "&in=" + encodeURIComponent(scope) : "");
        const answer = await fetch(address, { signal: asking.signal, credentials: "same-origin" });
        if (!answer.ok) return;
        const found = await answer.json();
        if (input.value.trim() === asked) show(found.pages || [], asked);
      } catch (_) {}
    }, 120);
  };
  const build = () => {
    input = make("input", { type: "search", placeholder: "Search", "aria-label": "Search", autocomplete: "off", role: "combobox", "aria-expanded": "true", "aria-controls": "vd-results" });
    list = make("ul", { class: "list", id: "vd-results", role: "listbox" });
    count = make("span", { class: "count" });
    const close = make("button", { type: "button", class: "key", text: "Esc", "aria-label": "Close" });
    chips = make("div", { class: "chips", role: "group", "aria-label": "Where to search" });
    const collections = [{ id: "", title: "All" }, ...(data.collections || [])];
    if (collections.length > 2) {
      for (const one of collections) {
        const chip = make("button", { type: "button", text: one.title, "aria-pressed": String(one.id === scope) });
        chip.addEventListener("click", () => {
          scope = one.id;
          for (const other of chips.children) other.setAttribute("aria-pressed", String(other === chip));
          ask();
          input.focus();
        });
        chips.append(chip);
      }
    }
    const key = (text) => make("kbd", { class: "key", text });
    dialog = make("dialog", { class: "finder", "aria-label": "Search" }, [
      make("div", { class: "bar" }, [make("span", { "aria-hidden": "true", text: "\\u2315" }), input, close]),
      chips.children.length > 0 ? chips : null,
      list,
      make("div", { class: "keys" }, [
        make("span", {}, [key("\\u2191"), key("\\u2193"), document.createTextNode(" Move")]),
        make("span", {}, [key("\\u21b5"), document.createTextNode(" Open")]),
        make("span", {}, [key("esc"), document.createTextNode(" Close")]),
        count,
      ]),
    ]);
    close.addEventListener("click", () => hide());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) hide(); });
    // Escape closes it as everything else does: moving away.
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); hide(); });
    input.addEventListener("input", ask);
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); activate(active + 1); }
      if (event.key === "ArrowUp") { event.preventDefault(); activate(active - 1); }
      if (event.key === "Enter") {
        const all = items();
        if (all[active]) { event.preventDefault(); location.href = all[active].href; }
      }
    });
    list.addEventListener("click", () => hide());
    body.append(dialog);
  };
  const FRAMES = [{ opacity: 0, transform: "translateY(-8px) scale(0.98)" }, { opacity: 1, transform: "none" }];
  const BACKDROP = [{ opacity: 0 }, { opacity: 1 }];
  const motion = (frames, options, pseudo) => {
    if (still || typeof dialog.animate !== "function") return null;
    try { return dialog.animate(frames, pseudo ? { ...options, pseudoElement: "::backdrop" } : options); } catch (_) { return null; }
  };
  let hiding = false;
  function hide() {
    if (!dialog || !dialog.open || hiding) return;
    hiding = true;
    const run = motion([...FRAMES].reverse(), { duration: 140, easing: EASE });
    motion([...BACKDROP].reverse(), { duration: 140, easing: EASE }, true);
    const done = () => { hiding = false; dialog.close(); };
    if (run) { run.onfinish = done; run.oncancel = done; } else done();
  }
  const open = (event) => {
    if (event) event.preventDefault();
    if (!dialog) build();
    body.classList.remove("nav-open");
    if (!dialog.open) {
      dialog.showModal();
      motion(FRAMES, { duration: 180, easing: EASE });
      motion(BACKDROP, { duration: 180, easing: EASE }, true);
    }
    input.select();
    ask();
  };
  for (const trigger of triggers) trigger.addEventListener("click", open);
  addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") open(event);
    else if (event.key === "/" && !typing) open(event);
    else if (event.key === "Escape" && body.classList.contains("nav-open")) body.classList.remove("nav-open");
  });
})();
`;

/** A docs app as it is deployed: its set, its search, and what to draw it with. */
export interface Docs {
  built: BuiltApp;
  search: ReturnType<typeof loadSearchIndex>;
}

const kept = new Map<string, Docs>();
const KEEP = 32;

/** Whether a docs app of a bundle is already read and indexed. */
export function docsKept(bundleId: string, app: DocsApp): boolean {
  return kept.has(`${bundleId}:${app.path}`);
}

/**
 * A docs app's pages, read and indexed once for each deployed bundle. A
 * deploy makes a new bundle, so what is kept is never out of date, and the
 * oldest is dropped when there are many. `updated` is when each page, by its
 * path in the workspace, last changed.
 */
export function docsOf(
  bundleId: string,
  app: DocsApp,
  resources: readonly ResourceLike[],
  product: { terms: readonly string[]; topics: readonly string[] } | undefined,
  updated?: ReadonlyMap<string, Date>,
): Docs {
  const key = `${bundleId}:${app.path}`;
  const found = kept.get(key);
  if (found) return found;
  const dated = updated
    ? resources.map((one) =>
        one.kind === "doc" && updated.has(one.path)
          ? { ...one, updated: updated.get(one.path) }
          : one,
      )
    : resources;
  const built = buildApp(app, dated, { product });
  const made = { built, search: loadSearchIndex(buildSearchIndex(built.set)) };
  kept.set(key, made);
  if (kept.size > KEEP) kept.delete(kept.keys().next().value as string);
  return made;
}

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

export interface Drawn {
  frame: PageFrame;
  app: DocsApp;
  /** The app's own address, ending in a slash. Every link on the page is made from it. */
  base: string;
  set: DocSet;
  /** Where a picture kept beside the pages is served from, by its path under the app's folder. */
  asset?: (path: string) => string | undefined;
  /** Said across the top of every page: that this is a preview, and for whom. */
  notice?: string;
  /**
   * Whether readers are asked if a page helped, and whether this reader
   * already said, by the page's path. Left out, they are not asked.
   */
  feedback?: { said: (path: string) => boolean; recording: boolean };
}

const attr = escapeHtml;
const href = (at: Drawn, url: string) => attr(`${at.base}${url}`);

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

function brand(at: Drawn): string {
  const { frame, app } = at;
  const mark = frame.logoHref
    ? `<img src="${attr(frame.logoHref)}" alt="">`
    : `<span class="tile" aria-hidden="true">${escapeHtml(initials(app.title))}</span>`;
  return `<a class="brand" href="${attr(at.base)}">${mark}<span>${escapeHtml(app.title)}</span></a>`;
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
  at: Drawn,
  items: readonly (PageRef | Folder)[],
  current: string | undefined,
): string {
  const link = (page: PageRef, title = page.title) =>
    `<a href="${href(at, page.url)}"${page.path === current ? ' aria-current="page"' : ""}>${escapeHtml(title)}</a>`;
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

function side(at: Drawn, collection: Collection | undefined, current: string | undefined): string {
  const collections = collectionsOf(at.set);
  let switcher = "";
  if (collection && collections.length > 1) {
    switcher = `<details class="switcher"><summary><span class="badge">${badge(collection)}</span><span class="words"><b>${escapeHtml(collection.title)}</b>${
      collection.description ? `<small>${escapeHtml(collection.description)}</small>` : ""
    }</span>${icon("chevrons-up-down", 16)}</summary><ul>${collections
      .map((one) => {
        const to = firstOf(one);
        if (!to) return "";
        return `<li><a href="${href(at, to.url)}"${one === collection ? ' aria-current="true"' : ""}><span class="badge">${badge(one)}</span><span class="words"><b>${escapeHtml(one.title)}</b>${
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
<nav aria-label="${attr(collection?.title ?? at.app.title)}">${tree}</nav>
</aside>`;
}

/** What the script reads: never run, only read. */
function data(at: Drawn, extra: Record<string, unknown>): string {
  const json = JSON.stringify({
    base: at.base,
    collections: collectionsOf(at.set).map((one) => ({ id: one.id, title: one.title })),
    ...extra,
  }).replace(/</g, "\\u003c");
  return `<script type="application/json" id="docs-data">${json}</script>`;
}

function head(at: Drawn, title: string, noindex: boolean): string {
  const { frame, app } = at;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${noindex || at.notice ? '\n<meta name="robots" content="noindex">' : ""}
<title>${escapeHtml(title === app.title ? app.title : `${title} · ${app.title}`)}</title>
<link rel="stylesheet" href="${attr(frame.themeHref)}">
<link rel="stylesheet" href="/_platform/docs.css">${iconLinks(frame.iconsHref)}
<script src="/_platform/docs.js" defer></script>
</head>`;
}

function shell(
  at: Drawn,
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

function draw(at: Drawn, path: string, tree: Root): string {
  const { set } = at;
  const folder = () =>
    folderItems(set.nav, path).flatMap((item) => {
      const to = item.type === "page" ? item : (item.index ?? firstOf(item));
      if (!to) return [];
      return [
        {
          title: item.title,
          href: `${at.base}${to.url}`,
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
      href: `${at.base}${urlOf(term.path)}`,
      page: set.pages.get(term.path)?.frontmatter.title ?? term.path,
    }));
  return renderHtml(asDirectory(path, tree), {
    profile: "docs",
    // The page's title is its first heading. What the author wrote as `#` comes under it.
    headingShift: 1,
    folder,
    glossary,
    link: (writtenHref) => {
      if (linkKind(writtenHref) !== "relative") return undefined;
      const target = resolveLink(set, path, writtenHref);
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
}

function crumbOf(set: DocSet, path: string): string {
  return trailOf(set.nav, path)
    .filter((folder) => folder.id !== "")
    .map((folder) => folder.title)
    .join(" › ");
}

function feedbackOf(at: Drawn, path: string): string {
  if (!at.feedback) return "";
  if (at.feedback.said(path)) {
    return '<p class="feedback" id="feedback" role="status">Thank you for saying.</p>';
  }
  const disabled = at.feedback.recording ? "" : " disabled";
  return `<form class="feedback" id="feedback" method="post" action="${href(at, "_feedback")}" data-feedback>
<span>Was this page helpful?</span>
<input type="hidden" name="page" value="${attr(path)}">
<label class="hp" aria-hidden="true">Leave empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
<span class="choices"><button class="button" type="submit" name="helpful" value="yes"${disabled}>${icon("thumbs-up", 14)}<span>Yes</span></button><button class="button" type="submit" name="helpful" value="no"${disabled}>${icon("thumbs-down", 14)}<span>No</span></button></span>
</form>`;
}

/** One page of the app, drawn. The home page is drawn as a home page. */
export function docPage(at: Drawn, path: string): string {
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
            ? `<a href="${href(at, before.url)}"><small>${icon("chevron-left", 14)}Previous</small>${escapeHtml(before.title)}</a>`
            : ""
        }${
          after
            ? `<a class="next" href="${href(at, after.url)}"><small>Next${icon("chevron-right", 14)}</small>${escapeHtml(after.title)}</a>`
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
            return `<li>${to ? `<a href="${href(at, to.url)}">${escapeHtml(folder.title)}</a>` : escapeHtml(folder.title)}</li>`;
          })
          .join("")}</ol>`
      : "";
  const { title, description } = entry.frontmatter;
  const updated = entry.updated ? new Date(entry.updated) : undefined;
  return shell(at, {
    title,
    current: path,
    collection,
    toc,
    data: { page: { title, url: urlOf(path), crumb: crumbOf(set, path) } },
    main: `${tocbar}<header class="lead">${crumbs}<h1>${escapeHtml(title)}</h1>${
      description ? `<p>${escapeHtml(description)}</p>` : ""
    }<div class="actions"><button class="button" type="button" data-copy="${href(at, `${urlOf(path) || "index"}.md`)}" hidden>${icon("copy", 14)}<span>Copy as Markdown</span></button><button class="button" type="button" data-copy="link" hidden>${icon("link", 14)}<span>Copy link</span></button></div></header>
<article class="vd-doc">${body}</article>
<footer class="foot">${feedbackOf(at, path)}${
      updated && !Number.isNaN(updated.getTime())
        ? `<p class="updated">Last updated <time datetime="${attr(updated.toISOString())}">${DATE.format(updated)}</time></p>`
        : ""
    }${pager}</footer>`,
  });
}

/** The app's home: what it is, a way to search, its collections and what changed last. */
export function homePage(at: Drawn): string {
  const { set, app } = at;
  const home = set.pages.get("index");
  const title = home?.frontmatter.title ?? app.title;
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
                ? `<a href="${href(at, to.url)}">${escapeHtml(one.title)}</a>`
                : escapeHtml(one.title)
            }</h3>${one.description ? `<p>${escapeHtml(one.description)}</p>` : ""}${
              listed.length > 0
                ? `<ul>${listed.map((page) => `<li><a href="${href(at, page.url)}">${escapeHtml(page.title)}</a></li>`).join("")}</ul>`
                : ""
            }${to ? `<a class="more" href="${href(at, to.url)}">${all.length} ${all.length === 1 ? "page" : "pages"} →</a>` : ""}</section></li>`;
          })
          .join("")}</ul>`
      : "";
  const recent =
    dated.length > 0
      ? `<h2 id="recent">Recently updated</h2><ul class="recent">${dated
          .slice(0, 5)
          .map((one) => {
            const when = new Date(one.updated as string);
            return `<li><a href="${href(at, urlOf(one.path))}"><span class="what"><b>${escapeHtml(one.frontmatter.title)}</b>${
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
      return to ? `<a href="${href(at, to.url)}">${escapeHtml(one.title)}</a>` : "";
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
<footer class="sitefoot"><p>${escapeHtml(app.title)}</p></footer>
${data(at, { collection: "" })}
</body>
</html>
`;
}

/** What a search of the app found. A page of its own, so that search needs no script. */
export function searchPage(at: Drawn, query: string, hits: readonly SearchHit[]): string {
  const asked = query.trim();
  const found =
    asked === ""
      ? '<p class="muted">Type what you are looking for.</p>'
      : hits.length === 0
        ? `<p class="muted">Nothing here matches “${escapeHtml(asked)}”.</p>`
        : `<ul class="results">${hits
            .map(
              (hit) =>
                `<li><a href="${href(at, hit.url)}">${escapeHtml(hit.title)}</a><p>${escapeHtml(hit.description || hit.excerpt)}</p></li>`,
            )
            .join("")}</ul>`;
  return shell(at, {
    title: asked === "" ? "Search" : `Search: ${asked}`,
    noindex: true,
    main: `<header class="lead"><h1>Search</h1>${asked === "" ? "" : `<p>${hits.length} ${hits.length === 1 ? "page" : "pages"} for “${escapeHtml(asked)}”</p>`}</header>
<form class="search-form" action="${href(at, "_search")}" method="get" role="search"><input type="search" name="q" aria-label="Search ${attr(at.app.title)}" placeholder="Search" value="${attr(asked)}"><button type="submit">Search</button></form>
${found}`,
  });
}

/** What the search dialog is answered with: pages, the places on each, and where each page is. */
export function searchAnswer(
  at: Pick<Drawn, "set">,
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
export function notFoundPage(at: Drawn): string {
  return shell(at, {
    title: "Not found",
    noindex: true,
    main: `<header class="lead"><h1>There is no page here</h1><p>It may have been moved or removed.</p></header>
<p><a href="${attr(at.base)}">Go to the first page</a>, or <a href="${href(at, "_search")}" data-search>search</a>.</p>`,
  });
}
