# Fixed: lane t2-docs (docs system, and docs that say what is not so)

No migration. Contract: none by me (the app kind text of DOC-06 came from the phase branch). Each test below was seen failing before its fix. `C/` = `apps/console/src/`, `CP/` = `apps/control-plane/src/`.

## Already done in the phase branch (merged first, my duplicate work dropped)
- **DOC-02** `bad8b59f` (Doc passes every option on). **DOC-06, DOC-08, DOC-09** `249a7a53` (`buildDocs` in `kernel/docs/product.ts`, `issues` on `GET /docs`, banner on the Documentation screen, the app kind's feedback text). I wrote the same four fixes first, saw them fail, then took the phase branch's on conflict. What is mine on top: test `DOC-08 a draft preview, the terms ...` in `CP/docs-apps.test.ts` (a draft page whose term the product owns is not drawn in the `_draft` preview, and not in `/terms`; it failed before the shared helper).

## DOC-10 pictures cached for a year
`CP/app.ts` static `setHeaders`: `immutable` only for a file under `assets/` whose name carries a hash (`-xxxxxxxx.ext`) and is not under `help/`. Every built console asset matches. Test `DOC-10 ...` in `CP/console-files.test.ts` (header was `immutable`, now `no-cache`). Siblings: the one static registration. Seen: nothing now; browsers fetch a release's new help pictures.

## DOC-11 a missing help file answered the console page
`CP/app.ts` `setNotFoundHandler`: a GET under `/help/` whose last part has an extension is 404, not `index.html`. A help screen's own address (no extension) is still the console. Same test. Left: `/_platform/*` named in the finding was not changed (no such file route found).

## DOC-01 screenshot spec seeded `order:`
`e2e/screenshots.spec.ts`: `pages: [refunds, returns]` on the support index; no `order`. Test `DOC-01 ...` in `packages/docs-engine/src/seeds.test.ts` reads the spec's seeded front matter through `readPage` (failed: `There is no "order" here`). The spec was not run (needs an instance).

## Found: `docs-apps.test.ts` "page takes one of the product's own terms"
Not a product fault. The test read the product's names from a built console (`apps/console/dist/help`); without a build the product has no names, so nothing clashes. `CP/docs-apps.test.ts` now gives the app a temp console folder with a `help/manifest.json` (term `workspace`, topic `data-tables`). Failed with `dist/help` moved aside, passes with and without it.

## CLI-16 `COMMAND_NOTES`
`packages/cli/src/commands.ts`: the `--dir` note now names `schemas`, `tenant plan` and `tenant release` too (they read `--dir`: `cli.ts:194`, `access.ts:112`). Test `packages/cli/src/commands.test.ts`. The generated reference follows at the next `pnpm build`.

## APP-19, CLI-16, TAB-41 prose (no test can see prose; read against the code)
- `docs/contracts/bundle.md`: new sections "The core range" (`bundleCompatibility`) and "Sources" (`sources`, `consoleSources`, limits, digest).
- `docs/self-hosting.md`: hostname row (an app at the root, or the portal at `/_` with every app beneath); `portal_reader` beside `portal_user`; "neither portal role includes files"; the guests' API limit is counted in the database (every replica), file downloads in each replica's memory (`guestFiles` is a `MemoryLimiter`).
- `docs/phases/phase-6-apps.md`: the old npm scope is `@volvel/`. `README.md`: "Apps page".
- `docs/sdk-guide.md`: no "phase 17"; `deploy` prints the note, `build` does not; comments in console-edited files are kept (`ontoWritten`), no longer "lost".
- TAB-41's code half was done by `fixed/tab2.md`. Not mine and not done: the `data/tables.md` lines (page content, below).

## Not mine, listed
- **DOC-03** (30-M8), **DOC-04** (30-M2, 30-M7), **DOC-17** (30-M10): wholly phase 30's.
- **Page content** (`packages/docs/content`, phase 31's pages): `data/tables.md` (undo and row rules, exports hold IDs, "stays in the row's history", `ne` and "empty" in search); `build/documentation.md` DOC-07; `configure/settings.md` and `variables.md` (cfg2 lines in `fixed/cfg2.md`); dashboards, data sources and queries pages (`fixed/dat2.md`); `kinds/flow.md` (generated). `docs/sdk-guide.md` has no flow section to edit, and no code-app section: that is a new page, APP-19 says so. The draft-save contract (`409 draft_changed`) and `app-builder-editor.md` (BLD-13) were left to the pages; `fixed/draft.md` holds the lines.
- Lines for CHANGELOG: help pictures are no longer cached as immutable, a missing `/help/*` file answers 404.

## Walk
Nothing a person sees is changed by my commits. DOC-10 and DOC-11 are seen in the console's help panel: with a built console on a throwaway instance, open help (F1) at 1440 and 390, reload, and ask for `/help/pages/nope.json` (404). Not run: no server may be started by a lane; the cases are tested at the route.
