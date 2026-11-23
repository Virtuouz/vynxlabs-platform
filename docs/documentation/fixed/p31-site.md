# p31-site

The owner's four changes of 2026-11-24 to the shared renderer. Commits: "Phase 31: pictures open larger, tables stack and stripe, inline code stands out, the phone menu slides from the right", and the follow-up that wraps a stacked cell's pieces in one value.

## 1. Pictures open larger
- `packages/markup/src/render.ts` `zoomable()`: every picture (`![]()` and `::screenshot`, a light/dark pair as one button) is `<button type="button" class="vd-zoom" data-vd-zoom aria-haspopup="dialog">`. A picture inside a link is left to the link (`inLink`, also in `react.ts`).
- Served sites, tenant docs sites and the static export: `packages/markup/src/enhance.ts` (the page script every host carries, so no new file or request) builds one `<dialog class="vd-lightbox">` (showModal: focus trapped, Escape cancels, closes by the close button or a press outside, focus back to the picture). The picture grows from its place and goes back (Web Animations, no inline style, so the strict CSP stands); no motion under `prefers-reduced-motion`. It shows the look in view of a pair, alt text as caption.
- Console help panel and every other `Doc`: `packages/ui/src/DocZoom.tsx`, opened from `Doc.tsx` by a delegated press on `[data-vd-zoom]`; same elements and the same stylesheet (`style.ts`). Both the kit's drawing and `asServed`.
- Tests: `packages/markup/src/markup.test.ts` ("a picture opens larger"), `packages/markup/src/zoom.dom.test.ts` (open, caption, Esc/button/outside, focus return, Tab trap, pair, reduced motion), `packages/ui/src/docZoom.test.tsx`.
- Siblings: every `Doc` caller (help panel, widget text, previews) gets it through `Doc`; `Picture` in `Doc.tsx` takes `zoom`. A page without script shows the button but it does nothing (the page works; the cursor says zoom).

## 2. Phone drawer from the right
`packages/docs-site/src/css.ts`: `.side` is at the right edge, `translateX(102%)`, border on its left; open and close animate as before (reduced motion already collapses transitions). Focus handling in the script unchanged. Test: `packages/docs-site/src/styles.test.ts`. The close button stays top right. All sites share this stylesheet.

## 3. Tables
- `render.ts` table case: each body cell gets `data-label` from its column's header (as table-saw's `labelBodyCells`); a cell of several pieces is wrapped in `<span class="vd-cell">` (table-saw's own wrapper) so the stacked grid gets one value.
- `style.ts`: `.vd-table` is a size container; under 40rem of container width (table-saw's 39.9375em) the header row is visually hidden, rows are blocks and each cell is a label/value grid from `attr(data-label)`. Zebra: `tbody tr:nth-child(even)` on `--vd-stripe`, 6% of the page's ink, so it follows light, dark and a tenant's theme.
- Tests: `markup.test.ts` ("a table stacks"), contrast in `packages/ui/src/docColors.test.ts` (ink, muted and link text on the stripe over canvas and surface, both looks, at least 4.5:1).

## 4. Inline code
`style.ts` and `Doc.tsx` (its own edge rule removed): `--vd-code-bg` 11% ink, `--vd-code-ink` the ink, `--vd-code-line` 26% ink, edge by inset shadow; not the sunken ground of a block (which is almost the canvas in dark). Code in the site's descriptions and cards (`css.ts`) got the same. Tests: `markup.test.ts`, `styles.test.ts`, `docColors.test.ts` (4.5:1 on the chip, chip at least 1.2:1 from the ground).

## Tenant golden pages changed on purpose
`packages/docs-site/golden/page-components.html` and `page-components-feedback.html` (images and tables), and `packages/markup/fixtures/components.html`, `hostile.html`, `markdown.html` (button around images, `data-label` on cells). No other golden changed; `docs-apps.test.ts` still matches its `<img>` strings.

## Walk (throwaway instance p31site on 8096, stand-in screenshots, then dropped)
/docs/console/reference/screens/data/tables at 390 and 1440, light and dark: table stacked at 390 with stripes in both looks, wide table at 1440 striped, inline code chips visible in dark, image opens by Enter, closes by Escape, focus returns to the picture, no console errors; drawer mid-slide came from the right. Screenshots in the lane scratchpad `shots/`. Not walked: the console help panel in a browser (covered by `docZoom.test.tsx` and the Help tests only), 768 px, reload of an open modal, the keyboard trap in a real dialog beyond Tab on one button.

## Found
- Code and tests written in the same pass for the contrast and zoom tests; seen failing before the change only for the markup tests and the first run of the ui zoom test (the contrast test had no property to read before).
- `packages/markup/dist/markup.test.js` is a stale built test file that fails (`dist/prism.ts` missing); not touched.

## Docs and changelog lines
Docs: "A screenshot or image can be pressed to see it larger." "On a phone a table becomes a list of label and value pairs." Changelog: the four changes above.
