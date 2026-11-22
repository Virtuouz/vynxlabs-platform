# Fernhill Veterinary Group

A complete, hypothetical customer of the platform, built to vet the console, the apps and the agent surface against something that looks like real work.

Fernhill runs three clinics in Portland, Oregon: Northside, Riverside and Hilltop. Every clinic keeps Pacific time, and Hilltop is closed on Saturdays. Money is kept in cents and shown in dollars. On the platform it has:

| What | Where it lives | Who uses it |
| --- | --- | --- |
| **Front desk**: today's board, booking, client look-up, stock, callbacks. A custom React app | `apps/front-desk` | Front-desk staff: end users in their clinic's group |
| **Pet portal**: pets, visits, booking and invoices. A custom React app | `apps/pet-portal` | Pet owners: end users with a `client_id` attribute |
| **Clinic performance**: money, visits and stock. Built from widgets, with no code | `src/apps.ts` (`screens/performance`) | Practice managers: members of the tenant |
| **Integrations**: TextLine (SMS), VetSupply (stock orders), PayFern (signed payment webhook) | `src/model.ts`, `src/flows.ts`, `stand-ins/` | Scripts and flows |
| **Shared code for scripts and apps**: lists, visit lengths, status words, dollars, and Pacific clock time | `src/constants.ts`, `src/time.ts` (no imports, so apps can use them) | Both |
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
VOLVEL_URL=http://localhost:8080 node setup/setup.mjs          # --reset to start over
```

`setup.mjs` does what Fernhill's people would do:

1. The operator creates the tenant and opens access to set it up.
2. Four members and sixty locums (`locum.01` to `locum.60`, no role, so the members list has a second page), "Practice managers" and "Billing" groups (Billing: Rowan Ellis and Devi Shah; with the practice managers they may mark an invoice paid), two workspaces (`clinics` in production, `sandbox` in dev), end-user groups and front-desk accounts.
3. Connects TextLine and VetSupply in both workspaces and stores PayFern's signing secret.
4. Devi deploys the repository with the CLI, and Maya promotes it.
5. Seeds six weeks of history in Clinics: about 2,900 visits and 2,100 invoices. The sandbox gets a smaller group (six clients a clinic) over eight weeks, so the builder's charts have a few weeks of lines and bars to draw.
6. Plays out a morning:
   - a stock check starts reorders, four of which wait for a manager
   - TextLine has an outage that fails a run, then the reminders go out
   - today's first visits are checked in, seen and invoiced
   - PayFern sends two good payments, one for the wrong amount, and one with a bad signature
   - unpaid invoices are chased
7. In the sandbox, makes two tables of the console's own: `suppliers` (220 rows, shown by their `name`, so the picker has more than the first 50 to search) and `supplier_contacts`, whose `supplier` column refers to it. Adds Sam Reyes, a doc writer in the sandbox.
   Also made by Maya in the sandbox: a query `reports/visits-by-clinic`, the dashboard `boards/clinic-visits` over it, and two docs sites, `rota` and `supplies` ("Fernhill rota guide", "Fernhill supplies guide"), with feedback off.
8. Registers `fernhill.localhost` to serve the portal and every app, uploads the logo, and ends operator access.

Sign-ins and addresses are written to `.platform/demo.json`. Every account's password is `fernhill-demo-2026`.

| Who | Sign in as | Opens |
| --- | --- | --- |
| Practice owner | `maya.brooks@fernhill.example` (console) | The console; Clinic performance through "Staff sign-in" |
| Practice manager | `rowan.ellis@fernhill.example` (console) | Approvals |
| Developer | `devi.shah@fernhill.example` (console) | The sandbox, deploys |
| Doc writer | `sam.reyes@fernhill.example` (console) | The sandbox's documentation; deploys pages, sites and the workspace's feedback table (`docs-feedback`) |
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
   - Or on Clinic performance's **Stock** page: the **Approvals** widget is a queue of the same orders. Approve one, reject another with a reason, and the next opens. Devi (Billing) is not a manager and does not see it; the widget is for those who may read approvals, and the buttons are theirs only if the step names them.
4. **Front desk as Jess, on a phone.** Check a patient in, move them to the exam room, finish the visit. Then:
   - The invoice appears for the owner, and the thank-you text at the stand-ins page.
   - Then book a visit: only free times are offered, in Pacific time.
5. **Front desk as Omar.** He sees none of Northside's visits.
6. **Pet portal as George.** Book a visit for his dog from the free times (Hilltop is closed on Saturdays), and see his unpaid invoices in dollars.
7. **Clinic performance**, through "Staff sign-in" on the portal as Maya. Try the bars: Search invoices, Clinic, Issued and Status on Money; the tabs on Visits; the folded orders and the Reorder and Count stock buttons on Stock; and Mark paid, Edit and Void on an invoice.
8. **The public form** at the portal's registration address (Operate → Triggers) lands in the front desk's Callbacks.
9. **Ship a change as Devi.** Change the reminder text in `src/scripts.ts` and deploy it to the sandbox:

   ```sh
   VOLVEL_URL=… VOLVEL_TOKEN=<Devi's key> node ../../packages/cli/dist/bin.js deploy --tenant fernhill --workspace sandbox
   ```

   Then, as Maya, review it in Release and promote it. Repository scripts are read-only in the console's editor.

## What phase 23 walks here

`e2e/phase-23.spec.ts` uses the sandbox's `suppliers` and `supplier_contacts`, and Sam. By hand:

- **Tables.** Open `supplier_contacts` in the sandbox: the rows are the one scroller, with the header pinned. Open the row, and type `Veterinary Supply` or a number such as `219` in `supplier`: the picker asks the server, shows 50 and says "Type to find more".
- **Release, as Maya.** One list of deploys with "Activate this version", and "Not yet run here" for bundles never run.
- **Documentation, as Sam.** Write a page, publish a folder as a site that asks for feedback, and deploy: the workspace's one feedback table, `docs-feedback`, is drafted with it the first time, and a second site only changes itself. A table of any other kind is refused.

The tables, the query, the dashboard and the two sites are the console's own, so a CLI deploy of this repository to the sandbox removes them. Run `setup.mjs --reset` to bring them back.

## What phase 24 walks here

`e2e/phase-24.spec.ts` makes its own queries, dashboards and sites under names of its own. By hand, in the sandbox:

- **A rename follows.** As Maya, open Queries, choose `reports/visits-by-clinic`, **Name and path**, and change the path. The dialog lists "Visits by clinic" as a dashboard saved as a draft with the new path. Save, and the dashboard is a draft too. Deploy both: the dashboard still shows its rows. Discard instead, and both drafts go.
- **A repository dashboard** says "Names `old`, now `new`: change it in the repository" once its query's alias has run out. Fernhill's repository has no dashboard over a console query, so this is covered by the control plane's tests.
- **One feedback table, as Sam.** In Documentation, turn on page feedback for "Fernhill rota guide": the dialog says it makes the table `docs-feedback`. Deploy. Turn it on for "Fernhill supplies guide": the dialog says only the site changes. Answer a page in each: the two sites' answers are rows of one table, told apart by `site_key`.
- **A data source's page** fills the window, as a table's rows do (bind one with `E2E_SOURCE_URL` in the browser tests, or in Data sources).
- **A reference by name.** Make a table with a reference column to `supplier_contacts`, which names no display column and has no `name` or `title`: its grid shows each contact by its first text column, `contact`, not by an ID. `suppliers` names `name`, so it was always shown by name.


## Findings from building it, and what became of them

Building Fernhill and using it as its people and its agent turned up these problems. All of them are fixed, except the last two, which are this example's to solve.

**Security**

- **Fixed: an agent could decide approvals reserved for others.** Over MCP, `decide_approval` ignored a step's approvers, and `list_approvals` showed those steps. Both now check approvers, as the console's route does.

**The SDK**

- **Fixed: required columns were typed as nullable.** A required column with a default was also demanded on insert.
- **Fixed: `step.approval()` takes `approvers`.**
- **Fixed: one `find()`.** It returns rows in scripts and in apps. Apps page with `table().page()`, and `totalOf()` reads an aggregate.
- **Constants shared with apps:** an app imports from a repository file that imports nothing. Here that is `src/constants.ts` and `src/time.ts`.

**Flows**

- **Fixed: a clock in expressions.** `now` is a timestamp, and `string(timestamp)` writes ISO 8601.
- **Fixed: a loop can carry on.** `step.foreach({ continueOnError: true })` makes a failed item `{ error }` in the output.
- **Fixed: a manual trigger declares its input.** It is `trigger.manual({ input: zodSchema })`. A start is checked against it, from the API and from MCP.
- **Fixed: build errors no longer cascade** when two resources share a path.

**MCP**

- **Fixed: what connecting needs is said.** It takes `workspace:read`. The routes and the console's Agent access screen say so.
- **Fixed: a failed run is an error result.** It comes with `structuredContent`.
- **Fixed: formats read as words.** "must be a date and time in ISO 8601, such as …" replaces the raw pattern.
- **Fixed: tools are lean and typed.** Schemas drop `$schema`, restated patterns and safe-integer bounds. Run tools advertise an `outputSchema`, and flow tools take their manual trigger's input.
- **Fixed: retries are safe.** Run and flow tools take an `idempotencyKey`.

**The console and the no-code apps**

- **Fixed: values have formats.** Fields, figures and charts take `format: { style: "currency", currency: "USD", minorUnits: true }`.
- **Fixed: a figure shows its title once.**
- **Fixed: a value page filter lists the column's values.**
- **Fixed: approvals say what they are about.** The list shows the first fields of each step's detail.
- **Fixed: the tenant overview counts only hostnames that need looking at.** That is one whose last check failed, or one not serving yet.
- **Fixed: recent changes and the audit log read in words.**
- **Fixed: a trigger that has not fired says "Not fired yet".** Runs started by hand are not counted.
- **Not a flaw: a widget can narrow its own rows.** `widget.filter` was already there; the first version of this example did not use it.

**The UI kit, for custom apps**

- **Fixed: icons.** They come from `@volvel/ui/icons`.
- **Fixed: missing pieces.** There are now `SegmentedControl`, `Card` (since phase 16, `Panel`), `Avatar`, `Skeleton` and `DateStepper`, and `Button` takes `href`.
- **Fixed: `PageShell` suits apps that switch screens in the browser.** Its navigation takes `onSelect`, and it takes `width="full"`.
- **Fixed: `DateField` takes `timeZone`.**
- **Fixed: `logoUrl()` is null when there is no logo.**
- **Fixed: `useSession()` gives groups and attributes.** That is how the front desk knows its clinic and the portal knows its client.
- **Not a flaw: charts load only when one draws.**

**End users**

- **Fixed: a group of end users takes any one-line name,** as a group of members does: `Front desk`.

**Left to this example**

- **Owners could not see free times.** `appointments/free-times` now lists them without showing anyone's visits, and both apps book from it.
- **One namespace for every kind.** An app and a table still cannot share a path. That is by design: a path names one resource in a workspace.
