# 5. End-to-end journeys

The core question is how efficiently a developer goes from an idea to a working, observable, reusable automation. A page can be complete and still sit in a poor journey, so this document measures journeys rather than pages.

## Method

- **Walked.** An isolated instance was built from `main` (c247273) and seeded with `examples/fernhill`: 2 workspaces, 4 members, about 2,900 visits, failed runs, waiting approvals and a signed webhook. Playwright scripts then drove the console at 1440 px and 390 px, counting every click, page change and typed field. These steps are marked **Observed**.
- **Traced.** Steps the scripts did not drive were traced through the code. Those counts are marked **Inferred**.
- **What is counted:**
  - **Clicks:** pointer or keyboard activations.
  - **Fields:** typed inputs.
  - **Pages:** URL path changes.
  - **Context switches:** leaving the console for an IDE, terminal, docs or another person.
  - **Unguided decisions:** choices the UI asks for without offering the options or consequences.
  - **Recovery steps:** what it takes to retry or fix after a deliberate failure.
- Every journey starts from the workspace overview, as a member with the role the journey needs.

## Summary

| # | Journey | Clicks | Fields | Pages | Context switches | Unguided decisions | Dead ends | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Create a script and run it | 9–12 | 4 | 4 | 2 | 3 | 1 | Works in the console. Schema written twice |
| 2 | Debug a failed task | 4 to see why, 8+ to fix | 0 | 2–4 | 2 when the code lives in the repo | 1 | 2 | Diagnosis is good. Getting from it to the fix and the retry is weak |
| 3 | Create a workflow | 10–15 + 3 per step | 3 per step | 3 | 1 | 2 | 1 | Capable canvas. Its test loop is thin |
| 4 | Schedule an execution | 8 | 4 | 4 | 0 | 3 | 1 | Hard to find, with no feedback before deploy |
| 5 | Connect an API | ~14 | 5–7 | 5 | 1 | 3 | 1 | Split across three areas, with no test |
| 6 | Monitor executions | n/a | n/a | n/a | 0 | n/a | 3 | Good summary. Search and retention are weak |
| 7 | Turn functionality into an internal tool | 6–8 for read-only | 2 | 3 | 1 or more for actions | 1 | 1 | The no-code builder cannot act |
| 8 | Promote dev to production | 5–6 | 1 | 2 | 1 (a second person) | 1 | 0 | Sound design. The handoff is invisible |
| 9 | Expose a script to an agent (MCP) | 6+ | 2 | 3 | 1 (repo) | 2 | 0 | Strong capability. Hard to discover |

Cross-journey patterns:

1. **The answer is one screen away, but no link reaches it.**
   - A run doesn't link to its code.
   - Triggers doesn't link to where a trigger is created.
   - The failed-runs chip doesn't apply the failed filter.
   - The palette doesn't find the thing you name.
2. **JSON where the platform already has a schema.** Try it, Start flow, schedule input and approval details all ask for or show raw JSON. Yet every script's input schema is known, and the kit already ships a schema form.
3. **The draft → review → deploy loop is invisible from inside an editor.** Each change detours through the Release page, and a dev workspace that only exists to test still requires it for anything other than a script test.
4. **Repository-owned resources dead-end in the console.** Fixing one needs the IDE, a CLI deploy, then a promotion by someone else.

---

## Journey 1: Create a script and run it

**Persona:** developer in the `sandbox` dev workspace.

| # | Step | Where | Evidence |
| --- | --- | --- | --- |
| 1 | Rail **Build**. It lands on Flows, not on a Build overview | `/flows` | Observed |
| 2 | Panel **Scripts** | `/scripts` | Observed |
| 3 | **New script** | `/scripts/new` | Observed |
| 4 | Type the path (it "cannot be changed later") and the code | editor | Observed |
| 5 | **Settings** tab: write the input schema **as raw JSON Schema** in a textarea, matching the TypeScript signature by hand | aside | Observed |
| 6 | **Try it** tab: type input **as JSON** | aside | Observed |
| 7 | **Save and run** (⌘↵). The result renders below the editor | editor | Inferred `Authoring.tsx:988` |
| 8 | **Review and deploy** | `/changes` (Release) | Inferred |
| 9 | Type a message, then **Deploy N changes** | Release | Inferred |
| 10 | To run the deployed script by hand: Scripts, then the row. **In a dev workspace the row opens the editor, not an inspector with Run** | `/scripts/edit/:path` | Observed |

**Measures:**
- **Totals:** 9–12 clicks, 4 fields, 4 pages.
- **Context switches:** 2 (editor → Release → back).
- **Unguided decisions:**
  - the path is permanent, with no naming guidance;
  - JSON Schema has to be written by hand;
  - what "draft" means for a test run.
- **Dead end:** after deploying, a dev workspace offers no "run this deployed version" from the script row.

**Friction:**
- **Two sources of truth for input.** The default template types `input: { name?: string }` in TypeScript, and the comment says input "is checked against the schema under Settings". The developer keeps the two in step by hand. In the repository path, zod produces the schema from one definition, so console authoring is the weaker path for a capability the platform already has.
- The **Try it** tab ignores the schema, although `InputDialog` (`apps/console/src/InputDialog.tsx`) can draw a form from one.
- **Production is a dead end for authoring.** The editor is read-only behind a notice. That is correct by policy, but there's no "open this in the dev workspace" link.

**Target journey:**
- **New script → write code → Run (form from schema) → Deploy** from the editor header.
- The schema is derived from a zod `input` in the console code, compiled by `packages/compose`, with the JSON textarea kept as an advanced view.
- Projected: **6 clicks, 2 fields, 1 page, 0 context switches.**

## Journey 2: Debug a failed task

**Persona:** workspace admin in `clinics` (production). Fernhill seeded a reminder run that failed during an SMS outage, and a webhook payment refused for the wrong amount.

| # | Step | Evidence |
| --- | --- | --- |
| 1 | Header chip **"2 failed runs"**. It opens `/runs` showing **All 37, not Failed** | Observed |
| 2 | The trap: the first `reminders/send` row on the list is the **successful** retry. Two rows with the same path differ only by a status word | Observed (the walk clicked the succeeded run) |
| 3 | Chip **Failed**, then the correct row. The inspector opens at 22–26 rem | Observed |
| 4 | Read "Why it failed" and the suggested next step (good: `kernel/execution/diagnose.ts`) | Observed |
| 5 | **Logs** tab. Structured log fields wrap to about 20 characters a line in the narrow panel | Observed (screenshot) |
| 6 | **Details** tab: version "v1" is plain text. **No link to the script's code or its trigger** | Observed (`link to code present: false`) |
| 7 | **Run again** re-sends the same input, with no way to edit it | Observed; `Runs.tsx:275` |
| 8 | To fix the code: Build → Scripts → find the script → editor. Fernhill's scripts are repository-owned, so the editor shows "Change it there". Then **IDE → `platform deploy` to sandbox → Release → Promote**, which needs `promotion:write` and so a second person when the author is a developer | Observed and inferred |

**Flow variant:** a waiting `inventory/reorder` run.
- Row → summary → **Open the run's graph** (page change) → Graph tab.
- **Observed problems:**
  - The graph is clipped on the right at 1440 px, and the last two nodes are cut off with no fit-to-view.
  - The status badge says "Running" while the run waits for an approval.
  - The approval payload is shown as raw JSON.
- The flow run page has **Cancel, Approve and Reject, but no retry, re-run or "run again with this input"** (Observed: the button list).

**Measures:**
- 4 clicks to read why it failed. 8 or more, plus the IDE and a second person, to ship a fix.
- 2–4 pages.
- 1 unguided decision: which of the identically named rows is the failed one.
- **Recovery steps:**
  - a script run: 1 click, but only with the same input;
  - a flow run: about 6 steps (find the flow, Start flow, re-type the input as JSON), and it starts from scratch.
- **Dead ends:** no path from the run to its code, and no flow retry.

**What is already good:** the "Why it failed" box, the suggested next step with an "Open {section}" button, the attempt chain, and a log viewer with search, level filter and download. The diagnosis layer here is more advanced than most of the reference products.

**Target journey:**
- The chip opens `?status=failed`, and each row shows the error's first line.
- The row opens a **full-page run view** with:
  - the step timeline;
  - logs at full width;
  - **Open code at version v1** and **Re-run with edited input**;
  - for flows, **Retry from failed step**.
- Projected: **3 clicks to read why; 4 to retry with a fix to the input.**

## Journey 3: Create a workflow

**Persona:** developer in `sandbox`. Traced in `apps/console/src/screens/FlowEditor.tsx` and `FlowSteps.tsx`.

1. Build lands on Flows, then **New flow**, then type the path.
2. For each step: **Add step**, pick from the palette (starts, steps, logic, core and labelled nodes), drag a handle to connect it, then configure it in the aside. That is about 3 clicks and 1–3 fields per step.
3. **Save draft.** Autosave starts only after this first manual save (`FlowEditor.tsx:652`).
4. **Run by hand** appears only when the flow is saved, valid and has a manual trigger. It always sends `input: {}` (`FlowEditor.tsx:668`) and leaves the editor for the flow run page.
5. Review and deploy, then Deploy.

**Measures:**
- **Totals:** 10–15 clicks plus about 3 per step, and 3 pages.
- **Context switches:** 1, editor to run page.
- **Unguided decisions:**
  - CEL expressions are typed into plain fields with no completion and no evaluated preview;
  - the edge handles for `when` and `error` are not explained in place.
- **Dead ends:**
  - you cannot test a draft flow with real input;
  - you cannot run a single step;
  - there is no undo.

**Strengths:** an inline "N to fix" problems list, Tidy up (dagre layout), core nodes, scripts tagged as nodes, flows chosen by data, and approvers per step.

**Target journey:**
- **Test run** in the editor, using the manual trigger's schema form, with step results overlaid on the canvas. The run stays on the same page in a bottom panel.
- An **expression field** that evaluates against the last test run's data, the pattern Kestra calls "Debug Expression".
- Undo and redo.
- Projected: test loop **2 clicks, 0 page changes**.

## Journey 4: Schedule an execution

**Persona:** developer in `sandbox`.

| # | Step | Evidence |
| --- | --- | --- |
| 1 | The natural place, **Operate → Triggers**, has **no New button and no link to where triggers are made** | Observed (only shell buttons on the page) |
| 2 | Build → **All resources** (sixth item in the panel) → **New ▾** → **Schedule** | Observed |
| 3 | Form: the path; the script as a combobox; **cron as free text**; **time zone as free text**; **input as JSON** | Observed (screenshot) |
| 4 | Save draft → Review and deploy → Deploy | Inferred |
| 5 | Next fire time appears only in Triggers, **after** deploy | Observed (Triggers shows "Next in 21m") |

**Measures:**
- **Totals:** 8 clicks, 4 fields, 4 pages.
- **Unguided decisions:**
  - cron syntax with no preview;
  - the time zone as a free IANA string;
  - input JSON that ignores the chosen script's schema.
- **Dead end:** a standalone schedule can start only a script. Scheduling a flow means editing the flow and adding a schedule trigger node, which is a different place and a different model.

**Target journey:**
- Triggers gets **New trigger ▾** with schedule, webhook, event and form.
- The schedule form shows **the next 5 fire times** in the chosen zone, offers a zone combobox, draws an input form from the target's schema, and can target either a script or a flow.
- Projected: **5 clicks, 2 fields, 2 pages**, with the error caught before deploy.

## Journey 5: Connect an API and reuse the credential

Traced in `ResourceEditor.tsx`, `Execution.tsx` (`SetUpConnection`, `ConnectionGroups`). The Connections page was observed.

1. **Declare:** Build → All resources → New → Connection → HTTP → Save draft → Review and deploy → Deploy.
2. **Bind:** Configure → Connections → **Bind an HTTP connection** → choose it → address, auth mode, credential.
3. **Use:** Build → Scripts → the editor → Settings, "Connections it uses" → save → deploy again.

**Measures:**
- **Totals:** about 14 clicks, 5–7 fields, 5 pages, across three areas (Build, Configure, Build).
- **Context switches:** 1 for repository teams, who declare connections in code.
- **Unguided decisions:**
  - the difference between declaring and binding is not explained where you start;
  - the credential is stored with the binding rather than as a secret, and the Secrets page does not show it;
  - connection groups are invisible until one exists (`Execution.tsx:1169`).
- **Dead end:** there is **no Test connection**. The phase 8 doc lists it as open. The first proof that a credential works is a failed run.

**Target journey:**
- **Add connection** on Configure → Connections opens one wizard: declare (dev) → bind → **Test**, which runs on a worker in the right network → "Use in script…".
- Projected: **6 clicks, 4 fields, 1 page**, with a verified credential.

## Journey 6: Monitor executions

**Persona:** workspace admin in `clinics`.

- **The good parts (Observed):**
  - The workspace overview gives "Needs attention" with counts and actions, a 24-hour bar chart, release state and "What starts work here" with next and last fire times.
  - The tenant overview rolls up approvals and failed runs per workspace.
  - Both are dense and actionable.
- **Search:**
  - **⌘K for "reminders" returns "Nothing matches"**, although a script, a schedule and a trigger carry that name. The palette indexes screens only. (Observed, screenshot.)
  - There is no search by run ID, target, input value or error text. The spec requires that "runs are searchable per workspace" (`docs/master-spec.md:548`).
- **Volume:**
  - The runs list asks for `limit=100` and has no next page (`Runs.tsx:92`).
  - Retention is undefined, so history grows without bound but is not reachable past 100 rows.
- **Freshness:**
  - The runs list polls every 5 s only while something is in progress.
  - Overview, Approvals, Triggers and Workers never refresh.
  - The flow run page polls every 1.5 s for as long as the run is open, including while it waits days for an approval (`Flows.tsx:570`).
- **Phone width (Observed at 390 px):**
  - Paths truncate to `billing/record-…`, so neighboring rows become indistinguishable.
  - The Status column takes a third of the width.
- **Queue:** no queue depth or running-job view for an operator. The four Prometheus gauges are the only signal.
- **Alerts:** `onFailure` handlers and a notify connection exist, but the console has no place to see or subscribe to alerts.

**Dead ends:**
- a run older than the 100 most recent;
- finding a run by business key;
- seeing why the queue is slow.

**Target experience:**
- A runs list with **cursor paging, URL-backed filters, and search over path, ID, tags and error text**.
- Rows that show the first line of the error.
- A **live stream** (SSE) for the list, the shell counts and run pages.
- A tenant-level **queue panel** under Workers.
- Optional **run tags**, set from `ctx` or by the trigger, for business keys such as `order:1234`.

## Journey 7: Turn functionality into an internal tool

**Persona:** workspace admin in `sandbox`.

1. Build → **App Builder** → **Make an app**, or open `performance` (Observed).
2. Add widgets. The palette, observed, is **Table, Card, Cards, Chart, Figure, Form, Text**. A Form "adds a row".
3. **Publish**, which deploys at once (`Interfaces.tsx:441-455`).
4. Published apps → select → **Share**, a side sheet with who has access and what they read.

**Measures:**
- 6–8 clicks for a read-only tool over tables.
- **Dead end:** **no widget can run a script or a flow.** A tool that does something (refund an invoice, resend a text) needs one of:
  - a flow with a **form trigger** whose served URL is copied from Triggers, which is a separate page with no app chrome;
  - a **code app** using `runScript` from `@vynxlabs/app`, which needs the repository, React, the CLI and a deploy.
- **Overlap:** App Builder (Build) and Dashboards (Data) build similar pages over the same tables with different publishing rules.

**Target journey:**
- An **Action** widget (a button, or a row action on a Table) bound to a script or flow, with an input form drawn from its schema.
- Inputs map from the selected row.
- A confirmation setting, and a result toast that links to the run.
- Bindings already decide who may start it.
- Projected: **+3 clicks** to add an action to an existing app, with **0 context switches**.

## Journey 8: Promote dev to production

**Personas:** developer, then owner. Traced in `Release.tsx` and `Environments.tsx`; `examples/fernhill/setup/setup.mjs` does the same thing through the API.

1. Sandbox → Release: a stepper with Review → Deploy → Promote.
2. Promotion preview, then **Promote**. A developer lacks `promotion:write` (phase 8 decision), so a second member does it.

**Measures:**
- 5–6 clicks and 1 field.
- **Context switch:** a second person.
- **Unguided decision:** the developer is not told who can promote, and has no way to ask from the screen.

**Strengths:**
- the same bundle is activated, with nothing rebuilt;
- a dev deploy with a missing binding warns;
- the preview shows changes;
- a release branch is pushed.

**Target journey:**
- **Request promotion** creates a pending item on the tenant's "Needs attention" list for members with `promotion:write`.
- The Release step names who can approve.
- This reuses the approvals pattern rather than a new system.

## Journey 9: Expose a script to an agent (MCP)

Traced in `routes/mcp.ts`, `screens/Tenant.tsx` (service account → Agent access) and `examples/fernhill/src/apps.ts`.

1. Tenant → Service accounts → create → open → **Agent access**: the address, a config snippet, and the tools this account would be offered.
2. Decide what it may run with a role binding. Fernhill does this in code with `defineBinding`, then deploys.
3. Create a key, then paste it into the agent's config.

**Measures:**
- 6 or more clicks, 2 fields, 3 pages.
- **Context switch:** 1 when bindings are kept in the repository.
- **Unguided decisions:**
  - which role grants exactly "run these 5 scripts";
  - what tool names the agent will see. The Agent access tool list answers this, but only after the binding exists.

**Strengths:** tools are derived from the caller's bindings, and every call is authorized and audited with `via: "mcp"`. This is more principled than the reference products' MCP features, which expose either platform operations or a hand-picked list.

**Target journey:**
- On a script or flow inspector, **Offer to an agent…** picks or creates a service account and adds a resource-scoped binding.
- The Agent access screen gains a **Try a tool** form that calls it as that account.
