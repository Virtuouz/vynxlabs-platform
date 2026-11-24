# Findings: extensions and kit

Slice: extensions, custom connectors, trigger sources, flow nodes, the widget SDK, the component kit. Inventory: [extensions-and-kit.md](../inventory/extensions-and-kit.md). Prefix EXT. Paths are in the tree pinned at `270e509`. Nothing was run: every item below is settled from the code, because each path is certain and running it would show nothing more. No security item was found. Loading widgets written by tenants is out of scope (decision 0005 lists it as not built), so the items that only matter for that are marked.

### EXT-01 A trigger source that names a secret, connection or variable that is not bound deploys, then fails on every request or tick
- **Outcome:** confirmed by code (inventory E1)
- **Severity:** broken
- **Where:** `packages/manifest/src/bundle-check.ts:189-202` (`uses` is checked for `script` only); `apps/control-plane/src/kernel/execution/deploy.ts:30-50` (`missingBindings` reads `script` manifests and trigger `verify` only). The kind has `uses` at `packages/manifest/src/kinds.ts:841`; `kernel/references.ts:88` and `runs.ts:52` already treat it as a script's.
- **Evidence:** read both loops: the `trigger_source` kind never enters them. A webhook is answered 202 whatever happens, so the sender sees nothing wrong.
- **Fix:** run the script `uses` checks and `missingBindings` over `trigger_source` too (secrets, connections, variables; not tables). Siblings: connector has no `uses`. Test first: deploy a source naming an unbound secret and expect 409 `bindings_missing`.
- **Size:** S. **Milestone:** M4

### EXT-02 A poll that returns more than 100 items loses the rest for good
- **Outcome:** confirmed by code (inventory C)
- **Severity:** data
- **Where:** `apps/control-plane/src/kernel/execution/triggers.ts:610-616` (slice), `:619-624` (cursor written from the answer in the same transaction).
- **Evidence:** the answer is cut to `MAX_RELAYED` (100) with a server-log warning, then the cursor the source gave is saved, so the next tick starts after the dropped items.
- **Fix:** when items are cut, do not take the source's cursor: keep the old one and say so on the source run, or reject the answer as failed. Also write the limit in the SDK `PollResult` doc comment. Test first: a source answering 150 items starts 100, and the next tick is handed the old cursor.
- **Size:** S. **Milestone:** M2

### EXT-03 A poll item that cannot start is logged and lost, and the cursor still moves past it
- **Outcome:** confirmed by code
- **Severity:** data
- **Where:** `triggers.ts:626-651` (the `HttpError` catch inside the transaction that already moved the cursor). The same applies when `items` is not an array: `:608` treats it as empty and the cursor is still saved.
- **Evidence:** read: catch logs `could not start a run`; nothing is recorded on the source run or shown to a person.
- **Fix:** record each refused item and the reason on the source run's output (visible in Runs), and treat a non-array `items` as a failed source run that keeps the cursor. Test first: one bad item among three leaves two runs and a visible refusal.
- **Size:** M. **Milestone:** M2

### EXT-04 A webhook request already answered 202 is dropped without a trace when its trigger is paused while the source runs
- **Outcome:** confirmed by code (inventory C)
- **Severity:** data
- **Where:** `triggers.ts:594-597` (returns silently); intake at `:956-967` does record a refusal when paused (`recordRefusal(..., "paused")`).
- **Evidence:** the two checks are the same, but only intake leaves a refusal record.
- **Fix:** call `recordRefusal` in `relaySource` when it returns for pause or removal, so the loss is shown where refusals are shown. Test first: pause during the source run, expect a refusal row.
- **Size:** S. **Milestone:** M2

### EXT-05 A rejected signature still creates a source run and answers 202
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** inventory C; phase 7 line 387 (the source "says whether anything starts"); `FlowSteps.tsx:277` says it excludes "answered by the flow".
- **Evidence:** by the design in phase 7: the sender cannot learn what the source decided, which is also the safe answer. Only the documentation must say so.
- **Fix:** none in code. Say it in writing-a-trigger-source.
- **Size:** S. **Milestone:** M4

### EXT-06 The credential never appears in run input, output or audit
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** `apps/control-plane/src/extensions.test.ts:295` asserts audit holds where a binding points and never its credential.
- **Evidence:** the test exists and is the claim. The connector's own code can still print what it is given; that is tenant code on a worker, by design (decision 0001).
- **Fix:** none. Documentation can state both halves.
- **Size:** S. **Milestone:** M1

### EXT-07 A connector written in the console cannot have a `test`
- **Outcome:** missing part
- **Severity:** broken
- **Where:** `packages/compose/src/index.ts:41` (`EXPORT_SHAPE` maps the connector to `create` only). The worker already runs `test` from a bundle (`packages/worker/src/runner.ts:146`).
- **Evidence:** read; a repository connector goes through the build and can export `test`, a console one cannot, so Test on its connections says only "Its client was made."
- **Fix:** see Missing parts.
- **Size:** M. **Milestone:** M4

### EXT-08 The script editor has no way to set `node`, yet its notice says "give it a label"
- **Outcome:** missing part
- **Severity:** broken
- **Where:** notice at `apps/console/src/screens/Authoring.tsx:885-888`; the body takes `node` (`packages/manifest/src/kinds.ts:255`). A script written in the console cannot join the flow palette with a label, category or `takes`.
- **Evidence:** `Authoring.tsx` has no `node` field (grep). See Missing parts.
- **Fix:** see Missing parts. Sibling: flow editor palette (`FlowEditor.tsx:633`).
- **Size:** M. **Milestone:** M4

### EXT-09 `node.icon` is accepted and never drawn
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `FlowEditor.tsx:630-642` builds each palette entry with no icon; core nodes' icon is passed by `packages/nodes/src/index.ts:356` and also not drawn here.
- **Evidence:** read: `PickableNode` is built from `label`, `category`, `description`, `takes`, `input` only.
- **Fix:** carry `icon` into `PickableNode` and draw it through the shared icon resolver (EXT-17). Or drop `icon` from the SDK type. Test first: a labelled script with an icon shows it in the palette.
- **Size:** S. **Milestone:** M4

### EXT-10 `tenant.console_code` can be turned off or on only in the database
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** `packages/db/src/schema.ts:35`; read in `routes/authoring.ts:209`; written only in `authoring.test.ts:251`. Phase 7 line 231 and 459 describe it as a switch, with no setter named.
- **Evidence:** grep over apps and packages finds no other writer. See Owner decides.
- **Size:** S. **Milestone:** M1

### EXT-11 The code editor's types do not include `@volvel/widgets`
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `apps/console/src/editor/monaco.ts:10-16` loads six SDK files; `packages/sdk/dist/index.d.ts:5-7` re-exports `@volvel/widgets` and `/page`.
- **Evidence:** those re-exports resolve to nothing in the editor, so they type as `any`. Console code can only be a script, connector or trigger source, none of which defines a widget or a page, so no author sees this.
- **Fix:** none now. Load the widget types if code in the console ever defines pages. Do not document as a fault.
- **Size:** S. **Milestone:** M4

### EXT-12 A read-only repository extension says "Code", and a build error on deploy has no line jump
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `Authoring.tsx:890-894` (`noun="Code"` where the rest of the file says `about.noun`); `:1006` Problems list is drawn for scripts, build issues for extensions come back as one message (`:523`).
- **Evidence:** read.
- **Fix:** pass `about.noun` to `ProductionNotice`; draw `ProblemList` for every kind that has source (`buildIssuesOf` already parses file and line). Test first: a build failure in a connector lists its line.
- **Size:** S. **Milestone:** M4

### EXT-13 Extensions list shows a draft trigger source without its mode, and an edited draft with the old description
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `Authoring.tsx:1182-1196` (a draft row takes `description` and `detail` from the deployed row only, and falls back to "Trigger source").
- **Evidence:** the draft's own body is never read here.
- **Fix:** read the draft's body in the draft loop (`mode`, `description`). Siblings: other lists that merge drafts with resources (flows, queries). Test first: a new poll draft lists as "Trigger source for a schedule".
- **Size:** S. **Milestone:** M4

### EXT-14 `/instance/kit` has no operator check in the router
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** `apps/console/src/App.tsx:143`.
- **Evidence:** `KitSheet.tsx` makes no request and shows static samples; the nav hides it. Nothing is exposed.
- **Fix:** none.
- **Size:** S. **Milestone:** M1

### EXT-15 `ThemeToken` in the SDK lists 19 names; the manifest accepts 27
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `packages/sdk/src/index.ts:1037-1056`; `packages/manifest/src/kinds.ts` `THEME_TOKENS` (27, including structure, raised, selected, line-strong, line-control, ink-subtle, code-bg, focus).
- **Evidence:** `tokens?: Partial<Record<ThemeToken, string>>` is an excess-property error for the eight others, though the deploy would take them.
- **Fix:** derive `ThemeToken` from `THEME_TOKENS`. Test first: a type test that `defineTheme({ tokens: { focus: "#000" } })` compiles.
- **Size:** S. **Milestone:** M4

### EXT-16 The connection wizard refuses `_` in a new path; the editor and manifest allow it
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `ConnectionWizard.tsx:104,257` (`[a-z0-9-]`); `Authoring.tsx:229,277` and `PATH_PATTERN` (`envelope.ts:4`) allow `_`.
- **Evidence:** read. Only a new path is checked, so a repository connection with `_` is still choosable.
- **Fix:** use the manifest's `PATH_PATTERN` in the wizard. Siblings: any other copy of the pattern (grep `a-z0-9-]*`). Test first: a path with `_` is accepted.
- **Size:** S. **Milestone:** M4

### EXT-17 Only 15 icon names draw in the builder; others show a puzzle piece
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `apps/console/src/screens/builder/widgetIcons.ts:22-41`; the definition says "an icon from the kit's set" (`packages/widget-sdk/src/index.ts:226`).
- **Evidence:** read. Platform widgets use the 15; matters to a pack author only (out of scope).
- **Fix:** resolve against the kit's icon set, or narrow the type to the 15 names. Shared with EXT-09.
- **Size:** S. **Milestone:** M4

### EXT-18 `formatValue` is always en-US; `parseMoney` uses the person's locale
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `packages/widget-sdk/src/index.ts:683,688`; `money.ts:37`.
- **Evidence:** read. A person in a locale with a comma decimal types "1.234,50", reads back "1,234.50".
- **Fix:** see Owner decides (a). Test first: format then parse is the identity in de-DE.
- **Size:** M. **Milestone:** M4

### EXT-19 `slots` control draws only "its places are drawn by the widget" unless registered; `registerWidgets` has no caller
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** `controls.tsx:466`; `packages/manifest/src/page.ts:611`.
- **Evidence:** both are the seams for a pack the platform does not yet load (decision 0005 "Packaging", not built). The List registers its own control (`registerTables.tsx:192`).
- **Fix:** none. Do not document either; they belong with tenant widgets.
- **Size:** S. **Milestone:** M4

### EXT-20 "A deploy pins widget versions" is false today
- **Outcome:** not a bug
- **Severity:** wrong
- **Where:** `packages/widget-sdk/src/index.ts:223` (comment); decision 0005 line 36 describes it for tenant packs.
- **Evidence:** no code pins a widget version; pages name a type. It is part of the unbuilt packaging.
- **Fix:** reword the comment to say it is planned. Do not document pinning.
- **Size:** S. **Milestone:** M4

### EXT-21 Documentation says untrue or stale things
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `packages/docs/content/build/scripts.md:11` ("the same is true of ... extensions": the list has no inspector; Remove is in the editor only, `Authoring.tsx:1152-1260`). `packages/docs/content/build/writing-a-widget.md`: Goal values `{1,1}` is `{1,2}` (`widgets-labs/src/index.ts:23`); "Nothing else was written" (line 148) is false (`goalDrawer.tsx`, `registerCharts.ts:16`). `docs/sdk-guide.md`: zero mentions of `defineConnector` or `defineTriggerSource`. Other claims in inventory D (three shapes, 15 controls, five view props) are as listed there; I checked the first two.
- **Evidence:** greps as named.
- **Fix:** the writers act on inventory D with these confirmed. Also add one example repo using `defineConnector` and `defineTriggerSource`: none of `examples/` does.
- **Size:** M. **Milestone:** M4

## Missing parts

Each is something the manifest or runtime already takes.

1. **Connector `test` from the console** (EXT-07). Takes: worker runs `test` from the bundle (`runner.ts:146`). Control: let the console connector export shape carry `test` (`compose/index.ts:41`), with the starter showing it. Siblings: none. Permission `code:write`. M.
2. **`node` for a script** (EXT-08). Takes: `node { label ≤60, icon?, category ≤40, takes[] }` (`kinds.ts:255`). Control: a "Use as a flow step" section in the script editor's settings: label, category, the three `takes`. Siblings: palette in `FlowEditor.tsx`, EXT-09. Permission `code:write`. M.
3. **Worker pool for a trigger source** (`worker`, `kinds.ts:~813`, a pattern, max 40). No field in the extension editor's settings; scripts have none either (same fix, shared settings panel). Permission `code:write`. S.
4. **Problems tab for extensions** (EXT-12). `buildIssuesOf` already parses file and line. S.

## Owner decides

- **(a) Number format.** Should `formatValue` follow the viewer's locale as `parseMoney` does, or should both be en-US? Options: both follow the locale; both stay en-US; per-workspace setting. Recommendation: both follow the viewer's locale, with one shared helper.
- **(b) `tenant.console_code`.** Should an operator be able to switch it from the console or API, or stay a database setting? Options: operator switch on the tenant screen; leave it and document as database only. Recommendation: operator switch, since a tenant cannot be told how to turn it off.
- **(c) widget-contract page.** Publish now flagged "for platform contributors", or hide until tenant widgets load? Recommendation: publish for contributors, and leave out pinning, `registerWidgets` and `slots`.
- **(d) Poll over 100 items.** Fail the tick, or take 100 and re-offer the rest? Recommendation: keep the old cursor and take 100, so nothing is lost (EXT-02).
