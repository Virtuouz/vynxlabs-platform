# Phase 31: every screen and feature of Volvel is documented

Status: built, at the owner's end-of-phase stop, on branch `phase-31-write-the-docs`, off `phase-30-docs-system`. Nothing merged, pushed or published.
Last updated: 2026-11-23

The owner asked for documentation of every screen and feature, the console and local development, with self-hosting and administration (2026-11-22). Phase 29 corrected the product, phase 30 built the system the pages live in (`/docs` on every instance, the help panel, the static export, Diátaxis types, generated reference). This phase writes the pages. The plan is `~/.claude/plans/i-would-like-to-fuzzy-meteor-of-45518b7f-b8fc-41f4-9613-9ba4253edadd.md`; the writers' briefs are `docs/documentation/inventory/*.md` (refreshed in phase 30 M0).

**Exit criterion.** On `examples/fernhill`, in a browser, at `/docs` and in F1:

- someone new signs in, follows Get started, and makes a first script, a first approval flow and a first app by its tutorials alone;
- every screen of the console has a reference page that F1 opens, every how-to the briefs list is there, and each tutorial and how-to was done on a throwaway instance as written;
- a developer installs the CLI as published (and from source), follows the Develop quickstart to a deployed repository, and finds every command, SDK export and API route in the reference;
- an administrator sets up members, groups, SSO and audit from Administer;
- an operator installs Volvel with Compose from Self-host, restores a backup and rotates the master key as written;
- `pnpm docs:check` passes with no stub, no warning beyond the ratchet, and every page carries a type.

## Owner decisions

| Area | Decision |
|---|---|
| Form | Diátaxis; five collections; Fernhill is the running example (2026-11-22) |
| Install steps | As published (npm `@volvel/*`, Docker `volvel/volvel`), plus a from-source page; publishing still needs the owner's word |
| Agents | Sonnet writers, up to 20 at once; a second agent checks each page against the code |
| Stops | After M1 (the Tables sample: look and voice), and at the end |

## Milestones

| # | Milestone |
|---|---|
| M0 | Style guide: voice, terminology, labels, the four page templates, what not to describe |
| M1 | Sample: Tables, as reference, how-tos, an explanation and a tutorial, with screenshots; stop for the owner |
| M2 | Get started |
| M3 | Console |
| M4 | Develop |
| M5 | Administer |
| M6 | Self-host |
| M7 | Retire the old guides; README, SECURITY.md, CHANGELOG |

## Findings

- **M0, the style guide** (`docs/documentation/style-guide.md`): voice, terminology, the four templates, components, fact-check records and run logs. Its gaps closed: the editor's how-to and tutorial templates follow it; the product's pages are checked for avoided words and British spelling; every new page needs a fact-check record and every tutorial and how-to a run log (`packages/docs/unchecked.json` lists the old pages that do not, and only shrinks).
- **M1, the Tables sample**, deployed to the review instance (https://volvel-test.fly.dev/docs/): reference (the Tables screen, column types, filter syntax), five how-tos (rows, definition, who sees rows, retired data, files), a Get started tutorial ("Your first table"), an explanation ("How tables work"), with 18 screenshots in light and dark. Three writers, then two checkers who did not write them: the checks corrected 16 claims (among them: renaming a table is a draft until deployed, Undo covers saved row rules, `a | b` reads "any of these" on text), and the tutorial was done again end to end at 1440 and 390.
- **Product faults the writing found, fixed:** a row's file field offered Replace when there was no file; the "Saved" line vanished in the row rules' "Rules decide" mode; descriptions were cut at 500 characters at submit; at 390 a table's columns hid their rules and their actions off-screen.
- **Asked of the owner at the M1 stop** (answered 2026-11-24): screen references stay complete (every control, state and permission). Pictures open larger in an animated view; the phone menu slides from the right; tables of three or more columns stack on a phone, with striped rows; inline code is set apart by tokens (lane site).

- **M2 to M6, the pages.** 414 pages under `packages/docs/content` (start 16, console 112, develop 65, administer 61, self-host 54, beside their indexes; 14 tutorials, 146 how-tos, 109 reference, 39 explanation), about 300,000 words, plus the generated reference: `pnpm docs:check` passes on 516 pages, every page typed, the 61 help topics the console asks for all found, 578 of 578 kind fields described. 19 Sonnet writers, one area each (`docs/documentation/inventory/`), then 16 checkers who had not written the pages, one area each, then 3 that checked the 14 tutorials end to end in one pass each on the current build. Every page has a fact-check record (`docs/documentation/factcheck/`, 304) and every tutorial and how-to a run log (`docs/documentation/runs/`, 187). The checks corrected several hundred claims against the code; the run logs say what each run did and what could not be run.
- **Run, not only read.** On throwaway instances: git sync against a local git server; SCIM and two-person access approval; OAuth against a stand-in provider; mail against a stand-in SMTP server; the agent (MCP) tools; SSO with Keycloak, a certificate change and SCIM; and for Self-host, in Compose stacks of their own: an install from a locally built image, a backup and a restore into a fresh stack, a master key rotation (also across two replicas), `rekey --data-role`, `recover-operator`, a standalone worker, a read-only database, a Postgres 16 to 18 upgrade, a proxy, OpenTelemetry export to a local receiver. The CLI was run from `pnpm pack` tarballs.
- **Not run anywhere, and said so in the run logs:** anything that needs the internet: real DNS (proving a domain), hosted identity providers (Entra, Okta, Google), GitHub Actions, installing from the npm registry and Docker Hub (nothing is published), Caddy and nginx, Fly, a two-machine offline transfer. The Self-host tutorial was done on the build before the last fault lanes, not again on the final one: the checker's Compose stack was refused by the permission check.
- **Product faults the writing found, fixed in seven lanes** (`docs/documentation/fixed/p31-fa.md` to `p31-fg.md`), about 100, each with a test seen failing first. Among them: an install by the docs left the worker host failing (empty `MANAGED_WORKER_*` in the shipped Compose); every current worker was shown "Older version, takes no tasks"; a service account's key could not run any CLI command naming a tenant, so CI as documented could not work; a webhook's 401 echoed its secret path; a documented restore ended with exit status 1; `volvel promote` crashed on a refusal; a canceled flow run never published `platform/flow-run-finished`; the script editor's code area was 5 px high on a tablet or phone; a waiting run had no Cancel; four git sync miscounts; a raw TypeError on a new mail connection's Test; a date in a row action's question a day off its cell; many lists that hid their actions or statuses at 390; "bound" and "the platform" left in the product's words (a test now fails on "the platform").
- **Two fixes of this phase were wrong and were undone:** lane fa's listing of removed apps made a doc writer's Deploy ask `deployment:write` whenever an App Builder app's removal was drafted (found by the Console tutorials' check; now only a docs site's removal is the documentation's); lane fc gave each toast `role="status"`, so each was read out twice beside the live list (found by the kit's test in the full suite; reverted).
- **Screenshots.** 85 pictures in the manifest, each in light and dark, now kept one file per area (`packages/docs/shots/<area>.mjs`, scenes in `e2e/scenes/<area>.ts`), and `SCREENSHOTS_ONLY` takes one area alone. Each was taken and looked at by the agent that made it. The release's picture instance serves apps at the console's address (`APPS_ON_CONSOLE_ADDRESS=true`), so the Apps pictures show apps served.
- **M7.** `docs/self-hosting.md` and `docs/sdk-guide.md` point to their pages under `/docs`, section by section; README (documentation and install), deploy READMEs, SECURITY.md (D61, D62), the Dockerfile, env examples and CLI help point to `/docs`; the CHANGELOG has phases 30 and 31.
- **Full suites, once at the end.** `pnpm test`: 4968 of 4984 passed; the failures were tests still expecting the old words and the old 202 body of a waiting access change, one test of this phase's own written while the suite ran, and the double-read toast above; all fixed and their files rerun. `pnpm e2e`: the first run was against an instance not seeded with Fernhill (83 passed, 15 failed, most at sign-in as Fernhill's people); seeded, as CI does, the whole suite passed: 221 passed, 2 skipped. One spec was out of date with the richer help page (a heading named exactly), fixed.

## Polish gate

1. **Rules.** The pages are not screens; the screens this phase changed are the fault lanes', each held to the rules its fault broke (POLISH-004 lists at every width, -009 states, -012 saves, -013 the shared piece) in `docs/documentation/fixed/p31-*.md`.
2. **Siblings.** Fixed in the shared piece and its callers listed: `kit/SplitPane.tsx` (every stacked pane), `StatePill`, `DataTable`'s `beside`, `ChoiceList`, `DrawerEditor`, the lists' priorities (enforced by `ListsPriority.test.ts`), one formatter for a moment (`formatMoment`), one list of SSO refusal words, one ownership helper, `useSeen` for every list's description.
3. **Lifecycle.** Not new here: the pages describe every lifecycle the product has; where a lifecycle stops short the fault lists say so (e.g. removing a docs site's app is now a deployable change).
4. **States.** The screen references list every state of every screen; the faults found in them were fixed (a contradictory "nothing to promote" state, a raw schema error, an Internal Server Error, a description shown again in a new browser).
5. **Walk.** On throwaway Fernhill instances (:8091, never the owner's or the live test instance), at 1440, 768 and 390, light and dark, by keyboard and after a reload: `docs/documentation/walks/p31-docs.md` (`/docs`, the help, a tutorial's last steps: no fault), `p31-fb.md`, `p31-fc.md`, `p31-fa-fe-ff.md` (the fault lanes' screens). They found the faults of lane fg and a description that still showed in a new browser (fixed: the settings start loading before the screens draw; seen folded in a new browser with the settings held back 2.5 s).
6. **Guards.** Typecheck and touched tests per lane; the full suites above. `product-words.test.ts` (no "the platform"), `ListsPriority.test.ts`, `docs:check` with its ratchet (`unchecked.json` down to 4 pages and 3 word entries).
7. **Left out.** Nothing of the owner's decisions or the exit criterion was trimmed. What could not be run is above and in the run logs.


## Asked of the owner at the end of the phase

1. **Behavior the fault lanes changed, to confirm:**
   - **Fire now** now counts as a firing and sets **Last fired**. It reverses the earlier OPS-16/19 rule.
   - An HTTP connection's **Test** reads any HTTP answer as **Reached**, with its status; only 401, 403 and 407, or no answer, fail.
   - `GET /tenants` answers a service account's key with its own tenant, so CI with a service account works.
   - A waiting access change answers 202 in one shape, `{waiting, release: {…}, detail}`, for releases and rollbacks alike. This is a contract change for API clients.
   - A worker counts as outdated only when it is older than both 0.6.0 and the control plane's own version.
2. **The old Fly app** `vynxlabs-platform-test` and its database are stopped, not deleted. Delete them?
3. **The Self-host tutorial** was done on the build before the last fault lanes. Run it again on the final build in a Compose stack of its own?

## Next, by the owner's choice (2026-11-23)

The first thing after this phase's review: make the browser suite faster without dropping it. Measured causes: one worker (`e2e/playwright.config.ts`), two slow specs (`polish-measures`, one 6-minute test; `polish-layout`, 6.7 minutes in order), and 116 sign-ins through the form under the instance's limit of three per ten seconds. To do: sign in once per person into saved sessions, run 4 to 6 workers with the files that change shared data kept in order, split the slow specs per screen, and run only the specs a change touches while developing; the full run stays at a phase's end and in CI.
