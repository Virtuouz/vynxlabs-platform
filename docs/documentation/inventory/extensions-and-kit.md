# Inventory: extensions and kit

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

Paths below are relative to ``, with these prefixes: **Au** = `apps/console/src/screens/Authoring.tsx`, **SDK** = `packages/sdk/src/index.ts`, **W** = `packages/widget-sdk/src/index.ts`, **T** = `apps/control-plane/src/extensions.test.ts`, **CT** = `apps/control-plane/src/kernel/execution/triggers.ts`. I read code and tests only. Nothing was run, including the suspected bugs in (E).

## (A) Pages

| Path in `packages/docs/content/` | State | Purpose | Topic id |
|---|---|---|---|
| `build/extensions.md` | stub | What extends Volvel, what extensions are, the list screen | `build-extensions` |
| `build/extension-editor.md` | stub | Editor fields and lifecycle, both kinds | `build-extensions-editor` |
| `build/writing-a-connector.md` | new | `defineConnector` and console form, tutorial | none |
| `build/writing-a-trigger-source.md` | new | Webhook and poll sources | none |
| `build/flow-nodes.md` | new | Core nodes, a script as a node, grants | none |
| `build/writing-a-widget.md` | exists, stale | Tutorial | none |
| `build/widget-contract.md` | new | `@volvel/widgets` reference | none |
| `build/component-kit.md` (or `kit-components.md` + `kit-theming.md`) | new | `@volvel/ui` for app authors | none |
| `instance/component-kit.md` | stub | The live sheet | `instance-kit` |

Register new pages in `build/index.md` `pages:`. `build/resource-editor.md` (`build-resources-editor`) edits only connection, connection_group, variable, event, schedule, trigger (`apps/console/src/screens/ResourceEditor.tsx:36`). Connectors and trigger sources are not edited there; `kit/objects.tsx` links them to Extensions.

## (B) Content

**extensions.md**
- Spec's five extension points: trigger, step, connector, data source, interface widget (`docs/master-spec.md:574`). The screen lists only two kinds: `connector` and `trigger_source`.
- Title "Extensions"; buttons "New trigger source" and primary "New connector" (dev workspace only). Columns Extension, What it is ("Connector", "Trigger source for a schedule", "Trigger source for a webhook"), What it does, State (deployed / Draft / "From the repository"). Empty state "No extensions yet". Au:1152-1300; `apps/console/src/Extensions.test.tsx`.
- Routes: `extensions/{connector|trigger_source}/new` and `/edit/<path>` (`Tenant.tsx:600`).
- Permissions: `resource:write` plus `code:write` (`packages/manifest/src/permissions.ts:259`, `apps/control-plane/src/routes/authoring.ts:202`). Tenant switch off gives 403 `console_code_off`.

**extension-editor.md**
- Header: "New connector" / "New trigger source" or the path; state pills; "Name and path", Discard draft / Remove, "Save draft", Deploy menu ("This change only", "Review all drafts"; toast "Promote to …", `kit/DeployMenu.tsx`). Path hint "Its name in this workspace. It can be renamed later, and stays the same resource."
- Settings panel starts open for extensions. Fields:
  - Both: "What it does".
  - Connector: "What a connection is set up with, as JSON Schema" (Au:138-190). No timeout, uses or retries.
  - Trigger source: "It is handed" (Each request to a webhook / Each tick of a schedule), "Give up after (seconds)" (1-300, default 30), "Connections it uses", "Secrets it reads", "Variables it reads" (Au:560-650).
- Starters: Au:55, 76, 94. Changing mode swaps the code only while it is an untouched starter.
- Saving: Ctrl/Cmd+S; autosave 3 s after the last change once saved or deployed; unsaved new one kept in the browser ("Restore it" / "Discard"). No test pane, no ⌘↵, no Problems tab (those are script-only, Au:1030). Both kinds say to deploy and try it through something else (Au:693, 699).
- Repository-defined: read-only source, cannot be taken over; a new one at the same path replaces it on deploy.
- Imports: `@volvel/sdk` and `node:` only, 256 KiB of source (`kinds.ts:112`); default export required. `packages/compose/src/index.ts:39-50,150-200`.

**writing-a-connector.md**
- `defineConnector<Config, Client>({ path, key?, title?, description?, configSchema, create(config, credential, signal), test?(config, credential, signal) })` → `ConnectionTest { status?, message? }` (SDK:535-600; `packages/sdk/src/extensions.ts`). Must be exported.
- Console form: default export is the `create` function alone.
- Use: `defineConnection({ path, connector })`, `defineConnectionGroup`; `await ctx.connection<Client>("path")`, `ctx.connections("group").get(key)`. Files: `<name>.connector.yaml` + `.connector.ts`.
- Built-ins: `http` (config baseUrl, headers, auth bearer/header/basic), `smtp` (host, port 587, security starttls/tls/none, from, username), `oauth2`. Sources `packages/sdk/src/{http,smtp,oauth2}.ts`.
- The Connections screen draws its form from `configSchema` (`ConnectionWizard.tsx:443`, SchemaForm); unsupported parts fall back to JSON. Give `title` and `format` (`textarea`). The secret is separate from config.
- Validation (T:145-300; `bundle-check.ts:217-243`): unknown connector, a path equal to a built-in, or an invalid JSON Schema → 400. Binding is checked against the connector's schema, including an undeployed draft or uploaded bundle. Deploying a stricter schema → 409 `bindings_invalid` with `/connections/<path>`. Unbound → 409 `bindings_missing`.
- Test: the worker runs `test` from the active bundle. Without one: "The connector has no test of its own. Its client was made." (`packages/worker/src/runner.ts:145`). `throw` with a numeric `status` reports it.
- API: `GET …/connectors`, `PUT …/connection-bindings/{path}`, `POST …/connection-test*` (verify the last name; handler `routes/execution.ts:2625`).

**writing-a-trigger-source.md**
- `defineTriggerSource({ path, description?, mode: "webhook"|"poll", connections?, secrets?, variables?, timeoutSeconds?, worker?, run })` (SDK:404-480).
- `WebhookRequest { method, headers, query, body, rawBody }` (lowercase headers; `authorization` and `cookie` removed). `WebhookSourceResult`: `{accept:false, reason?}`, `{input}`, `{inputs}`. `PollTick {cursor, scheduledFor}`, `PollResult {items, cursor?}`. SDK:357-410.
- Naming it: `defineWebhook({source})`, `defineSchedule({source})`, `trigger.webhook({source})`, `trigger.schedule(cron,{source})`. Console: webhook "Each request is checked" → "By a trigger source of your own" (`FlowSteps.tsx:284`, offered only if a webhook source exists), schedule "Trigger source (optional)" (`ScheduleForm.tsx:163`).
- Runtime (CT:569-660, 735-790, 1000-1020): runs on a worker, no retries, output unchecked. Max 100 starts per answer. Each start idempotent by `source:<run>:<index>`. Run trigger detail: `trigger`, `source`, `sourceRun`.
- Full example: Stripe-style HMAC and cursor inbox (T `sourced()`).

**flow-nodes.md**
- Core nodes (`packages/nodes/src/index.ts`): `core/http-request` "HTTP request", `core/send-email` "Send email", `core/table-read` "Read rows" (limit 1-1000, default 50), `core/table-write` "Write a row" (insert/update/delete), `core/publish-event` "Publish an event". Document inputs, outputs, timeouts. `GET /core-nodes`.
- A script as a node: `defineScript({ node: { label ≤60, icon?, category? ≤40, takes?: ("connection"|"table"|"event")[] } })` (SDK:220; `kinds.ts:255`). Palette category: own `category`, else "This workspace's"; unlabelled scripts appear under "Scripts" by path (`FlowEditor.tsx:633`).
- Input schema draws the step form: `title`, `description`, `enum`, `default`, and `"x-pick": "connection"|"table"|"event"` (`FlowSteps.tsx:42,70,142`). "Its input": "Field by field" / "As one expression".
- Grants: `step.script("core/table-read", { inputs, with: { tables: [...] } })` (SDK:801-845). A step hands over exactly that. Errors "which does not take one", "which is not a table in this repository", "not both" (T "a node reaches what its step hands it").
- Core path prefix reserved. A bundle carries only used nodes, pinned at compose.

**writing-a-widget.md / widget-contract.md**
- Package `@volvel/widgets` (folder `packages/widget-sdk`, no React), re-exported from `@volvel/sdk`; subpaths `/page`, `/action`.
- Definition (W:217): type regex `pack/name`, version x.y.z, title, description, category, icon, surfaces, `data`, `dataHints`, `config`, `defaults`, `initialData`, `events`, `layout` (`min`, `default`, `max`, `phone`, `frame: card|none`), `role` (core only).
- Data shapes `rows|summary|record|approvals` (W:46); `DataInputDeclaration` label/required/sources/values/breakdowns (W:53). What views receive: `RowsData` (more, total, groups, sortBy, sorted, names), `SummaryData` (previous, trend), `RecordData`, `ApprovalsData` (W:377-458).
- All 28 controls, grouped (W:126). Hint keys: tab, group, level, control, label, help, of, types, choices, when, order (W:174).
- View props (W:516-585): config, data, size, emit, building, viewing, title, act, decide, refresh, can, why, close, viewer, selectedRecord, listens, choices, place, tab, filters. There are no hooks. `act` paths: `on/<event>`, `config/<prop>`, `config/<prop>/<i>/action`.
- Actions are data: step kinds update, create, delete, flow, script, open, close, message, narrow, rows (`widget-sdk/src/action.ts`). Server steps are the first five.
- Helpers: `formatValue`, `formatNumber`, `formatDay`, `numberOf`, `sentenceCase`, `choiceWords`, `mustGive`, `moneyFormatOf`, `parseMoney`, `moneyText`, `FORMAT_SCHEMA`.
- Sizing: container queries on `cell` (`@[14rem]/cell:`).
- Testing: `packages/widgets-labs/src/goal.test.tsx` (`definitionProblems`, `WidgetRegistry`, render the view with happy-dom).
- Packaging and loading today: hard-wired imports only. Console `screens/builder/registry.ts:25`; served apps `packages/screens/runtime/main.tsx:37`; manifest `page.ts:602`; plus Tailwind `@source` (`apps/console/src/styles.css:6`) and Dockerfile. `viewRegistry` throws on a duplicate type or missing view (`packages/screens/src/types.ts:181`). Import rule: `enforce.test.ts:560`.

**component-kit (kit reference)**. Install `@volvel/ui`, `@volvel/ui/tokens.css`, `@volvel/ui/icons` (Lucide, `ICON` 14/16/20, `STROKE` 1.75). Exports (`packages/ui/src/index.ts`):
- *Actions*: Button (variants primary/main, secondary/normal, quiet, danger, danger-solid, promote, dashed; sizes small, regular, large; loading, tooltip, keys), Menu, ContextMenu (right-click menu), Popover, SegmentedControl, Switch, MoveButtons, Kbd, Tooltip/TooltipProvider.
- *Fields*: TextField, TextAreaField, NumberField, MoneyField, DateField, DateInput, SelectField, ComboboxField, MultiSelectField, CheckboxField, DateStepper, FieldFrame, FieldHelp, FieldMarks, `fieldControl`, `utcInputValue`, `utcInstant`, `isoDay`.
- *Forms*: Form/`checkForm` (flat JSON Schema), SchemaForm/`checkValue`/`cleanedValue`/`startValue` (nested).
- *Data*: Table (plain), Grid (sort, filter, edit in place)/`parseValue`/`showValue`, Pagination, Tree, Facts, JsonView, ResultView/`resultShapes`/`columnsOf`/`MAX_TABLE_ROWS`, LogViewer/`logText`/`saveText`, Timeline, Sparkline, Chart (Vega-Lite; `seriesColors`, `chartConfig`, `readChartTokens`, `SURFACE`).
- *Structure*: PageShell, Panel/ContainedArea/`useContained`, Tabs, Details, Dialog, SideSheet, HeadingSlot/OnHeading/`hasHeadingControls`, Appear/Closing/`useLast`/`useOpening`.
- *Feedback*: Notice (info, attention, danger, success, plain), EmptyState, Badge, ValueChip, `readableOn`, Avatar/`initialsOf`, Skeleton, ToastProvider/`useToast`, DialogsProvider/`useDialogs` (confirm, prompt, type-to-confirm).
- *Content*: Markdown, MarkdownKnows/`useMarkdownKnowledge`/`knowledgeFrom`, Doc, `servedComponents`, `reveal`, Term/TermScope/TermText/GlossaryProvider/Toggletip.
- *Inspector ("drawer") kit* (`src/drawer/index.ts`): DrawerHeader, DrawerTabs, DrawerPanel, DrawerGroup, DrawerRow, DrawerBlock, DrawerEditor, DrawerSwitch, ToggleRow, DashedAdd, ChipSet, CheckChip, SentenceChip, AddChip, TilePicker, RadioCards, PositionPicker, ConditionEditor, SortEditor, NumberFormatPicker/Row, SortableRows/`useSortable`, `edgeShadows`.
- *Utilities*: `duration`, `contrastRatio`, `CONTRAST_NEEDED`, `luminance`, `useFlip`, `useKeys`, `PAGE_ICONS`/`pageIconOf`.
- Theming: 27 settable tokens (`kinds.ts:1233`); values must match `THEME_VALUE_PATTERN`, no `url`/`var()`. `data-theme` light/dark, else system. Derived, not settable: field, hover, ring, track, scrim, shadows, control height. Type roles, radii, layer and motion utilities: `tokens.css:243+`. Set via `defineTheme({tokens, dark})` or Branding.

**instance/component-kit.md**: Instance > "Component kit", `/instance/kit` (`nav.ts:270`). Read-only samples. Sections in order: Tokens, Type roles, Corners and elevation, Motifs, State and environment, Actions, Narrowing stages and facts, Status with a next step, Fields, Notices, List densities, Grid, Saving a page, Tooltips keys and menus, Help/fold/tree, A page of documentation, Rows checked, Panes and a difference, Values, Drawer (`KitDrawer.tsx`), The boards' parts, Empty canvas. Say which parts are console-only (`apps/console/src/kit`: PageHeader, DataTable, StatePill, EnvTag, SignalPath, SplitPane, SaveBar, DiffView, etc.) and not importable from `@volvel/ui`.

## (C) Gotchas
- Webhook sources answer 202 always: a rejected signature still creates a source run, and starts nothing. "The request is answered by the flow" and a source exclude each other (`FlowSteps.tsx:277`).
- Nobody can start a source by hand (404). Pausing the trigger while its source runs drops the answer.
- Poll: omitted cursor keeps its place; the cursor is committed even when an item cannot start (that item is logged and lost). A tick is skipped while the last is running, or over the backlog limit.
- More than 100 items are dropped with only a server log, yet the cursor advances. Document "return at most 100".
- A source cannot publish events or use tables: `uses` is connections, secrets, variables.
- A run uses the connector code from its own pinned bundle.
- OAuth2 is refused in connection groups; failure notifications need an `http` connection.
- The credential never appears in run input/output or audit.
- "As one expression" keeps earlier grants; switching back to fields clears them.
- Core nodes started by hand have no grants and fail.
- Icon names resolve only to 15 names in the builder; others draw a puzzle piece (`builder/widgetIcons.ts`).
- `formatValue` is always en-US; `parseMoney` uses the person's locale.

## (D) Wrong, stale, missing
- `writing-a-widget.md`: three shapes (four exist); 15 controls listed (28 exist); five view props; `target` shown in Display, really Data/"Progress" and labelled "Goal"; `values: {1,1}`, really `{1,2}`; omits `goalFrom`, `percent`, `reached`; "Colour" vs "Color by how close"; hint `group`, `defaults`, `initialData`, `frame` missing.
- Its "Nothing else was written" is false: Goal has a custom drawer (`kit/inspector/widgets/registerCharts.ts:22`, `goalDrawer.tsx`), an Add-to-page preview (`selectorData.ts:148`) and `InspectorHost.tsx:61`. The "not available yet" alert is still right.
- `build/scripts.md` says Remove is in the list's inspector "…the same is true of extensions". Extensions has no inspector; Remove is only in the editor.
- `docs/sdk-guide.md`: no `defineConnector`, `defineTriggerSource` or node section; its widget passage (192-230) uses old type names.
- W:223 comment and decision 0005 say a deploy pins widget versions. I found no such code.
- `registry.ts` INTEGRATOR comment is stale. `TriggerSource` in `extensions.ts` is an internal interface, not what authors implement: do not document it.
- Generated kind pages omit descriptions for several fields; `coverage.json` kinds 0.429.

## (E) Likely bugs / questions
1. Trigger sources' `uses` are never validated: not in bundle-check (`:189-202` is scripts only), nor `missingBindings` (`deploy.ts:30`). A missing secret fails at runtime.
2. Console-written connectors cannot have `test` (`EXPORT_SHAPE`, `compose/index.ts:41`), though YAML + `.ts` files go the same way.
3. The script editor has no UI for `node` (label, takes), yet its core notice says "give it a label" (Au:885). Only API or repo can.
4. `node.icon` is accepted but ignored by the flow palette.
5. `tenant.console_code` has no setter in UI or API: database only.
6. Monaco never loads `@volvel/widgets` types, while the SDK's `index.d.ts` re-exports them (`editor/monaco.ts`).
7. Editor for a read-only repository connector shows generic "Code" production text; a build error on deploy shows only as a message, no line jump (Problems is script-only).
8. `slots` draws only "its places are drawn by the widget" unless registered (`controls.tsx:466`): unusable by a pack.
9. Drafts: a new draft trigger source lists without its mode, and edited drafts show the old description (Au:1187).
10. `/instance/kit` has no operator check in `App.tsx:143` (nav hides it).
11. `ThemeToken` in SDK lists 19 tokens; the schema accepts 27.
12. `registerWidgets` has no callers outside its package. Is it the intended pack hook?
13. Path regex: connection wizard forbids `_`, extension editor allows it.

Decide: publish widget-contract now, flagged "for platform contributors", or hide it?

## (F) Screenshots and examples
- Screens: Extensions list (mixed states, dev) and empty state; new connector; new trigger source in each mode; repository read-only notice; connection wizard drawn from a custom schema; webhook "By a trigger source of your own"; flow palette with Core and custom category; a labelled node's form with `x-pick`; Add to page with the labs tag; Goal inspector Data tab; Component kit light and dark; Drawer section.
- Code: connector in SDK and console form with `test` (SDK); connection + script using it; HMAC webhook source and cursor poll source (lift from T); node script `count-rows` with `takes` (T); flow using core nodes via `step.script(... with)`; Goal definition, view and test (`packages/widgets-labs`); an app using PageShell, SchemaForm, Chart, toast; `defineTheme` example. Real usage: `examples/fernhill/apps/front-desk`, `examples/acme/apps/portal`. No example repo uses `defineConnector` or `defineTriggerSource`, so add one.
