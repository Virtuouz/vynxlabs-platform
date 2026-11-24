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

## Second run (coordinator's four checks, 2026-11-24)
1. **Step 1 itself.** `PORT=4021 pnpm stand-ins` from `examples/fernhill` printed "Fernhill's outside systems on http://127.0.0.1:4021/" and answered 200. `STAND_INS=http://127.0.0.1:4021 node setup/setup.mjs` used them. The page now says how to choose another port (`PORT`, then `STAND_INS`).
2. **A copy.** `FERNHILL_SLUG=fernhill-two` (with the first Fernhill present): 35.2 s, ended `Done. The copy "fernhill-two" is made; demo.json is the first Fernhill's, unchanged.` `.platform/demo.json` was byte-identical before and after. The tenants list showed "Fernhill Veterinary Group" and "Fernhill Veterinary Group (fernhill-two)", each with 2 workspaces; the copy's domain is `fernhill-two.localhost`. Maya signed in to both. The page now says this.
3. **Without `MANAGED_WORKER_USER`.** A second empty database and an instance on port 8096, from `d3.env` without that line. At start it logged "managed workers cannot run as their own user: this process may not switch users ... Give the container CAP_SETUID and CAP_SETGID, or set MANAGED_WORKER_USER=same." The script ran to the deploy and promote, printed "Seeding six weeks of history", and printed nothing more for the 180 s I waited (08:51:30 to 08:54:30), when `timeout` stopped it. The instance log said, twice, "no managed worker for this tenant: its code is written outside the operator, and a worker started beside the control plane shares its network. Run a worker host (MANAGED_WORKERS=host), or give the tenant a standalone worker." So the page's claim holds on an instance whose process cannot switch users (this one: a normal user); it did not fail, it waited. The page now gives the log line and the three ways out. That instance was stopped, its database dropped and its env file removed. Not tried: the instance as root or with the capabilities, where `own` may work.
4. **Step 3 in a browser** (Playwright, headless Chromium, light theme, 1440 and 390 px, screenshots read; in `/tmp/d3shots`). Sign-in is two steps (email and **Continue**, then password and **Sign in**). After it the console opens on **Tenants**, not on a workspace: the page was wrong ("The workspace bar shows Clinics") and was rewritten. Opening the tenant: overview with Clinics PRODUCTION and Sandbox DEV, 65 members; **Workspaces** lists Clinics (production) and Sandbox (dev, promotes to Clinics), the same after a reload. `/portal/fernhill/` lists Fernhill handbook, My Fernhill account, Clinic operations, Clinic performance; **Clinic performance** drew its charts ($190,862.00 invoiced) at 1440, and at 390 the same figures. Added to the page as step 4.

## Not run
- Dark theme, 768 px, the keyboard-only walk.
- A Compose instance; the real default `http://localhost:8080`.
- The instance as a user that may switch workers' users.
- A second agent's check of the fact-check record.
