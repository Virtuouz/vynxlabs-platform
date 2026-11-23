# Lane ext2: fixed

No migration. No contract change (no route, schema or bundle format changed). `THEME_TOKENS` is a new export of `@volvel/sdk`, and `readerLocale`, plus a third optional argument on `formatValue` and `formatNumber`, are new in `@volvel/widgets`; both only add.

## EXT-07 (commit 6b468244)
- `packages/compose/src/index.ts`: a console connector's source may `export` a function `test`; it is carried beside `create` in the bundle's export for the connector (`testKey`, `EXPORT_SHAPE` use). The worker already ran `test` from a bundle (`runner.ts:146`), so Test on its connections now shows what the code found. Without one, the client is still only built.
- `Authoring.tsx` `CONNECTOR_STARTER` shows an optional `test`; the connector's note says what Test runs.
- Test: `compose.test.ts` "EXT-07: a console connector that exports `test` ..." (failed before: `test` was undefined).
- Siblings: script and trigger-source exports are unchanged; repository connectors never went through this path.
- Screens to walk: new connector (starter shows `test`), deploy, a connection of it, Test says the code's message. Polish gate: states (no `test`: the old message), lifecycle (edit, deploy, test), keyboard (editor unchanged), copy (note under settings).

## EXT-08 (same commit)
- `Authoring.tsx`: a script's Settings gain "Use as a flow step": Step name (empty keeps it out of the steps), then Icon, Group, "A step may hand it" (connection, table, event). Emptying the name removes `node` from the draft (`changeNode`). The core-step notice ("give it a label") is now true.
- Test: `Authoring.test.tsx` "a script written in the console can be given a place among the flow's steps (EXT-08)" (failed before: no field).
- Siblings: the flow editor palette reads `node` already. Worker pool for a trigger source (Missing parts 3) and a Problems tab for extensions (EXT-12) are not mine.
- Screens to walk: new script, Settings (open), 1440/768/390, light/dark, keyboard through the four fields, reload keeps the draft; then the flow editor's Add step shows it under its group.

## EXT-09, EXT-17 (same commit)
- `widgetIcons.ts` is the one resolver: the widgets' 15 names, the page icons (`PAGE_ICONS`), and `globe`, `radio`, `table-2` (the core steps' icons). `STEP_ICONS` lists what a person may choose. `PickableNode.icon` (`FlowSteps.tsx`); `FlowEditor.tsx` palette draws it (`PaletteIcon`), also for the platform's core steps. An unknown name stays a puzzle piece.
- The SDK comment on `WidgetDefinition.icon` says which names draw (packages/widget-sdk, commit 5599869f). The type stays `string`: narrowing it would refuse a pack's own names.
- Test: `FlowEditorWalk.test.tsx` "a step's icon is drawn beside its label in the palette ..." (failed before: no svg).
- Other users of the resolver: Outline, AddToPage, Inspector (all gain the larger set, none changed).
- Screens to walk: Add step in the flow editor, 1440/768/390, light/dark.

## EXT-13 (same commit)
- `Authoring.tsx` `Extensions`: a draft row reads its own draft (`DraftText`, one request per draft row) for the mode and the description. The list route's summary has no body, so no API change.
- Test: `Extensions.test.tsx` first test (a new poll draft lists as "Trigger source for a schedule", an edited draft shows its own description, not the deployed one).
- Siblings looked at: `FlowEditor.tsx` `ofKind` skips drafts when a mode is asked for (a draft poll source is not offered where one is needed): see Found. `ResourceEditor.tsx:323` has the same shape.
- Screens to walk: Extensions with a new draft source and an edited deployed one.

## EXT-15 (commit f526d434)
- `packages/sdk/src/index.ts`: `THEME_TOKENS` (27) is exported and `ThemeToken` derived from it. The SDK cannot import the manifest (it would become a dependency of the published package), so `apps/control-plane/src/theme-tokens.test.ts` holds the two lists equal.
- Tests: `packages/sdk/src/theme.test.ts` (failed `tsc` before: excess property `focus`, `structure`), `theme-tokens.test.ts`.

## EXT-18, owner question (a), D38 (commit 5599869f)
- `packages/widget-sdk/src/locale.ts`: `readerLocale()` (the browser's first language, else en-US) and `usableLocale`. `formatValue(value, format, locale?)` and `formatNumber` write in it; `money.ts` `marks` reads it, so what is written reads back. The lower-case `$43.1k` compact rule stays for English only.
- Tests: `format.test.ts` "the reader's locale (EXT-18, D38)" (failed before: always en-US).
- Callers: no signature changed. Callers that still write `toLocaleString("en-US")` for counts, left for after bldwid merges (widget views): `packages/widgets-core/views/table.tsx:62,67,366`, `groups.tsx:62,208`, `chartSpec.ts:575`, `packages/screens/src/Frame.tsx:197`, `navigation.tsx:361`, `packages/ui/src/drawer/EditorBodies.tsx:189`; `chartSpec`/`axisFormat` use d3 `$,~f` formats (en-US marks). `packages/ui/src/dates.ts` `localeOf` is the same rule as `readerLocale`; it could call it.
- Screens to walk: a figure and a money input with the browser in de-DE.

## EXT-21 (code and screen text only)
Nothing in code. Lines for the writers:
- `packages/docs/content/build/scripts.md:11`: extensions have no inspector; Remove is in the editor only. A script can now be a flow step from its Settings (EXT-08); a connector can export `test` (EXT-07).
- `build/writing-a-widget.md`: Goal values are `{1,2}` (`widgets-labs/src/index.ts:23`); "Nothing else was written" (line 148) is false (`goalDrawer.tsx`, `registerCharts.ts:16`); `icon` names are those in widgetIcons (EXT-17).
- `docs/sdk-guide.md`: add `defineConnector` (with its optional `test`) and `defineTriggerSource`; `ThemeToken` has 27 names; numbers follow the reader's locale (D38).
- CHANGELOG: connector `test` from the console; "Use as a flow step"; step icons; 27 theme tokens; locale-following numbers.
- An example repository with `defineConnector` and `defineTriggerSource` was not added (outside code and screen text).
- D60 (owner question (c)): nothing in code.

## Found
- `FlowEditor.tsx` `ofKind(kind, mode)` and `ResourceEditor.tsx:323` leave out drafts when a mode is asked for, so a poll trigger source that is only a draft is not offered where a poll source is chosen.
- A script that has a step name loses its icon and group when the name is cleared to retype it (the manifest needs a label of at least one character).
