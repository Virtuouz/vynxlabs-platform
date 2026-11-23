# Run log: develop/how-to/writing-a-widget.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs). Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox (dev) workspace, at 1440 px, light theme, Playwright headless. No other width or theme was run.
- This page is for contributors to the source and was **not run end to end**: no new widget was added to the core pack.
- Run: `npx vitest run src/goal.test.tsx` in `packages/screens` of the walk tree: 15 tests passed (the definition, the pack, the view).
- Not run: **Add to page** with Goal and the Goal inspector on the instance. The App Builder walk is another writer's. The Add to page, Understand data and Goal inspector claims are from the code.

## Second check, 2026-11-23 (second agent)
- Walked **Add to page** in Fernhill's Sandbox, in the app `abapp-clinic`, as Maya Brooks, without adding or saving anything: at 1440 px light the picker shows four groups, **Work with records** (Table, List, Record detail, Form), **Understand data** (Stat, Chart, Pivot, Goal "How far a number is toward a target"), **Take action** (Button, Action group) and **Organize and explain** (Section, Tabs), with a **Suggested for this page** row above. The page had said the categories were shown as five (**Organize** and **Content** apart): corrected. At 390 px in dark the picker opens full width from :kbd[A] (the **Add to page** button is in the **Pages and widgets** panel there), one column, no horizontal scroll of the page.
- Checked against the code, not run: the 28 controls (`widget-sdk/src/index.ts:138-174`), the name rules (`:282-284`), Goal's hints, defaults and layout (`widgets-core/src/index.ts:1711-1850`), the view registration and the helper exports. A widget was still not added to the pack: the page is for contributors and the steps were not rebuilt on the instance.
