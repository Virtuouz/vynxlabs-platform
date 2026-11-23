# Fixed: lane voc-flow (workflow becomes flow)

Commit: see `git log` on p29-voc-flow ("Phase 29: a person sees flow, never workflow (VOC-01..16)").

## VOC-01..16 and the lint

Changed (text, hints, labels, comments): kit/inspector/actionModel.ts:75, timelineModel.ts:39, actionControls.tsx:722-736 (and header comments), widgets/approvalsDrawer.tsx (130, 136, 143, 145, 168-175, 252, 258, 283, 358), widgets/approvalFlows.tsx, model.ts, catalog.ts, Inspector.tsx, tabProblems.ts, screens/builder/selectorData.ts (158, 174, 243), publishCheck.ts:342, packages/screens/src/types.ts:67, actions.tsx comment. Tests that assert the words: actions-rules.test.tsx, widgets/approvals.test.tsx. README.md line 3.
Search words in selectorData.ts:159, 176, 266 gain `flow` and keep `workflow`, marked `search-alias:`.
Test: `no string of the console, screens, widgets or ui says workflow` in apps/console/src/enforce.test.ts (seen failing with 70 hits before the fix). It scans console src, packages/screens, widgets-core and ui `src`, tests included; the lucide `Workflow` icon is not flagged; a line marked `search-alias:` is allowed.
Siblings looked at: control-plane page-actions.ts:83 already says flows (VOC-16 second half done before); manifest, cli, worker have no "workflow" text; docs-icons.ts `workflow` icon key stays (code).
Seen differently: the Run a flow action step, the Approvals drawer, builder cards and publish check say flow.
Screens to walk: App Builder inspector Actions tab (Run a flow chip), Approvals widget drawer, publish check with an approval widget and no approval step, the widget picker search "workflow" and "flow". Walk not run by this lane.

## Left for phase 31 (packages/docs/content), not edited
- index.md:15 "internal apps, workflows and integrations" (VOC-17)
- build/app-builder.md (5 places) and build/app-builder-editor.md (2 places) (VOC-18); the first use should link to Flows.
