# Run log: develop/how-to/docs/run-a-docs-app-locally.md

- CLI built in a checkout of the walk (`tree31`, commit `b3f902de`, packages built), Node 24. Repository: that checkout's `examples/fernhill`, signed in with `volvel login --url http://localhost:8091 --token …` (a one-day key of Maya Brooks, made for this run and revoked after; own config folder). Not the commit of the pages (`14f7d5b9`).
1. `volvel dev --tenant fernhill --workspace sandbox` with no app: "Say which app: front-desk (files), handbook (docs), my-account (interface), operations (interface), performance (interface), pet-portal (files)."
2. `volvel dev nothing …`: "This repository has no app at "nothing". Its apps: … volvel dev draws an app made of files, an interface and a docs site."
3. `volvel dev handbook --tenant fernhill --workspace sandbox`: "handbook is at http://localhost:5174/", the policy line, "It reads and writes fernhill/sandbox on http://localhost:8091, as maya.brooks@fernhill.example. Press Ctrl+C to stop."
4. `GET /` answered 200 `text/html` with the content-security-policy header and the page: the notice "Drawn from the files on this computer by volvel dev. What only the instance knows is not here: the product's own terms, readers' answers to "Was this page helpful?", and diagrams.", the site title Fernhill handbook, and "What do you want to do?" cards. `GET /_search?q=booking` answered 200.
- Not run: editing a page and seeing the reload (read in `dev-site.ts` and its test), a build that fails, `--no-strict`, `--port`, a page with a picture, a browser (curl only), 768 and 390 px, dark.

## Second check, 2026-11-23 (second agent)

CLI built from this checkout (0.5.0), the repository of the keep-documentation run, signed in with a one-day key of the checker's own tenant.
1. `volvel dev` with no app flags and no `--tenant`: "This needs --tenant <slug> and --workspace <slug>."; `volvel dev nothing …`: "This repository has no app at "nothing". Its apps: handbook (docs)."; with one app and no name it served `handbook` at the port given with `--port 5390`.
2. Browser at 1440 light and 390 dark: the notice, the site, the search box, a picture (`/img/till.png`, 40 px wide), the mermaid block as source, no horizontal scroll.
3. A line added to `docs/handbook/index.md` appeared without a manual reload. A page with a link to no page showed "This app cannot be drawn yet. The repository does not build. The page reloads when a file changes." with `handbook/index (doc): line 16: The link to "nope-page" leads nowhere…`, and the page came back when the file was mended.
4. `--no-strict`: the line "The page is served without the platform's content policy (--no-strict)…" and no content-security-policy header.
- The port and its next free ones were read in `dev-site.ts` (not run: a taken port).
- Not run: "Say which app" with several apps in this repository (run by the writer).
