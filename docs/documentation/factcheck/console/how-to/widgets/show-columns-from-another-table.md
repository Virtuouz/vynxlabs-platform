# Fact-check record: console/how-to/widgets/show-columns-from-another-table.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Also from has a chip for each table the source points to ("Pets by pet"); up to six. | `kit/inspector/rowsItUses.tsx:238-250`; `kit/inspector/model.ts:428-443`; run | writer, run on the instance 2026-11-23 | holds as run |
| Checking a chip offers chips for the other table's columns; a column whose result name already exists is not offered, with the stated note. | `rowsItUses.tsx:252-296`; run: "Name is not offered: Appointments already has a column called pet_name, ..." | writer, run on the instance 2026-11-23 | holds as run |
| The joined column is added in Display with + Column as "Pet breed", and is also offered by Only include, Sorted by, Group rows by, For each and measures. | run (Add a column list; For each list shows Pet species ... Pet weight lb); `rowsItUses.tsx:186-200` | writer, run on the instance 2026-11-23 | holds as run |
| A chip is grayed with "<Table> is used by Breakdown and Values: change that to stop following it." | `rowsItUses.tsx:263-270`; run: "Pets is used by Breakdown: change that to stop following it." | writer, run on the instance 2026-11-23 | holds as run |
| Scatter is grayed "needs a number" for a number column of a followed table. | run; `packages/widgets-core/views/chartSpec.ts:113`; `kit/inspector/widgets/chartDrawer.tsx:83-86` (breakdown name `pet.weight_lb` against result column names) | writer, run on the instance 2026-11-23 | holds as run (product fault) |
| Reader needs data:read; hiding is not security. | `apps/control-plane/src/kernel/pages/standing.ts:10-11`; Rules tab text, run | writer, run on the instance 2026-11-23 | holds |
