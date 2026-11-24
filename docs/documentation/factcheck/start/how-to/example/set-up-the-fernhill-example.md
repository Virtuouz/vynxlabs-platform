# Fact-check record: start/how-to/example/set-up-the-fernhill-example.md

Lines are current at commit `a2c970ae` (branch p33-d3, lane d3). Paths are from the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The example is in `examples/fernhill`; `pnpm stand-ins` runs the stand-ins there. | `examples/fernhill/package.json:8` | writer, run 2026-11-24 | holds as run |
| `PORT` chooses the stand-ins' port (4021 was run). They listen on port 4020 by default, on 127.0.0.1; they print "Fernhill's outside systems on http://127.0.0.1:4020/". | `examples/fernhill/stand-ins/server.mjs:10,135-136` | writer, 2026-11-24 (port 4020 was already served on the machine by another run of the stand-ins, and was used) | holds |
| The script uses `STAND_INS` or `http://127.0.0.1:4020`. | `setup/setup.mjs:23` | writer, run (STAND_INS=http://127.0.0.1:4999 gave the refusal) | holds as run |
| Refusal: "The stand-ins are not running at <address>. Start them: node stand-ins/server.mjs". | `setup/setup.mjs:100-103`; run | writer, run | holds as run |
| `VOLVEL_URL` defaults to `http://localhost:8080`; email and password from `VOLVEL_ADMIN_EMAIL`, `VOLVEL_ADMIN_PASSWORD` (email defaults to admin@example.com). | `setup/setup.mjs:17-22` | writer, run | holds as run |
| Wrong operator password: "Signing in as admin@example.com: 401 ... Invalid email or password". | `setup/setup.mjs:46`; run | writer, run | holds as run |
| Nothing at VOLVEL_URL: "fetch failed", `ECONNREFUSED`. | run (VOLVEL_URL=http://localhost:8123) | writer, run | holds as run |
| A second run without `--reset` stops: `A tenant "fernhill" exists. Run again with --reset to delete it and start over.` | `setup/setup.mjs:115`; run | writer, run | holds as run |
| `--reset` cancels running runs and flow runs under an access grant, then deletes the tenant, and the script makes everything again (35 s). | `setup/setup.mjs:116-149`; run (`Deleting the existing fernhill tenant`, then Done) | writer, run | holds as run |
| People's accounts stay after `--reset` and are added again with one password. | `setup/setup.mjs:25-28` (comment), `addMember`; run (the second tenant signed in as Maya, Devi with the same password) | writer, run | holds as run |
| `FERNHILL_SLUG` makes a copy; the copy's hostname is `<slug>.localhost`; a copy writes no `demo.json`; `--reset` deletes the tenant of the slug only. | `setup/setup.mjs:29-30,115,833,874-876` | writer, run (copy made in 35.2 s; named "Fernhill Veterinary Group (fernhill-two)"; demo.json unchanged) | holds as run |
| It takes about 40 seconds (38.6 s first run, 35.5 s with `--reset`), on a machine with a local Postgres and workers as the control plane's user. | run, `time` | writer, run | holds as run |
| The workers need `MANAGED_WORKERS=process` and `MANAGED_WORKER_USER=same` on the instance that was used; `same` runs workers as the control plane's user for every tenant. | `d3.env` of the lane; `self-host/explanation/running/managed-workers-and-isolation.md:56`; `apps/control-plane/src/config.test.ts:139` | writer, read | holds |
| Without `same` the seeding step does not finish. | run on a second instance without the setting: seeding printed nothing for 180 s; log "no managed worker for this tenant..." | writer, run 2026-11-24 | holds as run, on a process that may not switch users |
| The script needs the built CLI at `packages/cli/dist/bin.js` (`pnpm build`). | `setup/setup.mjs:15`; the file exists after the build | writer | holds |
| Node 24. | `.nvmrc`; run on v24.15.0 | writer, run | holds as run |
| The tenant is "Fernhill Veterinary Group", slug `fernhill`. | `setup/setup.mjs:153-155` | writer, run (tenants list) | holds as run |
| Workspaces Clinics (production) and Sandbox (dev). | run (workspaces list: `clinics` Clinics production, `sandbox` Sandbox dev); `setup/setup.mjs:111-123` | writer, run | holds as run |
| Devi deploys to the sandbox, Maya promotes to Clinics. | `setup/setup.mjs:326-345`; run output | writer, run | holds as run |
| Members: Maya (tenant_admin), Rowan (workspace_admin), Devi (developer), Dr. Amara Okafor (viewer); Sam Reyes doc writer in the Sandbox; 60 locums `locum.01` to `locum.60`, no role. | `setup/setup.mjs:32,166-189,532` | writer, read; demo.json | holds |
| Groups: Practice managers (Maya, Rowan) and Billing (Rowan, Devi). | `.platform/demo.json` of the run | writer, run | holds as run |
| End users: front desk Jess Morgan, Omar Haddad, Lena Fischer; pet owners george.lewis@example.net, george.green@example.net, maya.hughes@example.net. | `setup/setup.mjs:303-308,390-397`; demo.json | writer, run | holds as run |
| Every account made has the password `fernhill-demo-2026`. | `setup/setup.mjs:24` | writer, run (Maya signed in) | holds as run |
| About 2,900 visits and 2,100 invoices in Clinics. | run output: appointments 2930, invoices 2076, clients 72, pets 105 | writer, run | holds as run |
| The sandbox gets a smaller group over eight weeks. | `setup/setup.mjs:383` (6 clients a clinic, 56 days) | writer, read | holds |
| The morning: stock check starts reorders, failed run in the TextLine outage, four finished and invoiced visits, PayFern payments. | run output | writer, run | holds as run |
| Apps `front-desk`, `pet-portal`, `performance`, `operations`, `my-account`, `handbook`; flows `appointments/after-visit`, `billing/chase-unpaid`, `inventory/reorder`, `registrations/new-client`. | run (apps and flows lists of Clinics) | writer, run | holds as run |
| Portal at `/portal/fernhill/`; hostname `fernhill.localhost` registered for the portal and every app. | `setup/setup.mjs:830-838,860-870`; demo.json | writer, run | holds as run |
| `.platform/demo.json` holds addresses, sign-ins, ids and the phone assistant's key; it is written each time for the first Fernhill and replaces an existing file. | `setup/setup.mjs:840-878` | writer, run | holds as run |
| The script does not write the command line's settings; `XDG_CONFIG_HOME` is not needed. | `setup/setup.mjs:330-338` (VOLVEL_TOKEN per call); run with `XDG_CONFIG_HOME` set to an empty folder: still empty after | writer, run | holds as run |
| Sign in as Maya (email, Continue, password); the console opens on Tenants; Workspaces lists Clinics and Sandbox; the portal and Clinic performance. | Playwright, 1440 and 390 px: two-step sign-in, console opens on Tenants; tenant overview, Workspaces (Clinics production, Sandbox dev, promotes to Clinics), 65 members; portal lists four apps for Maya; Clinic performance renders | writer, run 2026-11-24 | holds as run |
| Port 4020 taken: `pnpm stand-ins` stops with `Error: listen EADDRINUSE: address already in use 127.0.0.1:4020`; `PORT=4021` then prints the line on 4021 and `STAND_INS=http://127.0.0.1:4021` is used by the script. | `stand-ins/server.mjs:10,135`; run | second agent, 2026-11-24 | page lacked the error line; added |
| On a phone (390 px) the tenant's menu is behind **Open the menu**; at 1440 it is beside the page. | Playwright, tenant page, both widths | second agent, 2026-11-24 | page lacked it; added |
| Every claim above (labels, defaults, messages, counts 65 members, 16 ▸ parts, 39.6 s, Done lines, the portal's four apps, Clinic performance tabs Money, Visits, Stock) re-checked against `setup/setup.mjs` and a fresh run; and on the console at 1440 and 390, light and dark, with a reload. | `setup/setup.mjs:15-30,100-118,153-154,237-246,833,841-882`; `supervisor.ts:253,299` | Checked by: second agent, 2026-11-24 | holds as run |
