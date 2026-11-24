import { DOC_CSS, DOC_DARK_CSS } from "@volvel/markup";

/**
 * The stylesheet of a docs app: its frame, then the page's own, on the
 * theme's tokens. The page's column is always as wide, whatever is beside it:
 * the navigation and the page's contents keep their places when they are empty.
 */
export const DOCS_CSS = `
*, *::before, *::after { box-sizing: border-box; }
/* Body text is 16px on a phone and grows with the window to 20px from about 1440px wide; the page's title, lead, contents and headings are steps of it. */
html { scroll-behavior: smooth; --top: 0px; --body: clamp(1rem, 0.9rem + 0.45vw, 1.25rem); }
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
.side .version { margin: 0; font-size: 12px; color: var(--vx-ink-subtle); }
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

/* On a phone, the navigation is a sheet that slides in from the right, where its button is, over the page: by its address without script, by a class with it. */
@media (max-width: 1023.98px) {
  .side {
    position: fixed; inset: 0 0 0 auto; z-index: 40; width: min(320px, 88vw); overflow-y: auto; padding-top: 12px;
    border-left: 1px solid var(--vx-line); box-shadow: 0 24px 64px rgb(0 0 0 / 0.35);
    transform: translateX(102%); visibility: hidden;
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
  .toc { display: block; position: sticky; top: 0; align-self: start; max-height: 100vh; overflow-y: auto; padding: 56px 0 24px; font-size: calc(var(--body) * 0.8125); }
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
.crumbs li { display: flex; align-items: center; min-width: 0; }
.crumbs li:not(:last-child)::after { content: ""; display: inline-block; flex: none; width: 6px; height: 6px; margin: 0 4px 0 10px; border-top: 1.5px solid currentColor; border-right: 1.5px solid currentColor; transform: rotate(45deg) translateY(-2px); opacity: 0.7; }
.eyebrow { margin: 0 0 6px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--vx-action); }
.lead h1 { margin: 0 0 8px; font-size: calc(var(--body) * 2.4); line-height: 1.15; letter-spacing: -0.02em; }
/* A name with no break in it (a package path such as @volvel/widgets/action) breaks at the edge of the page, never widens it. */
.lead h1, .lead > p, .home h1, .home h2, .all-pages h2, .card h3, .related h3, .types h2, .related h2, .eyebrow, .crumbs a,
.lead code, .card code, .recent code, .results code, .switcher code { overflow-wrap: anywhere; }
.lead > p { margin: 0; color: var(--vx-ink-muted); font-size: calc(var(--body) * 1.15); line-height: 1.5; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.button {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 1px solid var(--vx-line);
  border-radius: 8px; background: var(--vx-surface); color: var(--vx-ink-muted); font-size: 13px; text-decoration: none; cursor: pointer;
}
.button:hover { color: var(--vx-ink); border-color: var(--vx-line-strong, var(--vx-line)); }
.lead { padding-bottom: 24px; margin-bottom: 28px; border-bottom: 1px solid var(--vx-line); }
.vd-doc { font-size: var(--body); line-height: 1.65; }
/* Prose keeps to a line a reader can follow, whatever the window; tables, code and pictures use the page's width. */
.vd-doc > :is(p, ul, ol, blockquote, h1, h2, h3, h4, h5, h6) { max-width: 72ch; }
.foot { margin-top: 56px; display: grid; gap: 16px; }
.updated, .since { margin: 0; font-size: 13px; color: var(--vx-ink-muted); }
.pager { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.pager a {
  display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border: 1px solid var(--vx-line); border-radius: 12px;
  background: var(--vx-surface); color: var(--vx-ink); text-decoration: none; font-weight: 600; min-width: 0; overflow-wrap: anywhere;
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
.toc li[data-level="2"] a, .tocbar li[data-level="2"] a { padding-left: 26px; }
.toc li[data-level="3"] a, .tocbar li[data-level="3"] a { padding-left: 38px; }
.toc li a:hover { color: var(--vx-ink); }
.toc li a[aria-current="true"], .tocbar li a[aria-current="true"] { border-left-color: var(--vx-action); color: var(--vx-action); }
.toc .top { display: inline-flex; align-items: center; gap: 6px; margin-top: 18px; color: var(--vx-ink-muted); text-decoration: none; }
.tocbar { position: sticky; top: 56px; z-index: 15; margin: -20px -18px 20px; background: var(--vx-canvas); border-bottom: 1px solid var(--vx-line); font-size: calc(var(--body) * 0.875); }
.tocbar > summary { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 18px; list-style: none; cursor: pointer; color: var(--vx-ink-muted); }
.tocbar > summary::-webkit-details-marker { display: none; }
.tocbar .ring { width: 16px; height: 16px; flex: none; border-radius: 50%; background: conic-gradient(var(--vx-action) var(--read, 0%), var(--vx-line) 0); -webkit-mask: radial-gradient(circle, transparent 5px, #000 5.5px); mask: radial-gradient(circle, transparent 5px, #000 5.5px); }
.tocbar .now { flex: 1; min-width: 0; overflow: hidden; color: var(--vx-ink); white-space: nowrap; text-overflow: ellipsis; }
.tocbar ul { margin: 0 18px 12px; }
@media (min-width: 1024px) { .tocbar { top: 0; margin: -48px -40px 32px; } .tocbar > summary { padding: 0 40px; } .tocbar ul { margin: 0 40px 12px; } }

.vd-doc .anchor {
  margin-left: 0.4em; font-size: 0.8em; font-weight: 400; font-variant-caps: normal; letter-spacing: 0; text-decoration: none;
  color: var(--vx-ink-muted); opacity: 0; transition: opacity 0.12s;
}
.vd-doc :is(h2, h3, h4, h5, h6):hover > .anchor, .vd-doc .anchor:focus-visible { opacity: 1; }
.vd-doc .anchor:hover { color: var(--vx-action); }
/* A touch screen has no hover to reveal it with. */
@media (hover: none) { .vd-doc .anchor { opacity: 1; } }
.toast {
  position: fixed; left: 50%; bottom: 24px; z-index: 60; transform: translateX(-50%); padding: 8px 14px; border-radius: 999px;
  background: var(--vx-ink); color: var(--vx-canvas); font-size: 14px; pointer-events: none;
}
.toast:empty { display: none; }

/* Light, dark or the system's: drawn hidden, shown by the script, which is what keeps the choice. */
.themes { display: inline-flex; flex: none; gap: 2px; padding: 2px; border: 1px solid var(--vx-line); border-radius: 10px; background: var(--vx-surface); }
.themes[hidden] { display: none; }
.themes button { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--vx-ink-muted); cursor: pointer; }
.themes button:hover { color: var(--vx-ink); }
.themes button[aria-pressed="true"] { background: var(--vx-action-soft); color: var(--vx-action); }
.sidefoot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding: 0 8px; }
/* A phone has the one button that goes to the next choice; a wide screen the three. */
.themecycle[hidden] { display: none; }
.themecycle [data-shows] { display: none; }
.themecycle[data-current="system"] [data-shows="system"], .themecycle[data-current="light"] [data-shows="light"], .themecycle[data-current="dark"] [data-shows="dark"] { display: inline-grid; }
.themes:not([hidden]) { display: none; }
@media (min-width: 1024px) { .themes:not([hidden]) { display: inline-flex; } .themecycle:not([hidden]) { display: none; } }
.homebar .themes { margin-left: 8px; }

/* A description with code in it. */
.lead code, .card code, .recent code, .results code, .switcher code { padding: 0.05em 0.3em; border-radius: 4px; background: color-mix(in srgb, var(--vx-ink) 11%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vx-ink) 26%, transparent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }

/* Results of a search, as a page. */
.results { margin: 0; padding: 0; list-style: none; }
.results li { margin: 0 0 22px; }
.results a { font-weight: 600; font-size: 17px; text-decoration: none; }
.results p { margin: 2px 0 0; color: var(--vx-ink-muted); }
.results small { display: block; color: var(--vx-ink-muted); font-size: 13px; }
.all-pages { margin-top: 32px; }
.all-pages h2 { font-size: 15px; margin: 22px 0 6px; }
.all-pages ul { margin: 0; padding: 0; list-style: none; columns: 2 280px; }
.all-pages li { margin: 0 0 4px; break-inside: avoid; }
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
.types, .related { margin-top: 40px; }
.types h2, .related h2 { margin: 0 0 14px; font-size: 20px; }
.related { padding-top: 24px; border-top: 1px solid var(--vx-line); }
.related section { margin-top: 14px; }
.related h3 { margin: 0 0 4px; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--vx-ink-muted); }
.related ul { margin: 0; padding: 0; list-style: none; }
.related li a { display: block; padding: 4px 0; color: var(--vx-action); text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
.related li a:hover { text-decoration-thickness: 2px; }
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
.finder:modal { max-width: none; }
.finder::backdrop { background: rgb(0 0 0 / 0.45); }
.finder .bar { display: flex; align-items: center; gap: 10px; padding: 0 14px; height: 56px; border-bottom: 1px solid var(--vx-line); color: var(--vx-ink-muted); }
.finder input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--vx-ink); font: inherit; font-size: 16px; outline: none; }
.finder .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--vx-line); }
.finder .chips button { flex: none; height: 28px; padding: 0 10px; border: 1px solid var(--vx-line); border-radius: 999px; background: none; color: var(--vx-ink-muted); font-size: 13px; cursor: pointer; }
.finder .chips button[aria-pressed="true"] { border-color: var(--vx-action); background: var(--vx-action-soft); color: var(--vx-action); }
.finder .results { flex: 1; overflow-y: auto; }
.finder .list, .finder .list ul { margin: 0; padding: 6px; list-style: none; }
.finder .list ul { padding: 0; }
.finder .list:empty { padding: 0; }
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
.finder .none:empty { display: none; }
.finder .none a { color: var(--vx-action); }
.feedback-note { flex-basis: 100%; margin: 0; font-size: 13px; color: var(--vx-danger); }
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
${DOC_CSS}${DOC_DARK_CSS}`;
