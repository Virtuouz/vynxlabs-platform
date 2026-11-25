# Fact-check record: develop/how-to/widget-data-and-events

Lines are current at commit `aabf96af` (branch p34-b6) plus the docs of this lane, 2026-11-24. Written by the writer (B6); "Checked by" is for the second agent. Lane b4r reviews the frame host and the widget route at the same time: re-check the rows marked (b4r) after it merges. Run log: `docs/documentation/runs/develop/how-to/widget-data-and-events.md`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The definition of `x/clinic-load`: inputs `visits` (summary, 1 value, 1 breakdown) and `clinics` (rows); events, payload schema. | `examples/fernhill/src/widgets/clinic-load/widget.ts` | writer | holds |
| `sources` default: a table or a query, and SQL on a dashboard. | `packages/widget-sdk/src/index.ts:66`; `packages/manifest/src/page.ts:1206` | writer | holds |
| Shapes rows, summary, record, approvals. | `packages/widget-sdk/src/index.ts:50` | writer | holds |
| `dataHints` are the Data tab's controls; an input with none has no controls in the console. | `packages/cli/src/widget.ts`; run (a scaffold without them had no Data tab) | writer, run | holds as run |
| `gives` is record, group or nothing, with the shapes `{record}`, `{group}`. | `packages/widget-sdk/src/index.ts:80-93`; `packages/screens/src/frameChannel.ts:51-62` | writer | holds |
| Event name: small letter first, letters and digits, 41 characters; a hyphen is refused at build ("event \"clinic-chosen\" is not a name"). | `packages/widget-sdk/src/index.ts:306`; run | writer, run | holds as run |
| The payload keywords the page reads; an unknown keyword admits nothing. | `packages/widget-sdk/src/schema.ts:1-40` (b4r) | writer | holds |
| The page drops a message whose event is undeclared or whose payload does not fit: reasons `the widget does not declare an event "…"` and `"<event>": <problem>`. | `packages/screens/src/frameChannel.ts:118-126` (b4r) | writer | holds |
| A dashboard is `platform/boards/<name>.dashboard.yaml`, schemaVersion 3; placed widget fields `version`, `config`, `data`, `on`. | `examples/higher-ed-devices/platform/reports/lending.dashboard.yaml`; `packages/widget-sdk/src/page.ts:222-252`; run | writer, run | holds as run |
| Step `narrow` with `filter` and `from`: sets a page filter to what the event gave. | `packages/widget-sdk/src/action.ts:76-77`; run | writer, run | holds as run |
| Deploy prints `created  dashboard  boards/clinic-load`; two gauges and a table drawn; pressing a gauge sets **Clinic** to the clinic and shows **Clear**. | run | writer, run | holds as run |
| A `rows` input over more than one page draws and pages (was blank before b7: the host posted functions, which cannot be cloned). | `TenantWidgetHost.tsx:109-137`; `packages/widget-sdk/src/frame.ts` `toWireData`; `TenantWidgetHost.test.tsx` (p34-b7); `e2e/widget-frame.spec.ts` | b7, run | holds |
| Fernhill's codes are northside, riverside, hilltop. | `examples/fernhill/src/constants.ts:4` | writer | holds |
| `volvel dev --widgets` log lines passed/dropped. | `packages/cli/src/dev-widgets.ts`; `packages/screens/runtime/dev-widget-host.ts` | writer | holds |
