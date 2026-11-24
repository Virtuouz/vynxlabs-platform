# Phase 30 walk: r-prism (Prism highlighting, D67)

Instance http://localhost:8091. Shots: ~/.local/share/volvel-walk/shots30/r-prism/. My names: docs site `rprism` (pages `rprism/index`, `rprism/code`), app `rprism-site`, binding `bindings/rprism-site` (anonymous, so guests can read it), in Fernhill Sandbox, deployed by path only.

## Right
- /docs (develop/how-to/writing-a-widget, reference/sdk/sdk, reference/cli, reference/docs/frontmatter), 1440 and 390, light and dark: tokens coloured, no page overflow, code scrolls inside its block, no script errors.
- Tenant site as guest (/apps/fernhill/sandbox/rprism-site/code), 1440/390, light/dark: ts, `diff-ts` (- red, + green), `ts/1,3-5` (lines 1,3,4,5 marked), sql coloured; `foo` plain; long line scrolls inside. Shots guest-*.png.
- Console Markdown editor preview and read view (Sam; account-menu colour choice dark/light under both system schemes, and system): same colours, 1440 and 390, no overflow. Shots c-read-*, c-preview-*.
- Help panel: its only fence (Building an interface) has no language, so it is plain; fine at 1440/390, light/dark.

## Wrong
1. Light mode: string and `inserted` colour #15803d on the code background #eef1f5 is 4.43:1, under 4.5. Others: function 4.73, keyword 5.58, number 6.45, comment 5.90, deleted 5.71. Dark: all 7.3 or more. `packages/markup/src/style.ts:388` (`--vd-tok-string`).
2. Marked line: the 2px left bar is drawn on the first letter (`const` starts at the bar, no padding); also gaps between marked rows (guest-1440-light.png). `style.ts:397`.

## Not walked
Help panel with a highlighted block (none exists in the help content); signed-in member on the tenant site (guest only); keyboard/reload on code blocks.
Note: Maya's console stays light under a dark system (her saved theme choice), so I used Sam, left on System.
