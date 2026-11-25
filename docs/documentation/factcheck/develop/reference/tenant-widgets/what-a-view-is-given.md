# Fact-check record: develop/reference/tenant-widgets/what-a-view-is-given

Lines are current at commit `aabf96af` (branch p34-b6) plus the docs of this lane, 2026-11-24. Written by the writer (B6); "Checked by" is for the second agent. Lane b4r reviews the frame host and the widget route at the same time: re-check the rows marked (b4r) after it merges.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The hint fields: tab, group, control, label, help, choices, order; tabs data/display/actions/rules. | `packages/widget-sdk/src/index.ts:121-212` | writer | holds |
| A page's config is checked against the schema. | `packages/manifest/src/page.ts:665-700` | writer | holds |
| A widget added in the builder starts with `defaults`; the schema's `default` is not applied (a placed scaffold without `defaults` drew ": 3699"). | run; `packages/cli/src/widget.ts` | writer, run | holds as run |
| Row shapes and their fields; column fields and types. | `packages/widget-sdk/src/index.ts:496-615` | writer | holds |
| A summary row has one key for each breakdown and value. | run (`{clinic, visits}`) | writer, run | holds as run |
| A rows input is one page, with `more()` and `sortBy()` that ask the page; `total`, `sorted`. | `packages/widget-sdk/src/frame.ts` `toWireData`, `fromWireData`; `TenantWidgetHost.tsx:160-175`; `e2e/widget-frame.spec.ts` | b7, run | holds |
| Sizes in cells: 12 columns, 40-pixel rows; `narrow`. | `packages/widget-sdk/src/page.ts:150-160`; `index.ts:637-643` | writer | holds |
| `state` values; the page's read gives loading, empty, failed, forbidden or ready, and the view stays in its cell for each, with Try again under a failed or forbidden one. | `packages/widget-sdk/src/index.ts:625-630`; `TenantWidgetHost.tsx:118`; `Frame.tsx` (tenant widget branch); `PageView.tsx` (`state`) | b7 | holds |
| Not given: only the props are posted. | `TenantWidgetHost.tsx:109-126` (b4r) | writer, b7 | holds |
| The server reads each input for the viewer under the table's rules. | `apps/control-plane/src/kernel/data/query/inputs.ts` (`readWidget`); `apps/control-plane/src/tenant-widgets.test.ts` | writer | holds |
