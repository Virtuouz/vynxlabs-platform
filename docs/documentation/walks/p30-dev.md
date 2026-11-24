# Walk p30 dev: `volvel dev` for interface and docs apps (D64)

Instance http://localhost:8091, CLI `tree30/packages/cli/dist/bin.js`, key made as Maya (Account > API keys), workspace `fernhill/devwalk` (dev, made for this walk, repository deployed and seeded). Scratch repository: a copy of examples/fernhill outside the repo. Servers on 5201-5205, all stopped by pid. Screenshots: ~/.local/share/volvel-walk/shots30/dev/.

## Right
- Interface (`operations`, port 5201): draws with the workspace's data (406 visits, tabs, stats) at 1440, 768, 390, light and dark (ops-*-*.png). Reload keeps the page.
- Editing src/operations.ts reloads the page in about 1.3 s with the new words (ops-edited.png).
- Docs (`handbook`, 5202): pages, collections, Cmd/Ctrl+K search with grouped results and kind filters, /_search page, 404 page, edit of index.md reloads (hb-*.png). Notice across the top says what is not drawn: product terms, readers' answers, diagrams.
- Unknown app: refused naming "front-desk (files), handbook (docs), my-account (interface), operations (interface), performance (interface), pet-portal (files)".
- No name, several apps: "Say which app: ..." with the same list (no TTY and with one: it refuses with the list, it does not prompt).
- Content policy: strict sends a CSP; in the browser an inline script and a fetch to another site are blocked on 5201 and 5202 (3 CSP console messages each); with `--no-strict` there is no CSP header and both run (5203, 5204); the start message says so.
- `node scripts/release-check.mjs` in tree30: 9 packages pack, nothing published; it checks `dist/screens/index.html` is in the packed CLI (release-check.mjs:47), and `screensDirectory` finds it beside the bundle (dev-site.ts:85-87).

## Wrong or to weigh
1. Stale words: `volvel dev --help` (packages/cli/src/commands.ts:101) and docs/sdk-guide.md:288 still say an interface needs SCREENS_DIR, but the packed CLI carries the runtime now. docs/documentation/fixed/p30-m1b.md "Left" says the same.
2. 404 for `/help/fields.json` on every interface load (packages/screens/runtime/main.tsx:174 asks, dev-site.ts does not answer). Silent for the user, but one red line in the browser console. Field help is not drawn locally and the notice does not say so (interfaces have no notice).
3. Docs search dialog at 390 wide (hb-390-search.png): the panel is about 352 px and sits left, leaving a strip of page at the right; the kind chips are cut ("Expl"). The docs-site renderer, not the CLI, so the deployed site probably shows it too.
4. "Asks which": it names the apps and stops; it does not prompt. Fine if that is the design.

## Not walked
- Files-kind app (`front-desk`) with `volvel dev` (outside this slice).
- Offline / key-revoked states. Widget actions that write to the instance.
- Playwright `networkidle` never settles on these pages because of the reload event stream (expected).
