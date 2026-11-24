---
title: Set up the Fernhill example
description: Run the setup script from a checkout of the repository to make the Fernhill tenant, its people, its apps and six weeks of history on an instance you run, and say what to do when it stops.
---

## Set up the Fernhill example

By the end the instance holds a tenant called Fernhill Veterinary Group, with its people, two workspaces, six weeks of visits and invoices, and the apps and flows the tutorials use. The script takes about 40 seconds.

## Before you start

- **A checkout of the repository.** The example is in `examples/fernhill`, and no published package holds it. In the checkout, run `pnpm install` and `pnpm build` once: the script deploys with the built command line in `packages/cli/dist`. Use the Node version in the checkout's `.nvmrc` (24).
- **An instance that runs workers for tenant code.** The script runs scripts in Fernhill's workspaces to seed them. On an instance started with `MANAGED_WORKERS=process` the setting `MANAGED_WORKER_USER=same` makes the workers run as the control plane's user. Without it the step **Seeding six weeks of history** does not finish. `same` means everyone who writes code works for you: use it on a machine of your own. See [Managed workers and isolation](../../../self-host/explanation/running/managed-workers-and-isolation). To make an instance, see [Install an instance with Compose](../../../self-host/how-to/running/install-with-compose).
- **The instance's address**, for example `http://localhost:8080`.
- **The operator's email and password.** They are the ones the instance made at its first start (`BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`). The script signs in as the operator to make the tenant.
- **A free port 4020** on the machine where you run the script, for Fernhill's outside systems (below).
- An instance that has no tenant with the slug `fernhill`. If it has one, see "Run it again" below.

## Run the setup

:::steps
1. **Start Fernhill's outside systems.** In one terminal, from `examples/fernhill`, run:

   ```bash
   pnpm stand-ins
   ```

   It prints "Fernhill's outside systems on http://127.0.0.1:4020/". These are stand-ins for the SMS service TextLine, the supplier VetSupply and the payment service PayFern. Leave it running: some of the tutorials send a text and read it there. If something already answers on port 4020, the script uses it. To use another address, set `STAND_INS` to it in the next step.

2. **Run the script.** In a second terminal, from `examples/fernhill`, run:

   ```bash
   VOLVEL_URL=http://localhost:8080 \
   VOLVEL_ADMIN_EMAIL=admin@example.com \
   VOLVEL_ADMIN_PASSWORD='the operator password' \
   node setup/setup.mjs
   ```

   `VOLVEL_URL` is your instance's address. Without it the script uses `http://localhost:8080`. It prints a line beginning with ▸ for each part and ends with "Done. Sign-ins and addresses are in" and the path of `.platform/demo.json`.

3. **Sign in to the console as Maya Brooks.** Open the instance's address, and sign in as `maya.brooks@fernhill.example` with the password `fernhill-demo-2026`. The workspace bar shows **Clinics**, and **Sandbox** is in its menu.
:::

## The result

The script makes these. It makes them as Fernhill's people would, so the instance's audit log shows who did what.

| What | Details |
| --- | --- |
| The tenant | Fernhill Veterinary Group, slug `fernhill`. |
| Two workspaces | **Clinics**, a production workspace, and **Sandbox**, a dev workspace. The repository is deployed to the Sandbox and promoted to Clinics. |
| Members | Maya Brooks (tenant admin), Rowan Ellis (workspace admin), Devi Shah (developer), Dr. Amara Okafor (viewer), Sam Reyes (doc writer, in the Sandbox) and 60 locums, `locum.01@fernhill.example` to `locum.60@fernhill.example`, with no role, so that the members list has a second page. |
| Groups | Practice managers (Maya, Rowan) and Billing (Rowan, Devi). |
| End users | The front desk: Jess Morgan, Omar Haddad and Lena Fischer, one for each clinic, and three pet owners with a portal account: `george.lewis@example.net`, `george.green@example.net` and `maya.hughes@example.net`. |
| One password | Every account made has the password `fernhill-demo-2026`. It is for an example on a machine of your own. |
| Six weeks of history | In Clinics: about 2,900 visits and 2,100 invoices, with clients, pets and stock. The Sandbox gets a smaller group over eight weeks. Then a morning: a stock check that starts reorders, a failed run during an outage of TextLine, four finished visits that are invoiced, and payments from PayFern. |
| Apps and flows | The apps `front-desk`, `pet-portal`, `performance`, `operations`, `my-account` and `handbook`, and the flows `appointments/after-visit`, `billing/chase-unpaid`, `inventory/reorder` and `registrations/new-client`. |
| The portal | The portal at `/portal/fernhill/`, and the hostname `fernhill.localhost`, registered to serve the portal and every app. |

`.platform/demo.json`, inside `examples/fernhill`, records the addresses of the apps and the portal, the people to sign in as, a key for the phone assistant (a service account) and the ID of the tenant and the workspaces. The script writes it each time it makes the first Fernhill. It replaces a file of that name. If you keep your own, copy it elsewhere first.

The command line's settings (where `XDG_CONFIG_HOME` points) are not written: the script gives the command line a key of its own for each deploy. You can still set `XDG_CONFIG_HOME` to an empty folder when you run the script, to be sure that your own settings are not read.

## Run it again

The script stops when the tenant exists: it says `A tenant "fernhill" exists. Run again with --reset to delete it and start over.`

Add `--reset` to start over:

```bash
node setup/setup.mjs --reset
```

`--reset` deletes the tenant `fernhill` with everything in it: its workspaces, tables, rows, scripts, flows, apps, groups and keys, and its members' places in it. It first cancels runs that are still going, under an access grant that it opens and ends. The people's accounts belong to the instance, not to the tenant, and stay: the new tenant adds them again with the same password. Then it makes everything again, in about the same time.

To make a copy beside the first, set `FERNHILL_SLUG`, for example `FERNHILL_SLUG=fernhill-two`. The copy has the slug as its hostname (`fernhill-two.localhost`), uses the same people, and does not write `.platform/demo.json`. With `--reset` it deletes only the tenant of that slug.

## If it does not work

- **"Signing in as admin@example.com: 401 ... Invalid email or password".** The email or password is not the operator's. Use the ones the instance was started with. If nobody can sign in, see [Recover an operator](../../../self-host/how-to/running/recover-an-operator).
- **"The stand-ins are not running at http://127.0.0.1:4020. Start them: node stand-ins/server.mjs".** Do step 1, or set `STAND_INS` to the address where they run.
- **"fetch failed" and `ECONNREFUSED`.** Nothing answers at `VOLVEL_URL`. Start the instance, or correct the address.
- **A tenant `"fernhill"` exists.** Run again with `--reset`, as above, or use `FERNHILL_SLUG` for a copy.
- **The script stops at "Seeding six weeks of history" and does not go on.** The instance has no worker that can run tenant code. Set `MANAGED_WORKER_USER=same` (with `MANAGED_WORKERS=process`), restart the instance, and run with `--reset`.
- **"Seeding failed: ..." or a message beginning `POST` or `GET` with a number.** The instance refused a call. The number and text are the instance's own: read the control plane's log, fix the cause, and run with `--reset`. A script that stops in the middle leaves a tenant that is not whole: do not use it.
