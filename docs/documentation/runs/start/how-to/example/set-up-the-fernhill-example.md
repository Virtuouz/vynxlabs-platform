# Run log: start/how-to/example/set-up-the-fernhill-example.md

- Instance: a fresh control plane on port 8099 from lane d3 (`/home/gplascencia/.local/share/volvel-walk/lanes/d3`, commit `a2c970ae` plus the page), database `fern33`, empty before the run (no tenant). `MANAGED_WORKERS=process`, `MANAGED_WORKER_USER=same`. The operator `admin@example.com` was made by the instance at its first start.
- Machine: Node v24.15.0 (`.nvmrc` says 24), WSL2. The checkout was already built (`packages/cli/dist/bin.js`).
- Stand-ins: something already answered on port 4020 ("Fernhill's outside systems"), started by another lane. It was used, as the page says it may be; `pnpm stand-ins` was not run again.
- `.platform/demo.json`: the lane's `examples/fernhill/.platform` did not exist, so there was nothing to back up. The owner's file is in the main checkout, which the script does not touch (it writes in its own checkout). The script wrote the lane's file.
- `XDG_CONFIG_HOME` was set to an empty temporary folder for the runs.

## The steps as followed
1. Step 1 (stand-ins): not run; port 4020 answered `200` with the stand-ins' page.
2. Step 2, first attempt with `VOLVEL_ADMIN_PASSWORD` unset: `Signing in as admin@example.com: 401 ... Invalid email or password` (the page's first failure, as worded). Run again with the operator's password (from the env file; the instance's variable is `BOOTSTRAP_ADMIN_PASSWORD`): all 16 parts printed their ▸ lines, ended with "Done. Sign-ins and addresses are in .../examples/fernhill/.platform/demo.json" and the line about who may mark an invoice paid. 38.6 s.
3. Step 3: not walked in a browser. By the API, `maya.brooks@fernhill.example` with `fernhill-demo-2026` signed in (200). The workspaces list returned `clinics` (Clinics, production) and `sandbox` (Sandbox, dev); Clinics held the six apps, nine tables, four flows and 21 scripts the page names.

## Failures, made on purpose
- Run again without `--reset`: `A tenant "fernhill" exists. Run again with --reset to delete it and start over.`
- `STAND_INS=http://127.0.0.1:4999`: `The stand-ins are not running at http://127.0.0.1:4999. Start them: node stand-ins/server.mjs`
- `VOLVEL_URL=http://localhost:8123`: `TypeError: fetch failed`, cause `ECONNREFUSED 127.0.0.1:8123`.
- `--reset`: "Deleting the existing fernhill tenant", then everything again, Done, 35.5 s. demo.json was rewritten with new ids.

## The page got wrong (and was corrected)
- The first draft said 2,000 invoices; the seed made 2,076 (the README says about 2,100). Corrected.
- The first draft listed a failure for an unbuilt CLI. It was not reproduced, so it was taken out; the need for `pnpm build` stays under Before you start.
- The brief said the command line's settings (`XDG_CONFIG_HOME`) are written. They are not: the script passes a key to the CLI in `VOLVEL_TOKEN`. The page says so.

## Not run
- Step 1 (`pnpm stand-ins` itself) and the page's own reading of its output.
- `FERNHILL_SLUG` (a copy).
- Without `MANAGED_WORKER_USER=same` (the claim that the seeding step does not finish comes from the lane brief).
- A Compose instance; a browser, any width or theme; the real default `http://localhost:8080`.
- The page is therefore not presented as finished until a browser walk of step 3 and a second agent's check.
