# Findings: vocabulary (for M13)

Prefix VOC. Swept at `270e509` through the strings a person sees in apps/console/src, packages/screens, packages/widgets-core, packages/ui, packages/cli, packages/manifest (descriptions and error texts), the control-plane's descriptions and notices, and the written docs in packages/docs/content. **Text only.** Code names, stored values (`"cancelled"` in the database, `workflow` as an icon, a CSS color token, route paths, CLI command names, the `release` and `rollback` API paths) stay. The console already maps a stored `cancelled` to the state `canceled` (execution/state.ts:41), so it shows "Canceled" correctly; the stragglers are below.

Method: grep for each family over `.ts`, `.tsx`, `.md`, then kept only strings a reader sees, not comments or identifiers. Each row is `confirmed by code`. No browser was needed.

## 1. "workflow" becomes "flow" (the owner decided)

The nav, the Flows screen and the SDK already say flow. App Builder, the inspector and the Approvals widget still say workflow. Where a sentence says "Run a flow", the Flows screen is the place to name it first; the docs add the one-sentence note the style inventory asks for.

| ID | file:line | Text now | Text proposed |
|---|---|---|---|
| VOC-01 | apps/console/src/kit/inspector/actionModel.ts:73 | `Run a workflow` | `Run a flow` |
| VOC-02 | apps/console/src/kit/inspector/timelineModel.ts:39 | `Run the workflow ${path}` / `Run a workflow` | `Run the flow ${path}` / `Run a flow` |
| VOC-03 | apps/console/src/kit/inspector/actionControls.tsx:703 | `Run a workflow` | `Run a flow` |
| VOC-04 | apps/console/src/kit/inspector/actionControls.tsx:707 | label `Workflow` | `Flow` |
| VOC-05 | apps/console/src/kit/inspector/actionControls.tsx:717 | `Choose a workflow` | `Choose a flow` |
| VOC-06 | apps/console/src/screens/builder/selectorData.ts:158 | `...send a message, run a workflow.` | `...run a flow.` |
| VOC-07 | apps/console/src/screens/builder/selectorData.ts:159, 176, 266 | search words `workflow` | add `flow`, keep `workflow` as a search word only so old habits still find it |
| VOC-08 | apps/console/src/screens/builder/selectorData.ts:174 | `Who may decide is set on the workflow's step.` | `...on the flow's step.` |
| VOC-09 | apps/console/src/screens/builder/selectorData.ts:243 | `${n} workflows ask for a decision` | `${n} flows ask for a decision` |
| VOC-10 | apps/console/src/screens/builder/publishCheck.ts:319 | `...until the workflow has an approval step.` | `...until the flow has an approval step.` |
| VOC-11 | apps/console/src/kit/inspector/widgets/approvalsDrawer.tsx:130, 358 | `Who may decide is set on the workflow's step.` | `...the flow's step.` |
| VOC-12 | .../approvalsDrawer.tsx:136 | `Open the workflow` / `Open the workflows` | `Open the flow` / `Open the flows` |
| VOC-13 | .../approvalsDrawer.tsx:143, 145 | label `Workflows` (two) | `Flows` |
| VOC-14 | .../approvalsDrawer.tsx:168, 169, 174, 175 | `Every workflow with an approval step.` / `No workflow of this workspace...` / `...A workflow with no approval step has nothing to show.` | the same with `flow` |
| VOC-15 | .../approvalsDrawer.tsx:252, 258, 283 | `...once a workflow with an approval step is chosen`, `More details these workflows give`, `As the workflow's step names it` | `flow`, `flows`, `flow's` |
| VOC-16 | packages/screens/src/types.ts:67 and apps/control-plane/src/routes/page-actions.ts:69 | `How many scripts and workflows it started` (API description, shown in the reference) | `scripts and flows` |
| VOC-17 | packages/docs/content/index.md:15 | `internal apps, workflows and integrations` | `internal apps, flows and integrations` |
| VOC-18 | packages/docs/content/build/app-builder.md:46-67; app-builder-editor.md:14, 91 | `workflow` (7 places: `Run a workflow`, `the workflow's approval step`, `the workflows to ask of`) | `flow`; the page that first meets the word links to Flows |
| VOC-19 | apps/control-plane/src/kernel/apps/docs-icons.ts:74 | icon key `workflow` | no change: a name an author writes (code). Add `flow` as an alias if the owner wants authors to write it |

Not text and left alone: the `Workflow` lucide icon imported in nav.ts:44, Runs.tsx, RunPage.tsx, Flows.tsx, CommandPalette.tsx, actionControls.tsx, and comments in approvalFlows.tsx and Inspector.tsx. No manifest schema description or error text says workflow.

## 2. Spelling: American

| ID | file:line | Text now | Text proposed |
|---|---|---|---|
| VOC-20 | apps/console/src/screens/Runs.tsx:291 | `...is cancelled. Runs already going carry on...` | `...is canceled.` |
| VOC-21 | apps/console/src/screens/Runs.tsx:308 | `${n} queued run(s) cancelled` | `canceled` |
| VOC-22 | apps/console/src/screens/Environments.tsx:1098 | `...are recorded as cancelled.` | `canceled` |
| VOC-23 | packages/screens/src/placement.ts:523 | `Resize cancelled. ${name} is back where it was.` | `Resize canceled.` (and `Move canceled.`) |
| VOC-24 | packages/cli/src/cli.ts:627, 639 | `Cancelled ${n} run(s).` / `Cancelled ${n} flow run(s).` (the line at 580 already says `canceled`) | `Canceled` |
| VOC-25 | apps/control-plane/src/kernel/pages/approvals.ts:649 | `its run was cancelled` (shown to the person deciding) | `was canceled` |
| VOC-26 | apps/control-plane/src/routes/worker.ts:471 | description prose around the field `cancelled` | the field stays (stored/protocol value); prose says "the run was canceled" |
| VOC-27 | apps/console/src/screens/Audit.tsx:81 and render at :88 | the audit list shows an action `run.cancelled` / `flow_run.cancelled` as the stored word, humanized | the stored action stays; the humanizing function maps `cancelled` to `canceled` when it words the row |
| VOC-28 | apps/console/src/kit/inspector/widgets/columnModel.ts:17 | color name `Grey` | `Gray` (the manifest and sdk-guide already say `gray`) |
| VOC-29 | apps/console/src/kit/inspector/widgets/chartDrawer.tsx:471 | `Greys` | `Grays` |
| VOC-30 | chartDrawer.tsx:426; KitDrawer.tsx:214; inspector/RulesTab.tsx:198 | `Greyed types...` / `greyed out` | `Grayed` / `grayed out` |
| VOC-31 | packages/docs/content/tenant/branding.md:4, 7; tenant/index.md:33; instance/branding.md:4, 7; instance/index.md:28 | `colours` | `colors` |
| VOC-32 | packages/docs/content/build/writing-a-widget.md:142; docs/sdk-guide.md:171, 344 | `theme colours`, `A colour is`, `site's own colours` | `colors` |
| VOC-33 | docs/self-hosting.md:551 | `succeeded, failed, cancelled` | the metric label is stored (`cancelled`); say `canceled (the label reads cancelled)` or rename the label with the metric (API-17) |

Left alone (identifiers): `isColour`, `colours` in Branding.tsx:62 and chartDrawer.tsx:417; `cancelled` in type unions, the database, `step_run.status`, the `/runs/cancel` route body field `cancelled`, `packages/app` and `widget-sdk` result fields (`{ ok: false; cancelled: true }`), and `aria-labelledby` (a correct spelling). Stored `cancelled` must be read by the one mapper in state.ts, so no row here changes it. packages/cli follow.ts accepts both spellings as input: keep.

No other British forms (`-ise`, `behaviour`, `centre`, `licence`, `catalogue`, `organis-`) were found in visible text.

## 3. One state, two names

The same connection or data source check is worded two ways in two screens, and a third in a toast.

| ID | file:line | Text now | Text proposed |
|---|---|---|---|
| VOC-34 | apps/console/src/screens/ObjectPages.tsx:91 | pill `Answered` / `Did not answer` | `Reached` / `Failed`, by passing the same `health` through the shared `HealthMark` (kit/health.tsx:20-45) and dropping the `reachable`/`unreachable` pills |
| VOC-35 | apps/console/src/kit/status.tsx:105-106 | pills `Reachable` / `Not reachable` | remove with VOC-34 if nothing else uses them (check first); else reword `Reached` / `Failed` |
| VOC-36 | apps/console/src/kit/health.tsx:29, 33 | `Reached` / `Failed` | keep: this is the proposed single pair. The unreached text `It was not reached.` at :37 stays: it matches `Reached` |
| VOC-37 | apps/console/src/screens/ConnectionWizard.tsx:140 | `Reached (200) in 40 ms.` | keep; failure sentence at :145 should open with `Failed`, not a bare HTTP code, so it reads as the same pair |
| VOC-38 | apps/console/src/screens/Data.tsx:2484 | `${path}: not reached` | no change: `not reached` is the negative of `Reached`; it needs only VOC-34 to land first |
| VOC-39 | apps/console/src/screens/FlowSteps.tsx:489 | label `Answered with` | no change: this is a step's answer, not a health state |

Other state pairs seen in the sweep, listed because they invite the same drift: `Bound`/`Not bound` (status.tsx:106) against `Set up here`/`Not set up here` (ObjectPages.tsx:87-88), and `Not checked`, `Not tested`, `Not connected` for an untested connection (health.tsx, configure.md:40). Proposed: `Set up here` everywhere a person sees it, `Not tested` everywhere for no test yet (VOC-40: status.tsx `unchecked: "Not checked"` becomes `Not tested`). `OK` (status.tsx:104) is a third word for the health pass: use `Reached` for a connection and keep `OK` for general state.

## 4. Deploy, publish, release, activate, promote, roll back

One lifecycle has five words. Proposed one meaning each, with the screen label that follows from it:

- **Deploy**: turn drafts into what runs in a dev workspace (CLI `volvel deploy`, API `deployments`).
- **Promote**: send a version from the dev workspace to production.
- **Make the running version**: moving a workspace to an earlier or later bundle: today's `Activate`, `Rolling back`. Proposed label **Roll back to v3** when it is earlier, **Deploy v5** when it is later (the same API call).
- **Publish**: App Builder and docs only, as a name for deploy of the chosen drafts and nothing else; the screens say `Publish` in the button and the confirmation says `This deploys 1 draft`.
- **Release**: reserve it for nothing in the console (or for access changes only, see VOC-52). It is both the nav name for the deploy screen and the access-change record.
- **Version**: the number shown on screen.

| ID | file:line | Text now | Text proposed |
|---|---|---|---|
| VOC-41 | apps/console/src/nav.ts:125 | nav `Releases` (the deploy screen) | `Deploy` in a dev workspace and `Versions` in production, as the screen's own title already says (Release.tsx:163); or `Versions` in both |
| VOC-42 | apps/console/src/screens/Release.tsx:163 | title `Release` / `Versions` | `Deploy` / `Versions` |
| VOC-43 | apps/console/src/Shell.tsx:427 | `Release path` | `Deploy path` |
| VOC-44 | apps/console/src/screens/Release.tsx:153 | `Deploy to dev` | keep; but `Review and deploy` links (Dashboards.tsx:371, Queries.tsx:143, Interfaces.tsx:344, ResourceIdentity.tsx:239) and `Promote to ${target}` stay: consistent |
| VOC-45 | apps/console/src/screens/Execution.tsx:590, 592, 605 | `Activate version N in W?`, `Activate in production`, `Activate`, `Activate this version` | `Make version N the running version of W?`, `Deploy in production`, ... or `Roll back` when N is lower (one function decides from the numbers) |
| VOC-46 | apps/console/src/screens/Release.tsx:146, 166 | `Versions and rollback`, `Rolling back activates an earlier version` | `Versions and roll back`, `Rolling back deploys an earlier version` |
| VOC-47 | packages/cli/src/commands.ts:82, 88 | `Build, upload and activate the bundle.` / `Activate this workspace's bundle in the workspace it is linked to.` | `Build, upload and deploy the bundle.` / `Promote this workspace's bundle to the workspace it is linked to.` |
| VOC-48 | apps/console/src/screens/Environments.tsx:584, kit/DeployMenu.tsx:79 | `Promotion`, `Promote to X` | keep (the standard word) |
| VOC-49 | apps/console/src/screens/builder/AppBuilder.tsx:299 | commit message `Publish ${title}` | `Deploy ${title}` in the change message, since it posts to `changes/deploy` and the History screen shows it next to the other deploys |
| VOC-50 | apps/console/src/screens/Interfaces.tsx:100-107 | `Published v3`, `Not published`, `Edits not published` | keep; add `deployed` to the tooltip: "Published means deployed here" |
| VOC-51 | apps/console/src/screens/docs/Docs.tsx:181, 330-344, 473-516 | `Deploy N changes to the documentation?`, `Publish X again?`, `Stop publishing X?` ... `will be served again when you deploy` | these are two different acts, and the page says it. Keep `Publish as a site` for making the folder a site, but the toast `will be published as a site when you deploy` reads as two steps: write `will be a site once deployed` |
| VOC-52 | apps/console/src/screens/AccessReleases.tsx:113, 175, 213, 264, 346-347; Members.tsx:23; cli/access.ts:139, 165, 221, 275; control-plane errors.ts:189-222 (`release_stale`, `own_release`) | `Decline release 4`, `Go back to release 4`, tab `Releases`, `A release is recorded when...` | `access change`: `Decline access change 4`, tab `Access changes`. CLI command names and API paths stay |
| VOC-53 | apps/console/src/screens/Release.tsx:163 vs Members.tsx:23 | two screens both titled `Releases` | follows VOC-41 and 52 |
| VOC-54 | apps/console/src/screens/Overview.tsx:211-212, 384 | `A first deploy`, `Deploying makes what you wrote what runs here`, `N drafts not deployed` | keep |
| VOC-55 | apps/console/src/screens/builder/PublishCheck.tsx:165 | `Publishes to W. The live app keeps working until then.` | `Deploys to W...`; the button stays `Publish` |
| VOC-56 | apps/console/src/nav.ts:115; apps/console/src/screens/Apps.tsx:422 | nav and title `Published apps` | `Apps`; the App Builder item is `App Builder` already, and "published" is a state, not a name |
| VOC-57 | packages/manifest/src/errors.ts:118-140, 150, 165, 180, 189-190 | `deploy`, `promote`, `release again` mixed in one family | access releases say `release` (VOC-52); the others stay `deploy` and `promote` |
| VOC-58 | packages/cli/src/cli.ts:289, 404 | `deploy to ${workspace}`, `promote ${workspace}` | keep |

## 5. Outcome

Counts: 58 rows. Workflow 19, spelling 14, state names 7, deploy family 18. Every row is `confirmed by code`. Severity `wrong` for VOC-34 (one state two names) and VOC-41/42/52/53 (two screens, one name); `rough` for the rest.

Shared pieces to change once, not at each site (POLISH-013): one `HealthMark` for connection and data source state (VOC-34); the audit action humanizer (VOC-27); the function that words activate/roll back (VOC-45); the `RUN` state mapper (state.ts) is already the single place for `canceled`. Add a lint that fails on `workflow`, `colour`, `cancelled` and `grey` in visible strings (a test over `.tsx` string literals, with `cancelled` allowed as an identifier), which is the test that should fail first.

Owner decides: (a) Do access "releases" become "access changes" (VOC-52)? Recommend yes: two things called Release is the cause of the nav confusion. (b) Nav label for the deploy screen (VOC-41): Recommend `Deploy` in dev and `Versions` in production. (c) Should `Activate` become `Deploy`/`Roll back` (VOC-45)? Recommend yes.

Size: S each, M overall; milestone M13.
