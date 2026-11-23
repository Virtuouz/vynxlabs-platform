/**
 * The stylesheet for a page of documentation, wherever it is drawn: served as
 * a site, or shown in a console. It styles only what is inside an element of
 * class `vd-doc`, and takes its colors from custom properties, each with a
 * plain default, so whoever shows the page maps them onto a theme:
 *
 *   --vd-ink  --vd-muted  --vd-line  --vd-surface  --vd-sunken  --vd-action
 *   --vd-info-soft  --vd-success-soft  --vd-attention-soft  --vd-danger-soft
 *   --vd-info  --vd-success  --vd-attention  --vd-danger
 *   --vd-radius  --vd-font-code
 *
 * It names no font, loads nothing and holds no address.
 */
export const DOC_CSS = `
.vd-doc {
  color: var(--vd-ink, #1a1a1a);
  line-height: 1.6;
  overflow-wrap: break-word;
}
.vd-doc > :first-child { margin-top: 0; }
.vd-doc > :last-child { margin-bottom: 0; }
.vd-doc h1, .vd-doc h2, .vd-doc h3, .vd-doc h4, .vd-doc h5, .vd-doc h6 {
  margin: 1.8em 0 0.6em;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  scroll-margin-top: var(--vd-scroll-margin, 5rem);
}
.vd-doc h1 { font-size: 1.75em; }
.vd-doc h2 { font-size: 1.4em; }
.vd-doc h3 { font-size: 1.15em; }
.vd-doc h4, .vd-doc h5, .vd-doc h6 { font-size: 1em; }
.vd-doc p, .vd-doc ul, .vd-doc ol, .vd-doc blockquote, .vd-doc pre, .vd-doc figure { margin: 0 0 1em; }
.vd-doc ul, .vd-doc ol { padding-left: 1.5em; }
.vd-doc ul { list-style: disc; }
.vd-doc ol { list-style: decimal; }
.vd-doc li { margin: 0.2em 0; }
.vd-doc li > p { margin: 0 0 0.4em; }
.vd-doc li > ul, .vd-doc li > ol { margin: 0.2em 0 0; }
.vd-doc a { color: var(--vd-action, #1d4ed8); text-decoration: underline; text-underline-offset: 2px; }
.vd-doc strong { font-weight: 600; }
.vd-doc hr { margin: 2em 0; border: 0; border-top: 1px solid var(--vd-line, #dcdcdc); }
.vd-doc blockquote {
  padding-left: 1em;
  border-left: 3px solid var(--vd-line, #dcdcdc);
  color: var(--vd-muted, #5c5c5c);
}
.vd-doc img { max-width: 100%; height: auto; border-radius: var(--vd-radius, 6px); }
.vd-doc code, .vd-doc kbd {
  font-family: var(--vd-font-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 0.9em;
}
.vd-doc :not(pre) > code {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--vd-sunken, #f3f3f3);
}
.vd-doc pre {
  padding: 0.85em 1em;
  overflow-x: auto;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: var(--vd-radius, 6px);
  background: var(--vd-sunken, #f3f3f3);
  line-height: 1.5;
}
.vd-doc kbd {
  padding: 0.1em 0.4em;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--vd-surface, #fff);
  white-space: nowrap;
}
.vd-doc .vd-table { margin: 0 0 1em; overflow-x: auto; }
.vd-doc table { width: 100%; border-collapse: collapse; }
.vd-doc th, .vd-doc td {
  padding: 0.45em 0.75em;
  border-bottom: 1px solid var(--vd-line, #dcdcdc);
  text-align: left;
  vertical-align: top;
}
.vd-doc th { font-weight: 600; white-space: nowrap; }
.vd-doc .vd-align-left { text-align: left; }
.vd-doc .vd-align-center { text-align: center; }
.vd-doc .vd-align-right { text-align: right; }
.vd-doc .vd-tasks { padding-left: 0.25em; list-style: none; }
.vd-doc .vd-task input { margin-right: 0.35em; }

.vd-doc .vd-alert {
  --vd-tone: var(--vd-info, #2563eb);
  position: relative;
  margin: 0 0 1.25em;
  padding: 0.85em 1em 0.85em 3em;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: calc(var(--vd-radius, 6px) * 2);
  background: var(--vd-surface, #fff);
}
.vd-doc .vd-alert::before {
  content: "i";
  position: absolute;
  left: 1.05em;
  top: 0.95em;
  width: 1.25em;
  height: 1.25em;
  border: 1.5px solid var(--vd-tone);
  border-radius: 50%;
  color: var(--vd-tone);
  font-size: 0.85em;
  font-weight: 700;
  line-height: 1.1em;
  text-align: center;
}
.vd-doc .vd-alert::after {
  content: "";
  position: absolute;
  left: 0.55em;
  top: 0.75em;
  bottom: 0.75em;
  width: 2px;
  border-radius: 2px;
  background: var(--vd-tone);
}
.vd-doc .vd-alert > :last-child { margin-bottom: 0; }
.vd-doc .vd-alert-title { margin-bottom: 0.2em; font-weight: 600; }
.vd-doc .vd-alert-title ~ * { color: var(--vd-muted, #5c5c5c); }
.vd-doc .vd-alert-success { --vd-tone: var(--vd-success, #15803d); }
.vd-doc .vd-alert-success::before { content: "\\2713"; }
.vd-doc .vd-alert-warning { --vd-tone: var(--vd-attention, #b45309); }
.vd-doc .vd-alert-warning::before { content: "!"; }
.vd-doc .vd-alert-danger { --vd-tone: var(--vd-danger, #b91c1c); }
.vd-doc .vd-alert-danger::before { content: "\\00d7"; }

.vd-doc .vd-steps > ol { margin-bottom: 0; padding-left: 0; list-style: none; counter-reset: vd-step; }
.vd-doc .vd-steps { margin: 0 0 1em; }
.vd-doc .vd-steps > ol > li:last-child { padding-bottom: 0.25em; }
.vd-doc .vd-steps > ol > li {
  position: relative;
  margin: 0;
  padding: 0.15em 0 1.1em 2.75em;
  counter-increment: vd-step;
}
.vd-doc .vd-steps > ol > li:not(:last-child)::after {
  content: "";
  position: absolute;
  left: calc(0.875em - 0.5px);
  top: 2em;
  bottom: 0.15em;
  width: 1px;
  background: var(--vd-line, #dcdcdc);
}
.vd-doc .vd-steps > ol > li::before {
  content: counter(vd-step);
  position: absolute;
  left: 0;
  top: 0;
  width: 1.75em;
  height: 1.75em;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: 50%;
  background: var(--vd-sunken, #f3f3f3);
  font-size: 0.85em;
  font-weight: 600;
  line-height: 1.75em;
  text-align: center;
}

.vd-doc .vd-tabs { margin: 0 0 1.25em; }
.vd-doc .vd-tabs.vd-tabs-on {
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: calc(var(--vd-radius, 6px) * 2);
  background: var(--vd-surface, #fff);
}
.vd-doc .vd-tabs-on > .vd-tablist { padding: 0 0.5em; }
.vd-doc .vd-tabs-on .vd-tab-body { padding: 1em 1.25em; }
.vd-doc .vd-tab-label { margin: 1em 0 0.4em; font-size: 1em; font-weight: 600; }
.vd-doc .vd-tab-body > :last-child { margin-bottom: 0; }
.vd-doc .vd-tablist {
  display: flex;
  gap: 0.25em;
  overflow-x: auto;
  border-bottom: 1px solid var(--vd-line, #dcdcdc);
}
.vd-doc .vd-tab-button {
  margin-bottom: -1px;
  padding: 0.5em 0.85em;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--vd-muted, #5c5c5c);
  font: inherit;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.vd-doc .vd-tab-button[aria-selected="true"] {
  border-bottom-color: var(--vd-action, #1d4ed8);
  color: var(--vd-action, #1d4ed8);
}

.vd-doc .vd-details {
  margin: 0 0 1.25em;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: calc(var(--vd-radius, 6px) * 2);
  background: var(--vd-surface, #fff);
}
.vd-doc .vd-details > summary { padding: 0.6em 1em; font-weight: 500; cursor: pointer; }
.vd-doc .vd-details-body { padding: 0 1em 0.75em; }
.vd-doc .vd-details-body > :last-child { margin-bottom: 0; }

.vd-doc .vd-field code { font-weight: 600; }
.vd-doc .vd-screenshot img { border: 1px solid var(--vd-line, #dcdcdc); }
.vd-doc .vd-screenshot-missing { color: var(--vd-muted, #5c5c5c); font-style: italic; }
.vd-doc .vd-unavailable { color: var(--vd-muted, #5c5c5c); font-style: italic; }

.vd-doc .vd-file-tree {
  margin: 0 0 1em;
  padding: 0.75em 1em;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: var(--vd-radius, 6px);
  background: var(--vd-sunken, #f3f3f3);
  font-family: var(--vd-font-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 0.9em;
}
.vd-doc .vd-file-tree ul { margin: 0; padding-left: 1.25em; list-style: none; }
.vd-doc .vd-file-tree > ul { padding-left: 0; }

.vd-doc .vd-pages {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
  gap: 0.75em;
  margin: 0 0 1.25em;
  padding: 0;
  list-style: none;
}
.vd-doc .vd-pages li { margin: 0; }
.vd-doc .vd-pages a, .vd-doc .vd-pages li > span {
  display: flex;
  flex-direction: column;
  gap: 0.2em;
  height: 100%;
  padding: 0.85em 1em;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: calc(var(--vd-radius, 6px) * 2);
  background: var(--vd-surface, #fff);
  color: inherit;
  text-decoration: none;
}
.vd-doc .vd-pages a:hover { border-color: var(--vd-action, #1d4ed8); }
.vd-doc .vd-pages-title { font-weight: 600; }
.vd-doc .vd-pages-folder .vd-pages-title::after { content: " \\2192"; color: var(--vd-muted, #5c5c5c); }
.vd-doc .vd-pages-text { color: var(--vd-muted, #5c5c5c); font-size: 0.9em; }

.vd-doc .vd-glossary { margin: 0 0 1.25em; }
.vd-doc .vd-glossary-group { display: grid; grid-template-columns: 2.5em minmax(0, 1fr); gap: 0 1em; padding: 0.75em 0; border-top: 1px solid var(--vd-line, #dcdcdc); }
.vd-doc .vd-glossary-group:first-child { border-top: 0; }
.vd-doc .vd-glossary-letter { margin: 0; font-size: 1.4em; font-weight: 600; line-height: 1.2; color: var(--vd-muted, #5c5c5c); }
.vd-doc .vd-glossary dl { margin: 0; }
.vd-doc .vd-glossary-item { padding: 0.35em 0 0.6em; scroll-margin-top: var(--vd-scroll-margin, 5rem); }
.vd-doc .vd-glossary-item:target { border-radius: var(--vd-radius, 6px); background: var(--vd-info-soft, #eef4ff); }
.vd-doc .vd-glossary dt { font-weight: 600; }
.vd-doc .vd-glossary dd { display: flex; flex-direction: column; gap: 0.15em; margin: 0.1em 0 0; }
.vd-doc .vd-glossary-also, .vd-doc .vd-glossary-page { font-size: 0.875em; color: var(--vd-muted, #5c5c5c); }

.vd-doc .vd-mermaid {
  position: relative;
  margin: 0 0 1.25em;
  overflow: hidden;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: calc(var(--vd-radius, 6px) * 2);
  background: var(--vd-surface, #fff);
}
.vd-doc .vd-mermaid > pre { margin: 0; border: 0; border-radius: 0; }
.vd-doc .vd-mermaid-drawn { touch-action: pan-x pan-y; cursor: grab; }
.vd-doc .vd-mermaid-drawn.vd-dragging { cursor: grabbing; }
.vd-doc .vd-mermaid-drawn > svg { display: block; width: 100%; height: 100%; max-width: none; }
.vd-doc .vd-mermaid-controls {
  position: absolute;
  right: 0.6em;
  bottom: 0.6em;
  display: flex;
  gap: 0.25em;
  padding: 0.2em;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: var(--vd-radius, 6px);
  background: var(--vd-surface, #fff);
}
.vd-doc .vd-mermaid-controls button {
  display: inline-grid;
  place-items: center;
  width: 1.9em;
  height: 1.9em;
  padding: 0;
  border: 0;
  border-radius: calc(var(--vd-radius, 6px) - 2px);
  background: none;
  color: var(--vd-muted, #5c5c5c);
  cursor: pointer;
}
.vd-doc .vd-mermaid-controls button:hover { background: var(--vd-sunken, #f3f3f3); color: var(--vd-ink, #1a1a1a); }
.vd-doc .vd-mermaid-hint {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 0.45);
  color: #fff;
  font-weight: 500;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.vd-doc .vd-mermaid-hint.vd-on { opacity: 1; }
.vd-doc .vd-mermaid-error { margin: 0; padding: 0.6em 1em; border-bottom: 1px solid var(--vd-line, #dcdcdc); color: var(--vd-danger, #b91c1c); font-size: 0.9em; }

.vd-doc .vd-term { position: relative; display: inline-block; }
.vd-doc .vd-term-word {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline dashed;
  text-decoration-color: var(--vd-muted, #5c5c5c);
  text-underline-offset: 4px;
  cursor: help;
}
/* A hidden tip takes no room: placed from its term, one near the right edge would make a phone's
   page scroll sideways (the phase 21 walk, on a phone). It still fades in where display can. */
.vd-doc .vd-term-tip {
  position: absolute;
  z-index: 10;
  top: 100%;
  left: 0;
  display: none;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 0.15s ease, transform 0.15s ease, display 0.15s allow-discrete;
  width: max-content;
  max-width: min(22rem, 80vw);
  margin-top: 0.35em;
  padding: 0.6em 0.8em;
  border: 1px solid var(--vd-line, #dcdcdc);
  border-radius: var(--vd-radius, 6px);
  background: var(--vd-surface, #fff);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
  font-size: 0.9em;
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}
.vd-doc .vd-term:not(.vd-term-on):hover .vd-term-tip,
.vd-doc .vd-term:not(.vd-term-on):focus-within .vd-term-tip,
.vd-doc .vd-term-open .vd-term-tip {
  display: block;
  opacity: 1;
  transform: none;
}
@starting-style {
  .vd-doc .vd-term:not(.vd-term-on):hover .vd-term-tip,
  .vd-doc .vd-term:not(.vd-term-on):focus-within .vd-term-tip,
  .vd-doc .vd-term-open .vd-term-tip {
    opacity: 0;
    transform: translateY(-2px);
  }
}
/* On a phone an open tip is held inside the screen, along its foot, whatever its term's place. */
@media (max-width: 40rem) {
  .vd-doc .vd-term-tip {
    position: fixed;
    top: auto;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    width: auto;
    max-width: none;
  }
}
.vd-doc .vd-details > summary { transition: color 0.15s ease; }
.vd-doc .vd-tab-button { transition: color 0.15s ease, border-color 0.15s ease; }
@media (prefers-reduced-motion: reduce) {
  .vd-doc *, .vd-doc *::before, .vd-doc *::after { transition-duration: 0.01ms !important; }
}
`;
