# Phase 30, lane prism: Prism.js replaces the own highlighter (D67)

## Built

- `packages/markup/src/highlight.ts`: `highlightCode(code, lang, marks?)` now tokenizes with Prism (`Prism.tokenize`, walked into the `Drawn` tree, never HTML read back) and emits `token keyword`-style classes. Same hook (`RenderOptions.highlight`, `packages/markup/src/render.ts` `codeBlock`), so docs-site (`packages/docs-site/src/render.ts`), `/docs`, the export, the help panel and every `Doc` (`packages/ui/src/Doc.tsx`) get it unchanged. No script, no CSP change. An unknown language, `mermaid`, and code over 20,000 characters draw as before.
- `packages/markup/src/prism.ts`: explicit imports of prism-core and markup (html, xml, svg), css, clike, javascript, jsx, typescript, tsx, json, yaml, bash (sh, shell), sql, diff, markdown. Chosen from the fence languages in `packages/docs/content`: sh, ts, yaml, md, tsx, json, text. Nothing is loaded on demand (that loader uses `fs`).
- Aliases: a small table in `highlight.ts` (`ALIASES`, `resolveLanguage`), written from `prismjs/components.json` for the imported languages plus `jsonc`, `json5`, `zsh` (the old highlighter knew them). A test reads components.json and checks every alias resolves; the JSON is not read at runtime.
- `packages/markup/src/prism-manual.ts`: sets `globalThis.Prism.manual = true` before Prism loads, so importing the markup in the console never highlights the page. `package.json` `sideEffects` now lists `dist/prism.js` and `dist/prism-manual.js` (it was `false`, which would have let a bundler drop them). `prismjs-modules.d.ts` types the component imports.
- Learned from the 11ty plugin, both compatible with the fence syntax (the first word of the info string; `lang/...` had no meaning before, the `data-lang` and class were simply left off):
  - `diff-ts` etc.: a line starting `+` or `-` is wrapped in `token inserted` / `token deleted`, the rest of the line drawn in the language; `@@` and `---`/`+++` lines in the diff grammar. Done by hand, not the diff-highlight DOM plugin.
  - `ts/1,3-5`: lines marked as `<mark class="vd-line vd-line-mark">`. A token across lines is closed and reopened per line, so spans always balance (stronger than the plugin's skip-on-mismatch). A bad spec is no marks. Not taken: the plugin's `lang/added/removed` form (`diff-` says that). `code-tabs` labels use the language before the slash.
- CSS: `DOC_CSS` / `DOC_DARK_CSS` (`packages/markup/src/style.ts`) now color `.token.*` (keyword, string, number, comment, property/tag, function/builtin/variable, inserted, deleted, mark) from the same `--vd-tok-*` tokens, plus `--vd-tok-deleted` dark value. No `hljs` is left.

## Tests (each seen failing first)

- `packages/markup/src/markup.test.ts` (highlighted code): token classes, escaping, HTML and React parity, languages, aliases, diff, marks and span balance, bad marks, unknown plain, alias table against components.json, CSS.
- `packages/markup/src/highlight.dom.test.ts` (happy-dom): importing the markup leaves a page's `pre code` untouched and `Prism.manual` is true. Seen failing with `prism-manual` emptied (Prism added `class` and `tabindex` to the page).
- Updated: `packages/docs-site/src/export.test.ts`, `packages/ui/src/docs.test.tsx`, `apps/control-plane/src/product-docs.test.ts` (class names; this last one needs `pnpm --filter @volvel/docs build`, not run here).
- Goldens changed on purpose: `packages/docs-site/golden/page-components.html` and `page-components-feedback.html`, only the `js` block (Prism also marks operators and punctuation). No new golden page: the fixture is shared; diff and marks are tested in markup.

## Console bundle

Prism sits in the `markdownKnowledge` chunk (218 KB). The imported files are about 38 KB minified and 14 KB gzipped; no baseline build was made (no stash allowed). `apps/console` `vite build` succeeds; the help step stops without a docs build, as in any fresh worktree.

## Left

- Output is more verbose than the old one (operator and punctuation spans).
- Walk: help panel and a tenant docs site, light and dark, 390 px: token contrast on the sunken background, a marked line, a `diff-ts` block.
