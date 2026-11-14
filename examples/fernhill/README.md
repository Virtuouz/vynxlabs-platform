# Fernhill Veterinary Group

A complete, hypothetical customer of the platform, built to vet the console, the apps and the agent surface against something that looks like real work.

Fernhill runs three clinics: Northside, Riverside and Hilltop. On the platform it has:

| What | Where it lives | Who uses it |
| --- | --- | --- |
| **Front desk**: today's board, booking, client look-up, stock, callbacks. A custom React app | `apps/front-desk` | Front-desk staff: end users in their clinic's group |
| **Pet portal**: pets, visits, booking and invoices. A custom React app | `apps/pet-portal` | Pet owners: end users with a `client_id` attribute |
| **Clinic performance**: money, visits and stock. Built from widgets, with no code | `src/apps.ts` (`screens/performance`) | Practice managers: members of the tenant |
| **Integrations**: TextLine (SMS), VetSupply (stock orders), PayFern (signed payment webhook) | `src/model.ts`, `src/flows.ts`, `stand-ins/` | Scripts and flows |
| **Flows**: invoice and thank-you text after a visit; reorder with a manager's approval; weekly chasing of unpaid invoices; public registration form | `src/flows.ts` | Event, schedule, webhook and form triggers |
| **Phone assistant**: an AI agent connected over MCP with a service account's key | `src/apps.ts` (bindings), `setup/agent.mjs` | The `phone-assistant` service account |

Who sees what is decided by the tables' rules, not by the apps. Front-desk staff see their own clinic's rows. Owners see their own. Managers, as tenant members, see everything. The same tables serve all three apps.

## Run it

You need an instance (the control plane, with workers) and its first operator's sign-in.

```sh
pnpm install
pnpm build                                        # the CLI and the SDK this uses
node examples/fernhill/stand-ins/server.mjs &     # TextLine and VetSupply on :4020
cd examples/fernhill
PLATFORM_URL=http://localhost:8080 node setup/setup.mjs          # --reset to start over
```

`setup.mjs` does what Fernhill's people would do:

1. The operator creates the tenant and opens access to set it up.
2. Four members, a "Practice managers" group, two workspaces (`clinics` in production, `sandbox` in dev), end-user groups and front-desk accounts.
3. Connects TextLine and VetSupply in both workspaces and stores PayFern's signing secret.
4. Devi deploys the repository with the CLI, and Maya promotes it.
5. Seeds six weeks of history: about 2,900 visits and 2,100 invoices.
6. Plays out a morning:
   - a stock check starts reorders, four of which wait for a manager
   - TextLine has an outage that fails a run, then the reminders go out
   - today's first visits are checked in, seen and invoiced
   - PayFern sends two good payments, one for the wrong amount, and one with a bad signature
   - unpaid invoices are chased
7. Registers `fernhill.localhost` to serve the portal and every app, uploads the logo, and ends operator access.

Sign-ins and addresses are written to `.platform/demo.json`. Every account's password is `fernhill-demo-2026`.

| Who | Sign in as | Opens |
| --- | --- | --- |
| Practice owner | `maya.brooks@fernhill.example` (console) | The console; Clinic performance through "Staff sign-in" |
| Practice manager | `rowan.ellis@fernhill.example` (console) | Approvals |
| Developer | `devi.shah@fernhill.example` (console) | The sandbox, deploys |
| Front desk, Northside | `jess.morgan@fernhill.example` (portal) | `/apps/fernhill/clinics/front-desk/` |
| Front desk, Riverside, Hilltop | `omar.haddad@…`, `lena.fischer@…` | the same app, their own clinic's rows |
| Pet owner | `george.lewis@example.net` (portal) | `/apps/fernhill/clinics/pet-portal/` |
| Everything on one hostname | — | `http://fernhill.localhost:8080/` |

The stand-ins page at `http://127.0.0.1:4020/` shows every text and supplier order the platform sent.

## Talk to it as the agent

```sh
node setup/agent.mjs list
node setup/agent.mjs call run_agent__find_client '{"query":"Biscuit"}'
node setup/agent.mjs call run_agent__clinic_day '{"clinic":"northside"}'
node setup/agent.mjs call list_approvals '{}'
```

The agent is offered exactly the scripts and the flow it is bound to (`src/apps.ts`), and the run and approval tools.

## A walk through it, to vet the UI

1. **Console as Maya.**
   - The tenant overview shows four approvals waiting and the hostname to check.
   - The Clinics overview shows two failed runs. Open them:
     - The reminder run failed during TextLine's outage. Find the log line.
     - The PayFern payment for the wrong amount was refused by the script.
2. **Triggers.** Pause the hourly reminders in production, then resume them.
3. **Approvals, as Rowan.** Approve a stock order. The order appears at `http://127.0.0.1:4020/`.
4. **Front desk as Jess, on a phone.** Check a patient in, move them to the exam room, finish the visit. Then:
   - The invoice appears for the owner, and the thank-you text at the stand-ins page.
   - Then book a visit at a clashing time.
5. **Front desk as Omar.** He sees none of Northside's visits.
6. **Pet portal as George.** Book a visit for his dog; see his unpaid invoices.
7. **Clinic performance**, through "Staff sign-in" on the portal as Maya. Try the page filters.
8. **The public form** at the portal's registration address (Operate → Triggers) lands in the front desk's Callbacks.
9. **Ship a change as Devi.** Change the reminder text in `src/scripts.ts` and deploy it to the sandbox:

   ```sh
   PLATFORM_URL=… PLATFORM_TOKEN=<Devi's key> node ../../packages/cli/dist/bin.js deploy --tenant fernhill --workspace sandbox
   ```

   Then, as Maya, review it in Release and promote it. Repository scripts are read-only in the console's editor.

## Findings from building it

What got in the way while building Fernhill. "Fixed" means it is fixed in the same change as this example.

**Security**

- **Fixed: the agent could decide approvals reserved for others.** `decide_approval` over MCP ignored the step's approvers: the phone assistant approved a stock order meant for the Practice managers group. `list_approvals` also listed such steps. Both now check approvers as the console's route does.

**The SDK**

- **Fixed: required columns typed as nullable.** Every column read as `T | null`, even `required: true` ones, because `defineTable`'s expected type widened each column's `Required` to `boolean`. A required column with a default was also demanded on insert. Both are fixed, with a type test.
- **No `approvers` on `step.approval()`.** The manifest supports it; the SDK does not, so `src/flows.ts` writes it onto the node by hand.
- **`find()` differs between scripts and apps.** It returns an array in scripts and `{ items, nextCursor }` in apps.
- **Aggregate results are awkward.** They are keyed `"sum:total"` and typed `number | string | null`.
- **No browser-safe way to share constants.** Importing `REASONS` from `src/` pulls the server SDK into the app, so both apps copy it.

**Flows**

- **No clock in expressions.** There is no `now`, so "unpaid for two weeks" needs a script.
- **A loop fails as a whole when one item fails.** One unreachable phone number failed the whole chase flow; a loop step has no option to carry on.
- **A flow's manual trigger declares no input.** The MCP tool for it accepts any object. The agent guessed and got `No such key: line` from inside a step.

**MCP**

- **Connecting needs `workspace:read`, and nothing says so.** The account had bindings on six scripts and a flow and was still refused. Fixed: the console's Agent access notice now names the permission.
- **A failed run is not an error result.** The tool answers `isError: false` with `status: "failed"`.
- **Schema errors show raw regexes.** A bad date gets the whole pattern back, not "must be an ISO date and time".
- **No output schemas.** Scripts declare them; the tools don't advertise them.
- **Bloated input schemas.** Tool schemas carry zod's long regex patterns alongside `format`.
- **No idempotency on run tools.** An agent that retries books twice. The booking script now refuses a second visit for the same pet at once.

**The console and the no-code apps**

- **A figure counts every row its page's filters leave.** "Unpaid invoices" cannot be built.
- **Each figure repeats its title** as its label.
- **No number or currency format.** Money shows in pence.
- **A value page filter is a free-text box**, not a list of the values.
- **Approvals list identical rows.** Four "Approve a stock order" rows, without the item or amount from the step's detail.
- **Tenant overview: an operator-enabled, unverified hostname is "not working yet"** while it serves.
- **Recent changes show raw audit codes** such as `end_user.signed_in`.
- **A schedule's "Last fired: Never"** reads oddly when its script has been run by hand.

**The UI kit, for custom apps**

- **`PageShell` doesn't suit an app that switches screens in the browser.** Its navigation is links only, and its width is capped.
- **Missing pieces:** no icons, no segmented control, no date stepper, no cards, avatars or loading placeholders. `Button` cannot be a link.
- **Date fields use the browser's local time**, with no time-zone option.
- **`logoUrl()` answers even when there is no logo**, so a page shows a broken image until one is uploaded.
- **Charts come along unused.** Importing anything from `@vynxlabs/ui` adds about 800 KB of chart library to an app that draws no chart.
- **`useSession()` gives neither groups nor attributes.** The front desk cannot ask which clinic is the person's, and the portal cannot read its own `client_id`.
- **Owners cannot see which times are free.** The rules hide other people's visits. That is right, but it means a clash only shows after booking. An availability script owners may run would fix it, in the repository.

**End users**

- **Names follow different rules.** End-user group names must be slugs (`front-desk`), while member groups take any name ("Practice managers").
- **One namespace for every kind.** An app and a table cannot share a path (`pets`). The build then reports four more errors that all follow from the first.
