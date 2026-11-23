# Fact-check record: console/how-to/widgets/lay-out-a-page-for-phones.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Toolbar Desktop / Tablet / Phone; ⋯ (More about <widget>) menu has Layout, Duplicate, Move to…, Remove. | `kit/inspector/Inspector.tsx:270-305`; run | writer, run on the instance 2026-11-23 | holds as run |
| Smaller screens: Tablet and Phone Automatic/Custom with Column, Row, Width, Height. | `kit/inspector/LayoutPanel.tsx:124-176,276-285` | writer, run on the instance 2026-11-23 | Custom not run |
| On narrow screens: Automatic, Keep, Full, Stack, Hide with their sentences. | `LayoutPanel.tsx:57-63,283-295`; run (Automatic, Full sentences seen) | writer, run on the instance 2026-11-23 | holds |
| Priority: higher stays nearer the top; none counts as 0; then the phone's places. | `LayoutPanel.tsx:315-322`; `packages/screens/src/narrow.ts:104-116`; run: chart at 5 came first at 390 px | writer, run on the instance 2026-11-23 | holds as run |
| Hide on phones is per column; phone table is a list. | `widgets/ColumnEditor.tsx:238`; run (390 px) | writer, run on the instance 2026-11-23 | holds as run |
| Stack below 42 rem (page), 58 rem (tablet), 28 rem (container). | `packages/screens/src/PageView.tsx:185-190` | writer, code only | not run |
