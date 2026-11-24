<!-- What is left of phase 29 after tiers 1 and 2: each lane is a section. -->
# Phase 29 backlog after tiers 1 and 2

Built from findings/*.md, fixed/*.md (to `04067d33`), findings/walk-tier1.md, decisions.md and findings/vocabulary.md. Excluded because lanes bldwid, acc2 and api2 are working: every BLD-, WID-, ACC- and API- row (and the decisions they carry: D35 and D36 with BLD-10 and WID-29, D50 with API-16, D52 with BLD-06, D56, D58). Excluded as done: everything with a `##` entry in fixed/ (tier 1 and 2 lanes acc, app, cfg, cfg2, clirel, dat, dat2, draft, ext2, files, flw, flw2, gov, host, host2, ins, ins2, mask, mask2, opsa, opsb, rel, scr2, shl, tab, tab2, trg, walk1, wid) and TAB-13..38, INS-11..29 as listed in their lanes.

Size S / M / L. "Sees" = a person sees it (needs the Polish gate and a walk); "no" = server, CLI, docs or test only. Items marked (verify) may have been done in passing: grep before starting.

Counts: tier 2 remainder 79 items in 6 lanes; tier 3 (missing parts) 121 items in 10 lanes; tier 4 rough 54 items in 5 lanes; tier 4 vocabulary 52 items in 4 lanes.

---

# TIER 2 REMAINDER (broken or wrong rows no lane took, and what lanes left or found)

## Lane t2-sso (SSO screens and provider kernel) 12

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| GOV-12, D18 | A wrong password keeps the recovery code; the form says so (gov lane: "not among my rows") | kernel auth recovery path | S | yes |
| GOV-13 | A public OIDC client can be connected and never turned on | kernel/sso/providers.ts, SingleSignOn.tsx | S | yes |
| GOV-14 | Scopes field drops a typed space | SingleSignOn.tsx | S | yes |
| GOV-15 | An issuer with a path and a trailing slash cannot be connected | kernel/sso/providers.ts | S | yes |
| GOV-16 | Header says On after the last domain turned the provider off | SingleSignOn.tsx | S | yes |
| GOV-18 | Malformed attributes and group mappings are dropped and the save says it worked | SingleSignOn.tsx, providers.ts | M | yes |
| GOV-19 | Group mappings from an access release show a Remove that does nothing | SingleSignOn.tsx | S | yes |
| GOV-28 | An expired SCIM token looks live | Provisioning.tsx:144 | S | yes |
| WLK-12a | A saved issuer change says "The provider was saved." and not that its secret was dropped | SingleSignOn.tsx:729 | S | yes |
| WLK-12b | A refusal for a missing permission names the permission and nobody who can give it (POLISH-009; the shared piece that words refusals) | apps/console/src/api.ts or the refusal wording piece | M | yes |
| WLK-12c | A pattern refusal shows the raw regex; a short export passphrase shows the browser bubble: word it per field in one place | shared form error piece | M | yes |
| WLK-12d | Disabling an operator who belongs to no tenant shows no notice | Operators screen | S | yes |

## Lane t2-govb (domains, audit, workers, branding, retention) 10

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| GOV-17 | Audit filters can show the previous filter's entries | Audit.tsx | S | yes |
| GOV-21 | Adding an instance domain says to prove it with a record that is not there | Domains.tsx, routes/apps.ts | S | yes |
| GOV-22 | Contrast check passes colors it cannot read | Branding.tsx:278, ui contrast helper | S | yes |
| GOV-23 | Workers says the instance starts workers when it starts none | Execution.tsx:1149 | S | yes |
| GOV-24 | A hostname that is not enabled serves the console where Domains says it serves nothing | routes/apps.ts, Domains.tsx | M | yes |
| GOV-25, D45 | A check that finds no record leaves the name Verified: show and audit it, stop nothing | kernel domain check, Domains.tsx | M | yes |
| GOV-26 | Retention says audit entries go within minutes and cannot be brought back | Retention.tsx:85,118, routes/tenants.ts:427 | S | yes |
| GOV-27 | The audit area list lacks most areas | Audit.tsx, routes/identity.ts | S | yes |
| GOV-29 | Worker permission words claim the managed-workers switch | manifest/permissions.ts:176 | S | yes |
| GOV-30 | The export's "not carried" list leaves out SCIM tokens and more | export screen, kernel/tenant export | S | yes |

## Lane t2-docs (docs system, and docs that say what is not so) 14

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| DOC-01 | e2e/screenshots seeds pages with `order:`, which a deploy refuses | e2e/screenshots.spec.ts:78 | S | no |
| DOC-02 | `Doc` drops `glossary`, so `::glossary` is blank in reader and preview | packages/ui/src/Doc.tsx:136 | S | yes |
| DOC-03 | Served sites draw no product terms, resource terms, other apps' terms or `::field` info | kernel/apps/front.ts | M | yes |
| DOC-04 | Help panel has no `image` resolver and draws Mermaid as raw source | apps/console/src/help/HelpPanel.tsx | M | yes |
| DOC-06 | `feedback` schema text names four columns; a deploy requires six | manifest text | S | no |
| DOC-08 | Draft previews, docs search route and `/terms` build without the product's reserved names | front.ts:1278, routes/docs.ts:338, routes/terms.ts:140 | M | yes |
| DOC-09 | A tenant term or topic that clashes with a later product id is dropped silently after an upgrade | docs build | M | no |
| DOC-10 | `/help` pictures with unhashed names cached a year as immutable | app.ts static | S | no |
| DOC-11 | A missing `/help/pages/x.json` answers index.html 200 | app.ts:371 | S | yes |
| DOC-17 | Screenshots are never produced for a release | build/release script | M | no |
| APP-19, CLI-16, TAB-41 | Documentation claims that are not so (sections D of apps-as-code, cli, tables) | packages/docs/content, docs/sdk-guide.md, code comments | M | no |
| Found (6 lanes) | `docs-apps.test.ts` "is refused when a page takes one of the product's own terms" fails in several worktrees; it needs console `dist/help`. Find out whether it is a real fault (DOC-08 is the likely cause) | apps/control-plane/src/docs-apps.test.ts | S | no |
| dat/dat2/flw2/cfg2 left | Docs lines they did not edit: docs-site pages for dashboards, data sources, queries; SDK guide flow section and `kinds/flow.md`; configure/settings.md and variables.md; `docs/` app-builder-editor.md; draft-save contract in the API reference. Most belong to phase 31's pages: confirm which | packages/docs/content | M | no |

## Lane t2-walk-data (data, tables, queries, widgets: walk and lane leftovers) 14

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| WLK-07 | Change on a data source asks for the password when host/port/user/encryption differ, says the stored one will not go there; a source with no password tests as "No password is set" | Data.tsx ChangeSource, kernel/data/health.ts:41 | M | yes |
| WLK-09a | Focus returns to what opened the action after a purge, a rename and Discard in Queries | Data.tsx ~1416, Queries.tsx | M | yes |
| WLK-09b | Add column says "Created."; retired pill cut to "Retir..."; console-made table says "Managed in: Repository" | ListScreen.tsx:243, Data.tsx | S | yes |
| WLK-09c | Back after Discard leaves `?query=` on a blank query (with DAT-26 in tier 4); "Name and path" enabled on a removal draft | Queries.tsx | S | yes |
| WLK-09d | Undo refused after another window's change says "Reload it" though the change shows; Data sources at 390 scrolls sideways with Unbind out of view | Data.tsx | S | yes |
| WLK-11a | A custom confirmation title with a field reads "Remove the invoice?" for several rows; give the count | packages/screens/src/actions.tsx fillText | S | yes |
| WLK-11b | A flow that refuses its input shows two alerts: one, in words | packages/screens, routes/page-actions | S | yes |
| WLK-11c | Rows behind a money pivot cell show cents where the widget shows dollars | widgets-core pivot / rows-behind | S | yes |
| WLK-11d | Clearing an action's message and adding it again orders message before close | actionModel / timeline | S | yes |
| tab left | Two retired tables of one name: detail page is opened by name and shows the first | Data.tsx tables/* | M | yes |
| tab2 found | App form's picker searches the display column with `contains` whatever its type (a numeric display column answers 400) | routes/widget-choices.ts:132 | S | yes |
| tab2 found | Deploy's reference check does not name the tables that refer to a dropped one | kernel/data/plan.ts or bundles check | S | yes |
| cfg2 found | The data source page has no Change/Test beside its list row | Data.tsx | S | yes |
| files left | Files of rows removed by a reference rule or table drop are not noted (D22: kept for the audit period) | kernel/data/files.ts | M | no |

## Lane t2-walk-flow (flows, runs, approvals, masking: walk and lane leftovers) 15

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| WLK-15a | Renaming a case with Enter loses its edge until reload (`useUpdateNodeInternals` not called) | FlowEditor.tsx:268 | S | yes |
| WLK-15b | Header names compare case-sensitively; `X-One` and `x-one` both save | FlowEditor.tsx:2579 | S | yes |
| WLK-15c | A 300 KB trigger input fails "No such key: blob"; panel shows the stored reference: read it where kept, or say so | run input read path, RunPage | M | yes |
| WLK-15d | A deploy with problems shows raw "bundle's manifests are not valid" and names a problem the editor list does not: one list, in words | FlowEditor.tsx problemsAt, deploy refusal | M | yes |
| WLK-15e | Add step: Enter does not pick the first match | FlowEditor.tsx | S | yes |
| WLK-15f | Small: "Draft Draft", reserved case name says "already used", "otherwise" cut, approval link page times with no zone (D21), Triggers path breaks mid-word, minimap covers canvas at 390 | FlowEditor.tsx, approval link page | S | yes |
| WLK-16a | A service account's decision has no name in `decidedSteps` and the retry plan's `approvalsKept` | kernel/pages/approvals.ts, routes/flows.ts | M | yes |
| WLK-16b | `fireScheduleNow` ignores a schedule's `source` | kernel/triggers (routes/execution.ts) | S | no |
| WLK-16c | A child flow run's ID, and an exact run ID older than When, say "No run has this ID" | Runs.tsx, routes/operations.ts | S | yes |
| opsb found | The run page and Runs inspector read `trigger.relay` with no schema | RunPage.tsx, run schema | S | no |
| opsa found | `kit/paged.tsx` folds to page 1 and loses the reader's place (OPS-11 sibling) | apps/console/src/kit/paged.tsx | S | yes |
| opsa/trg found | Run-ended metric and trace record "succeeded" before the relay can fail the run | kernel/execution/runs.ts completeRun | S | no |
| mask2 found | Approval title is shown unmasked by value in lists, mail, decided list | kernel/flows/approval-detail.ts, approvals.ts | S | yes |
| mask2 found | Flow-level expression errors and event-filter refusals (`recordRefusal`) can quote payload values | routes/flows.ts, kernel/flows | S | yes |
| flw2/ext2 found | Editor opens a deployed flow without its saved arrangement; draft-only flow link lands on "not found"; poll trigger source that is only a draft is not offered; script step name cleared loses icon and group | FlowEditor.tsx, kit/objects.tsx:19, ResourceEditor.tsx:323 | M | yes |

## Lane t2-walk-shell (config, release, repo, groups: walk and lane leftovers) 14

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| WLK-17a | Connections at 390 and 768: columns overlap, "Failed" cut, "Used by" runs into "Kind" | screens/Execution.tsx:717-760 | S | yes |
| WLK-17b | A group member's address changed with a stored credential: warn and say Save drops it (D10), as the wizard does | GroupMemberSheet.tsx:121 | S | yes |
| WLK-17c | Flow editor, same draft in two windows: status stays "Saving...", no "Copy what I wrote" | FlowEditor.tsx:1403 | S | yes |
| WLK-17d | Docs editor: a removed page opens as an ordinary draft; give it the removal state | screens/docs/Docs.tsx | M | yes |
| WLK-17e | Schedule editor at 390: title cut, pills under buttons | ResourceEditor.tsx header | S | yes |
| WLK-17f | Import check: format 1 line is a red cross though allowed, overflows at 1440 and 390 ("Members 0": verify INS-11) | Environments.tsx import check | S | yes |
| WLK-17g | Production "Set up a connection" with nothing arriving opens an empty form with disabled Save | Connections / ObjectPages | S | yes |
| WLK-17h | Git sync shows the branch in capitals; Release refusal list is one run-on paragraph, says "then deploy again" in production, "Removes the trigger_source.", "1 workspaces"; Set up links for a secret or variable do not select it | Release.tsx, kit/DeployMenu.tsx, Git sync | S | yes |
| WLK-17i / WLK-12e | Focus falls to the body after Discard, Keep, "Load their version" and after approving a release: return it to the opener (shared piece) | packages/ui Dialog/SideSheet, kit | M | yes |
| WLK-12f | Error toasts sit over the inspector's buttons at 1440: never cover what they are about | kit toast + Inspector | M | yes |
| WLK-12g | Groups at 390: Delete clipped, tab strip cut; domain hostname breaks mid-word; role Summary says "Rows, Rows, past the row policy" | Groups.tsx:229-248, Domains.tsx, role Summary | S | yes |
| cfg2 left | A connection bound, undeclared and whose bundle left the five newest uploads reads `unknown`; Unbind on the connection page | kernel connections, ObjectPages.tsx | M | yes |
| clirel left | A link change not yet saved on the settings page is lost when the button is used | Workspace settings | S | yes |
| WLK-10 left | The manifest has no flag for an action that destroys, so its confirmation never starts on Cancel (owner question: add `danger` to `confirm`?) | manifest action schema, actions.tsx | M | yes |

(WLK-12 items on AccessReleases at 390, Members "Through groups only" and disabling an end user belong to acc2 rows ACC-30/34/36 and are not here; WLK-17's App Builder clash and removal wording belong to bldwid.)

---

# TIER 3: MISSING PARTS (the API takes it, no control)

## Lane t3-account (Account, sign-in providers, audit filters) 14

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| SHL-MP2 = INS-MP2 = ACC-MP2 | Your sessions: list, end one, end the others (`/auth/list-sessions`, `/auth/revoke-session`, `/auth/revoke-other-sessions`). Change password is done (ins2) | Account.tsx | S | yes |
| SHL-MP3 = ACC-MP3 | Profile name (`/auth/update-user`), not while SCIM or a provider owns it | Account.tsx | S | yes |
| SHL-MP4 = ACC-MP4 | API key expiry at creation (`expiresAt`), Expires column | Account.tsx, service accounts | S | yes |
| ACC-MP17 | "What I may do here" for oneself without `binding:read` | tenant menu / Account | S | yes |
| GOV-P1 | SCIM token expiry (`expiresInDays`) and a column | Provisioning.tsx | S | yes |
| GOV-P2 | SAML `nameIdFormat` | SingleSignOn.tsx | S | yes |
| GOV-P3 | SAML "Read the metadata again" (`metadataUrl` / `metadataXml`) | SingleSignOn.tsx | S | yes |
| GOV-P4 | `defaultRoleId` on an instance provider ("New people") | Instance settings | S | yes |
| GOV-P5 | Sign-in address (`addresses.start`) in Set up | SingleSignOn.tsx | S | yes |
| GOV-P6 | Hostname `PATCH app`: change what it serves | Domains.tsx | S | yes |
| GOV-P7 | Worker credential `workspaceId`: field and column | Execution.tsx (workers) | S | yes |
| GOV-P8 = INS-MP6 | Instance audit filters: action, actor, target type, target, to | Audit.tsx (instance) | S | yes |
| GOV-P9 | Tenant audit: date range, workspace, "Everything about this"; CSV honors them | Audit.tsx | S | yes |
| SHL-13 | Palette finds and remembers only part of the product; send missing kinds, add resource kinds | CommandPalette.tsx, server search | M | yes |

## Lane t3-access (tenant access screens, CLI access) 15

Overlaps acc2 (ACC-24, ACC-36): do P6 and P14 after acc2 merges.

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| ACC-MP5 + APP-MP2 | Give access and Share sheet: one thing in a workspace; people, service accounts, custom roles; "Anyone" (D8 limits it to app-facing roles) | Access.tsx, Share sheet | M | yes |
| APP-MP4 | Workspace- and tenant-level bindings in Open to and Share (APP-14) | Share sheet, Open to | M | yes |
| ACC-MP6 | Bindings of one workspace in Workspace settings (`GET /bindings?workspaceId`) | Tenant.tsx settings | M | yes |
| ACC-MP7 | Add member with several roles (`bindings` up to 20) | Members.tsx | S | yes |
| ACC-MP8 | Group description on create and change | Groups.tsx | S | yes |
| ACC-MP9 | Service account rename, fixed key shown | service account screen | S | yes |
| ACC-MP10 | End user rename | End users inspector | S | yes |
| ACC-MP11 | `domainId` for invitation and reset links ("On which address") | End users | S | yes |
| ACC-MP12 | End-user group `key` and who made it, in the API and on screen | routes/endusers.ts:475, Groups | S | yes |
| ACC-MP13 | A group's `membership.sso.values` ("Filled by sign-in"), changed through the release | Groups.tsx | M | yes |
| ACC-MP14 | One access release, its changes and warnings, at `?release=` | AccessReleases.tsx | M | yes |
| ACC-MP15 | CLI `tenant rollback` shows what going back removes and asks, or `--yes`; `approve` shows the changes | packages/cli/access.ts | S | no |
| ACC-MP16 | CLI `volvel tenant approval on\|off` (`PUT /access/approval`) | packages/cli | S | no |
| ACC-MP19 = INS-MP8 | Grant length 1 to 1440 minutes: "Other" | Open operator access | S | yes |
| D57 | `workspace_admin` gets `interface`, `doc`, `git` (not `code`); its two inert permissions dropped (no fixed file mentions it) | manifest built-in roles | S | yes |

Not built, on purpose: ACC-MP18 (any built-in role at instance scope) contradicts D7; ACC-MP20 (SDK helpers for tenant kinds) contradicts D53 (YAML only, with a schema and a documented script; the schema and script are in lane t3-cli-docs).

## Lane t3-instance (Instance screens, self-hosting) 12

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| INS-MP3 | Instance health: `/readyz`, version and migration level, what `/metrics` gives | Instance.tsx Health | M | yes |
| INS-MP4 = HOST-MP1 | Master key status (`GET /instance/master-key`) | Instance Health | S | yes |
| INS-MP5 | Read-only state: shell strip, save buttons say why, CLI `status` prints it | Shell.tsx, packages/cli | M | yes |
| INS-MP7 | Operator powers on a tenant without a grant: `managedWorkers`, retention | Tenant detail | M | yes |
| INS-MP9 | A location's description and address (Edit) and an inspector with its tenants (goes with INS-08) | Locations screen | S | yes |
| INS-MP10 | `volvel instance triggers pause` (GET/PUT `/instance/triggers`) | packages/cli | S | no |
| INS-MP11 | Read and remove a staged import after a reload | Environments.tsx import | M | yes |
| INS-MP12 | Tenants filter or link by location | Instance tenants list | S | yes |
| HOST-MP2 | What a replica is set to (mode, slots, floor, pools, retention, mail, apps address, networks) | route + Instance Health | M | yes |
| HOST-MP3/4 | Standalone worker and worker host settings in compose (`concurrency`, `idle-exit`, `--run-slots`, `--memory-floor`, `--max-workers`, uid, gid) (verify HOST-11/20) | deploy/worker/compose.yaml | S | no |
| HOST-MP5 | `--help` for `volvel-start`, `migrate`, `rekey`, `check-config`; an unknown word starts the instance (verify HOST-08/09) | apps/control-plane/src/main.ts | S | no |
| HOST-MP7 | Per-host health a host and a standalone worker answer to (verify HOST-10) | worker host bin | S | no |

## Lane t3-config (connections, variables, scripts' settings, git/repository) 12

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| SCR-08 / SCR-MP1 | Script Settings: memory, retry delay and backoff, concurrency, pool, uses of tables/sources/events/groups, `onFailure` (the shared set the list inspector also reads) | Authoring.tsx Settings | L | yes |
| EXT-MP3 | Worker pool field for a trigger source (same shared Settings) | ResourceEditor.tsx | S | yes |
| EXT-MP4 = EXT-12 | Problems tab for extensions with file and line jump (`buildIssuesOf`) | extension editor | S | yes |
| CFG-MP1 | Unbind on a connection's page (left by cfg2) | ObjectPages.tsx | S | yes |
| CFG-MP2 | Custom connectors in the wizard's Kind; "What it is for" | ConnectionWizard.tsx:384 | M | yes |
| CFG-MP3 | Set a variable where it is: row and page, prefilled, multi-line | Variables, ObjectPages.tsx | M | yes |
| CFG-MP4 = REL-MP5 | Workspace run limit `concurrencyLimit` 1 to 1000 in Workspace settings (verify Tenant.tsx) | Tenant.tsx | S | yes |
| CFG-MP5 = DAT-MP5 | Remove a stored credential (`credential: null`; a source's `password: null`) in `SecretField` | SecretField, Change forms | M | yes |
| REL-MP3 | Repository fields: `username`, `releaseBranch`, `tenantBranch`, the check route | Git sync Repository form | M | yes |
| REL-MP4 | Git operations history and branches overview | Git sync | M | yes |
| REL-MP7 | "Used by" for queries, dashboards, sources and docs | ObjectPages.tsx | M | yes |
| APP-MP3 | Apps list: sort, filter, search, Unpublish and Delete | Apps.tsx | M | yes |

## Lane t3-tables (Tables screen) 10

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| TAB-P1 | Unique on a column; refusal names the values | Data.tsx column actions | S | yes |
| TAB-P2 | Required and default of an existing column (`set_required`, `set_default`) | Data.tsx | M | yes |
| TAB-P3 | Change a column's type and the table a reference points to | Data.tsx | M | yes |
| TAB-P4 | Indexes section in Definition, linked from the 422 "add an index"; SDK `indexes` cannot name `created_at` | Data.tsx, packages/sdk | M | yes |
| TAB-P5 | Create table with description, several columns, reference first column, who sees rows | Data.tsx CreateTable | M | yes |
| TAB-P6 | Bring back a retired table (button, console-made ones) | Data.tsx | M | yes |
| TAB-P7 | "See it as" a group (`asGroup`) | Data.tsx | S | yes |
| TAB-P8 | Filters: not, in, not empty, or, ranges | packages/ui Grid, Data.tsx | M | yes |
| TAB-P9 | Sort by several columns | Grid, URL state | S | yes |
| TAB-P11 | Cell controls in the grid for choice, list, reference, date, time (with TAB-31) | packages/ui Grid | M | yes |

## Lane t3-data (queries, sources, dashboards, files) 11

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| QSD-MP1 | Declare data sources in the console (`EDITED_KINDS` leaves `data_source` out) | ResourceEditor.tsx:36 | M | yes |
| QSD-MP2 | A resource dashboard can be changed, renamed, removed in the console; its draft is listed | routes/dashboards.ts:133, Dashboards.tsx | L | yes |
| QSD-MP3 | A query's description and its parameters' name, type, label, default, required | Queries.tsx | M | yes |
| QSD-MP4 = TAB-P10 | Files screen: list (cursor), upload, download, delete, what names it | Data, routes/sources.ts:494 | M | yes |
| QSD-MP6 | Add a row to a keyless source table (verify DAT-23 only fixed the note) | RowsBrowser | S | yes |
| QSD-MP7 | Run a saved query without `sql:read`: the screen and the route agree (D25 side) | Queries.tsx, routes/queries.ts | S | yes |
| QSD-MP8 | Run `limit` up to 10,000 | Queries.tsx | S | yes |
| QSD-MP9 | Dashboard `description` field, shown under the title | Rename, Dashboards.tsx | S | yes |
| QSD-MP10 | A source's table in "Where it reads from" (after DAT-Q1) | inputs picker, kernel/pages/inputs.ts:534 | M | yes |
| QSD-MP11 | An unbound source's own Connect on its row | Data sources list | S | yes |
| Found | Queries list shows `renamedFrom` and title (DAT-30 in tier 4 is the same item) | Queries.tsx | S | yes |

## Lane t3-flow-editor (flow inspector) 13

All in `FlowEditor.tsx` / `FlowSteps.tsx` with the manifest in `packages/manifest/src/flow.ts` (checked by `checkFlow`). MP-2 (`flowFrom`) is done by flw2 (FLW-14).

| Id | What | Size | Sees |
|---|---|---|---|
| FLW-MP1 | For each: how many at once (`concurrency` 1 to 20) | S | yes |
| FLW-MP3 | What a step hands its script (`with` on script and for each: connections, tables, events) | M | yes |
| FLW-MP4 | Approval timeout (`timeoutSeconds`), number with unit, shared with Wait | S | yes |
| FLW-MP5 | Approval: who may decide (`approvers.groups`, `.roles`; what "nobody" means) | M | yes |
| FLW-MP6 | Event start filter (shared with ResourceEditor.tsx:646; preview must not show `trigger` and `steps`) | S | yes |
| FLW-MP7 | Tags on a start (webhook, schedule, event; also trigger, schedule kinds' editors) | S | yes |
| FLW-MP8 | Manual start: the input JSON Schema (draws the Start form and the agent tool) | M | yes |
| FLW-MP9 | Webhook signature: what is signed, timestamp header, tolerance (Slack, Stripe-like senders) | M | yes |
| FLW-MP10 | Error path from Branch and Set (dot or field; list edges written in code) | M | yes |
| FLW-MP11 | Expressions in choice, yes/no and pick fields ("use an expression" switch) | M | yes |
| FLW-MP12 | Change which script a step runs without "As one expression" | S | yes |
| FLW-MP13 | Retry on a chosen version (`bundleId` on retry) | S | yes |
| FLW-MP14 | Cancel flow runs in bulk by age (`olderThanSeconds`); same for script runs | S | yes |

## Lane t3-flow-ops-sdk (events, runs, SDK) 10

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| FLW-MP15 | SDK `step.foreach` and `step.subflow` with `flowFrom` and `allow` | packages/sdk/src/index.ts | M | no |
| FLW-MP16 | SDK `tags` on `trigger.schedule`, `trigger.webhook`, `trigger.event` | packages/sdk | S | no |
| FLW-MP17 | SDK `layout` in `defineFlow` (FLW-15 sibling) | packages/sdk `FlowOptions` | S | no |
| OPS-MP1 | Publish an event by hand, with a form from its schema | Events screen, routes/flows.ts:1763 | M | yes |
| OPS-MP2 | Platform events in the event picker, with payload fields (one shared list for ResourceEditor.tsx:640 and FlowEditor.tsx:1544) | manifest bundle-check.ts:25 | M | yes |
| OPS-MP3 | Fire now for a flow's schedule | Operate.tsx:444,501, ObjectPages.tsx | S | yes |
| OPS-MP7 | Runs between two times ("Between...") in the address and saved views | Runs.tsx, routes/operations.ts:231 | S | yes |
| OPS-MP8 | Run later with a priority (`startAfter`, `priority`), after OPS-25 | run dialog | S | yes |
| OPS-MP9 | What a run published (`events?run=`) on the run page | RunPage.tsx | S | yes |
| OPS-MP10 | What a failure's notification did (`run.alert.notified`, `handlerError`, `repeats`) | RunPage.tsx:511 | S | yes |

## Lane t3-cli-docs (CLI, local development, docs engine, written policy) 14

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| CLI-MP1 | `deploy --preview` (dry run) as `promote --preview` does | packages/cli | M | no |
| CLI-MP2 | `deploy --message` and `promote --message` (default: git commit subject in CI) | packages/cli, routes/execution.ts:649 | S | no |
| CLI-MP3 | `volvel rollback <version>` (verify the API takes it) | packages/cli | M | no |
| CLI-MP4 | `entry` and `resources` options for `buildBundle` (flag or `volvel.yaml` key) | packages/cli build.ts:52 | S | no |
| CLI-MP5 | Local run parity and a fake-context harness (`@volvel/sdk/testing`) | packages/cli/src/local.ts, sdk | L | no |
| CLI-MP6 | `--json` on whoami, status, runs, deploy, promote; `logout` and profiles | packages/cli | M | no |
| CLI-MP7 | `volvel dev` for file apps, interfaces and docs (decision if wanted) | packages/cli | L | no |
| APP-MP1 | `volvel dev` enforces the app CSP (`APP_POLICY`, `--strict` default on) | packages/cli dev | S | no |
| DOC-MP2 | Draw `since` in the help panel and served product pages | HelpPanel.tsx, docs engine | S | yes |
| DOC-MP3 | Section hits in the panel's search (`PageIndex.grouped`) | docs-engine search.ts | S | yes |
| DOC-MP4 | Export `fields.json`, `assets/*`, `openapi.json` from `@volvel/docs` | packages/docs exports | S | no |
| D53 | Tenant access in YAML only: a schema for it and a documented script for the API | schemas/, docs | M | no |
| D51, D60, D62 | Document session lifetime 7 days (D51); publish the widget contract page marked for contributors (D60, ext2: "nothing in code"); SECURITY.md: supported versions = newest minor and the one before (D62; its first publish date stays unset) | docs, SECURITY.md | S | no |
| D37 | Move `labs/goal` to `core/goal` and keep a test-only widget in labs (no back-compat owed) | packages/widgets-labs, widgets-core, manifest, docs (writing-a-widget.md) | M | yes |

## Lane t3-widgets (widget drawers) 11

Overlaps bldwid: confirm bldwid is not taking any WID-M item before starting.

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| WID-M1 | Form field `initial` ("Starts as": nothing, today, me, a value) | kit/inspector fieldsList.tsx | S | yes |
| WID-M2 | Action `done` ("When it is done, say") | ActionEditor | S | yes |
| WID-M4 | Detail field `as`, `badges`, `statusBadges` (with WID-19's `editBy` rules tab, bldwid) | registerRecords.ts, field editor | M | yes |
| WID-M5 | Table column `as: bar`, `delta` | ColumnEditor | S | yes |
| WID-M6 | Chart: x and y as columns, 2 to 6 measures, scatter, sort | chartDrawer.tsx, ChartData | L | yes |
| WID-M7 | Pivot third breakdown ("Then by") | pivotDrawer | S | yes |
| WID-M8 | `compareTo` when a page has several date ranges | stat/chart drawers | S | yes |
| WID-M9 | Condition values `{record: column}` and `{user: id}` | rowsItUses.tsx | M | yes |
| WID-M10 | Visual query `joins` (up to 6) | rowsItUses.tsx | L | yes |
| WID-M11 | A saved query's constant `values` | rowsItUses.tsx | M | yes |
| WID-M3 | Detail `editBy` control: lives with WID-19 (bldwid), listed so it is not lost | Rules tab | S | yes |

---

# TIER 4: ROUGH ROWS (not in running lanes)

## Lane t4-data (queries, dashboards, tables) 10

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| DAT-24 | Save and New dashboard offered to people who may not use them | Dashboards.tsx | S | yes |
| DAT-26 | `?query=` of one that is not there shows "A new query" | Queries.tsx | S | yes |
| DAT-27 | A dashboard reads on a timer in a hidden tab | Dashboards view | S | yes |
| DAT-28 | Figures over a source's table say the table is not there | widgets-core / data route | S | yes |
| DAT-29 | Pages of a keyless source table may repeat or skip rows | routes/sources.ts | M | no |
| DAT-30 | A saved query's title and `renamedFrom` are not in the Queries list | Queries.tsx | S | yes |
| DAT-32 | Share does not say what it leaves out for a member without `group:read` or with 200+ groups | Share sheet | S | yes |
| DAT-33, D52 | Dashboard names over 100 letters refused after the dialog closed (100 everywhere, in the field) | Dashboards.tsx, manifest | S | yes |
| TAB-39 | Grid tells a screen reader row numbers past its own count | packages/ui/src/Grid.tsx | S | yes |
| TAB-40 | "See it as" offers only the first 200 end users and shows raw values | Data.tsx | S | yes |

## Lane t4-config-ext (configure, extensions, scripts) 9

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| CFG-20, EXT-16 | The wizard refuses names with an underscore that the platform allows (one shared pattern) | ConnectionWizard.tsx | S | yes |
| CFG-21 | Kinds unreadable: wizard shows "Loading" for ever with an empty Kind | ConnectionWizard.tsx | S | yes |
| CFG-23 | Setting a variable answers "Created." and an empty value cannot be given | Variables screen | S | yes |
| CFG-24 | A replaced secret leaves the form asking for a new one | Secrets screen | S | yes |
| CFG-26 | Configure offers every change to someone who may only read | Connections, Variables, Secrets | M | yes |
| EXT-10 = SCR-16, D17 | `console_code` switch for an operator and tenant admin, audited (not built twice; clirel left it) | routes/authoring.ts:211, routes/tenants.ts, Tenant screen | M | yes |
| EXT-11 | Code editor types do not include `@volvel/widgets` | code editor typings | S | yes |
| EXT-12 | A read-only repository extension says "Code"; a build error has no line jump (also t3 Problems tab) | extension editor | S | yes |
| (dedupe note) | CFG-20 and EXT-16 are one fix | | | |

## Lane t4-flows-ops (flows, runs) 13

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| FLW-22 | Loops and unreachable groups not flagged until deploy | FlowEditor.tsx problemsAt | M | yes |
| FLW-23 | Limits and step names found only when saving | FlowEditor.tsx | S | yes |
| FLW-27 | Trigger tags that do not parse deploy without a word | kernel bundles check | S | yes |
| FLW-30 | The flow page offers Start, drag and edit to anyone who may read it | Flows page | S | yes |
| FLW-31 | Changing "It starts" and back drops the start's own settings | FlowEditor.tsx | S | yes |
| FLW-36 | Testing one flow is refused while any other draft is broken (owner decides row; D32 changed which drafts a test uses: verify whether still so) | routes/authoring.ts | S | yes |
| OPS-25 | A run set to start later shows as Queued, counted and canceled as queued | Runs.tsx, state.ts | M | yes |
| OPS-30 | "Different from the last success" opens on a difference that shows nothing | RunPage.tsx | S | yes |
| OPS-34 | Sorting by shortest duration puts unfinished runs first | routes/operations.ts | S | yes |
| OPS-35 | Operate and Alerts offer a viewer actions the server refuses | Operate.tsx, Alerts.tsx | M | yes |
| OPS-36 | A trigger paused by one person and again by another names the first | triggers pause | S | yes |
| OPS-37 | A webhook paused alone or by the instance says the workspace is paused | Operate.tsx | S | yes |
| OPS-39 | An operator through an access grant is offered saved views and cannot save one | Runs.tsx | S | yes |

## Lane t4-instance-host (instance, self-hosting) 10

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| INS-10 | Uploaded exports stay on disk for good (INS-06 fixed permissions only) | kernel/tenant import staged | S | no |
| INS-15 | The instance's own database can be registered as a dedicated location | routes/locations.ts | S | yes |
| INS-22 | Every health probe is a trace (ins2 looked and left it; `app.ts` skips `/health` which no route ends with) | app.ts, host2 HOST-29 sibling | S | no |
| INS-25 | Tenants sharing a dedicated database have no share of its connections | kernel/tenancy pool | M | no |
| INS-27 | Disable offered on your own row; disabling twice writes two audit entries | Operators/Members.tsx, routes | S | yes |
| INS-28 | A deleted tenant's log is kept and nobody can read it (D47: read at the instance; ins2 did D47, verify the screen) | Audit instance | S | yes |
| HOST-16 | A malformed `OTEL_EXPORTER_OTLP_HEADERS` stops the instance with a stack trace (HOST-17 changed the worker only) | config.ts | S | no |
| HOST-19 | `MANAGED_WORKERS=process` or `false` in compose: the worker host warns for ever | host bin / compose | S | no |
| HOST-28 | The guide lacks restore, Postgres major upgrade, `AUTH_SECRET` change, air-gapped install | docs/self-hosting.md | M | no |
| HOST-30 | `process` mode with workers of their own user throws at shutdown | worker supervisor | S | no |

## Lane t4-gov-docs (governance leftovers, docs rough) 12

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| GOV-31 | Two ways to say one thing about a paused provider | kernel/sso/providers.ts:577 | S | yes |
| GOV-32 | Audit search does not find a name, email or hostname | routes/identity.ts:239 | S | yes |
| GOV-33 | SSO settings, mappings and provisioning lost without a word when left unsaved | SingleSignOn.tsx | M | yes |
| GOV-34 | Lists stop at a limit without saying (group picker 200 and others) | SingleSignOn.tsx:540 and siblings | S | yes |
| GOV-35 | Turning off a hostname or the instance's workers asks nothing | Domains.tsx:283, Execution.tsx:1155 | S | yes |
| GOV-36 | The worker command shown puts the credential in the process list (HOST-27 did the compose file) | Execution.tsx worker credential sheet | S | yes |
| GOV-37 | Controls show to people who may not use them (every screen of the slice; needs the shared pattern) | shared can-gate piece | M | yes |
| GOV-38 | A pool can be called "default" and the queue then shows two alike | routes/pools.ts:10, Execution.tsx:986 | S | yes |
| DOC-05 | Insert menu lacks `glossary` | kit/markdown/insert.ts:23 | S | yes |
| DOC-07 | Doc-writer wording "a table of any other kind" | packages/docs/content/build/documentation.md:46 | S | no |
| DOC-12 | `docs:check` staleness is vacuous | docs check script | S | no |
| DOC-13 | The panel's "More about" link on a term points at the page you are on | HelpPanel.tsx:233 | S | yes |

---

# TIER 4: VOCABULARY (findings/vocabulary.md, D54 and D55). Text only; code names, stored values, route paths and CLI names stay. Rows left "keep" or "no change" (VOC-19, 36, 38, 39, 44, 48, 54, 58) are not listed. Add the lint named at the end of the file (workflow, colour, cancelled, grey in visible strings) first, so it fails before the lanes start.

## Lane voc-flow (workflow becomes flow) 19

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| VOC-01..05 | "Run a workflow", label "Workflow", "Choose a workflow" | kit/inspector/actionModel.ts:73, timelineModel.ts:39, actionControls.tsx:703-717 | S | yes |
| VOC-06..10 | Builder selector and publish check texts, search word keeps `workflow` as alias | screens/builder/selectorData.ts, publishCheck.ts:319 | S | yes |
| VOC-11..15 | Approvals drawer texts (flows, flow's step) | kit/inspector/widgets/approvalsDrawer.tsx | S | yes |
| VOC-16 | "scripts and workflows it started" in the API description | packages/screens/src/types.ts:67, routes/page-actions.ts:69 | S | no |
| VOC-17, 18 | Docs pages: index.md, app-builder.md, app-builder-editor.md; first use links to Flows | packages/docs/content | S | no |
| Lint | A test that fails on workflow/colour/cancelled/grey in visible string literals | new test over .tsx | S | no |
(VOC-01..18 is 18 rows; 19 counting the lint. bldwid may be editing the builder and approvals drawer files: take these after it merges.)

## Lane voc-spell (American spelling) 14

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| VOC-20, 21 | "cancelled" becomes "canceled" in Runs | Runs.tsx:291, 308 | S | yes |
| VOC-22 | Environments text | Environments.tsx:1098 | S | yes |
| VOC-23 | "Resize cancelled" and "Move canceled" | packages/screens/src/placement.ts:523 | S | yes |
| VOC-24 | CLI "Cancelled N run(s)" | packages/cli/src/cli.ts:627, 639 | S | no |
| VOC-25 | "its run was cancelled" shown to the decider | kernel/pages/approvals.ts:649 | S | yes |
| VOC-26 | Worker route description prose (field stays) | routes/worker.ts:471 | S | no |
| VOC-27 | Audit humanizer maps `cancelled` to "canceled" when it words the row | Audit.tsx:81, 88 | S | yes |
| VOC-28..30 | Grey becomes Gray, Greys, Greyed | columnModel.ts:17, chartDrawer.tsx:426, 471, KitDrawer.tsx:214, RulesTab.tsx:198 | S | yes |
| VOC-31, 32 | "colours" becomes "colors" in docs and sdk-guide | packages/docs/content, docs/sdk-guide.md:171, 344 | S | no |
| VOC-33 | self-hosting.md "cancelled": say "canceled (the label reads cancelled)" or rename with D55 | docs/self-hosting.md:551 | S | no |

## Lane voc-state (one state, one name; deploy words in the console) 10

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| VOC-34, 35 | Connection or source check: one `HealthMark`, "Reached"/"Failed"; drop the Answered/Reachable pills | ObjectPages.tsx:91, kit/status.tsx:105, kit/health.tsx | M | yes |
| VOC-37 | Connection wizard failure sentence opens with "Failed" | ConnectionWizard.tsx:145 | S | yes |
| VOC-40 | "Not checked" becomes "Not tested"; "Set up here" everywhere for Bound | status.tsx, ObjectPages.tsx:87 | S | yes |
| VOC-41, 42, 43, 53 | Nav "Releases" becomes "Deploy" in dev and "Versions" in production; Release.tsx title; Shell "Release path" becomes "Deploy path" | nav.ts:125, Release.tsx:163, Shell.tsx:427 | S | yes |
| VOC-45, 46 | "Activate" becomes "Deploy" or "Roll back" (one function decides from the numbers); "Versions and roll back" | Execution.tsx:590-605, Release.tsx:146, 166 | M | yes |
| VOC-47 | CLI help: "upload and deploy"; "promote this workspace's bundle" | packages/cli/src/commands.ts:82, 88 | S | no |

## Lane voc-access (access releases become access changes; publish words) 9

| Id | What | Where | Size | Sees |
|---|---|---|---|---|
| VOC-52 | Access releases become "access changes": tab, buttons, Members.tsx:23, CLI text, error texts (command names and API paths stay) | AccessReleases.tsx, Members.tsx, packages/cli/access.ts, manifest errors.ts:189-222 | M | yes |
| VOC-57 | Manifest error family: release only for access, deploy and promote for the rest | packages/manifest/src/errors.ts:118-190 | S | no |
| VOC-49 | App Builder commit message "Deploy ${title}" | screens/builder/AppBuilder.tsx:299 | S | yes |
| VOC-50 | Tooltip "Published means deployed here" | Interfaces.tsx:100 | S | yes |
| VOC-51 | Docs toast "will be a site once deployed" | screens/docs/Docs.tsx | S | yes |
| VOC-55 | "Deploys to W. The live app keeps working until then." | builder/PublishCheck.tsx:165 | S | yes |
| VOC-56 | Nav and title "Published apps" becomes "Apps" | nav.ts:115, Apps.tsx:422 | S | yes |
| D55 follow-up | Docs and dashboards that still name `platform_` metrics (host2 renamed the metrics) | docs/self-hosting.md, packages/docs/content | S | no |
| (note) | AccessReleases.tsx is acc2's file; VOC-52 waits for acc2 | | | |

---

## Owner-only questions found

1. WLK-10 left: add `danger` to an action's `confirm` in the manifest so a confirmation can start on Cancel. Contract change, asked of the owner (app.md says the integrator).
2. app.md: spaces and non-ASCII characters in app names are still refused; serving them needs an encoding decision.
3. CLI-MP7: `volvel dev` for file apps, interfaces and docs (L); the finding says it may be a decision.
4. D62: the first publish date is unset, and D58 (docs-only TypeScript 6) waits on version and license confirmation: both are owner or legal, not code.
5. FLW-36 (owner decides row): is "testing one flow while another draft is broken" still wanted refused after D32? Probably settled by D32; confirm.
6. ACC-MP18 and ACC-MP20 are not built because D7 and D53 say no. Tell the owner the findings' missing parts were overruled.
7. DOC-09: a tenant term that clashes with a later product id is dropped silently; policy (warn, rename, or refuse the upgrade) was never asked.
8. cfg lane: git `GET .../git/operations` returns 50 newest unfiltered rows; fine now, not a question unless dev-style pushes land on production.
