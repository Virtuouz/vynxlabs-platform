# Run log: develop/how-to/docs/keep-documentation-in-the-repository.md

- Not run end to end. The steps were not followed in a new repository and `volvel build` and `volvel deploy` were not run on files I wrote, so the page is not presented as finished.
- Seen instead: the Fernhill example in a checkout (`examples/fernhill/platform/docs/handbook`) builds as a docs app (`volvel dev` listed `handbook (docs)`), and the console showed its pages. The wording of the steps is `docs/sdk-guide.md`'s, checked against `packages/manifest/src/files.ts` and `packages/cli/src/build.ts`.
- The refusals list is from the guide and the engine's codes; no refusal was provoked.

## Second check, 2026-11-23 (second agent)

Run end to end with the CLI built from this checkout (0.5.0), Node 24, in a new folder from `volvel init`, a key of the checker's own tenant `d31chk` (one day), workspace `work` (dev).
1. `docs: [docs]` in `volvel.yaml`; `docs/handbook/index.md`, `docs/handbook/support/refunds.md` and a picture `docs/handbook/img/till.png`. `volvel build` listed `doc handbook/index` and `doc handbook/support/refunds`.
2. `src/docs.ts` as the page had it (no import, not exported from `src/index.ts`): `volvel build` listed no app and no binding. With the import and `export * from "./docs.ts";`: `app handbook (1 files, 0 KB)` and `binding access/handbook`. The page was corrected.
3. Refusals provoked by `volvel build`: a `volvel-` topic, a link to no page, a heading that is not there, an undefined term, a wrong `about`, an off-site link, a `javascript:` link, `//`, an http picture, a duplicate `moved_from`, and a page's own path in `moved_from`. Not refused by the build, refused by the deploy: a picture that is not there and a topic the product keeps (`build-docs`). The page was corrected.
4. `volvel deploy --tenant d31chk --workspace work` refused to delete five console-made resources until `--allow-delete <path>` named each; then "Deployed", `created doc handbook/index`, `doc handbook/support/refunds`, `app handbook`, `binding access/handbook`. The page now says so.
5. The console's Documentation screen showed the pages with **repository** and no pencil, menu or grip; the site answered 200 at `/apps/d31chk/work/handbook/`, the page and `img/till.png` (image/png).
- 390 px dark and 768 px of the Documentation screen with these pages: no horizontal scroll.
- Not run: a refusal for two apps serving the same pages, a feedback table that is not there, and an older instance.
