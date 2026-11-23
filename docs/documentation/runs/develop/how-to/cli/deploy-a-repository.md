# Run log: develop/how-to/cli/deploy-a-repository.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- `deploy --preview`, `deploy --message`, `deploy --json` against `cli-dev` as the page shows; `CI=true` gave the commit subject as the note (`Warm up the greeting`).
- With a `platform/` console file present: deploy created the table; `rm` of a second console file and deploy gave the refusal text with `cli-extra`; `--allow-delete cli-extra --preview` listed `deleted table cli-extra`; the real deploy with the flag deleted it (`Table cli-extra retired. Its rows are kept.`). A deploy of a bundle with no console file at all left the console's resources (preview said `0 deleted`).
- Missing bindings: `cli-bind-dev` took the deploy with `Note:` lines; `cli-bind-live` (production) refused both `--preview` (`It cannot be deployed. ...`) and the deploy (`Could not deploy to cli-bind-live. ...`), exit 1, with the two lines on the page.
- A code-only change (the body of `run`) printed `0 updated, 2 unchanged`.

## The page got wrong (and was corrected)
- A first draft said a code-only change is not counted although the code is replaced; the run proved the count, not that the running code changed. Reworded.
- A first draft listed the causes of a failed build from the inventory; not read again line by line, so replaced with "each problem is on its own line".

## Not run
`rename_suspected`, `path_taken`, `kind_changed`, `incompatible_bundle`, `assets_missing` and `bindings_invalid` (texts from `deploy.ts` and `bundles.ts`); the size limits; the `The build failed:` list.
