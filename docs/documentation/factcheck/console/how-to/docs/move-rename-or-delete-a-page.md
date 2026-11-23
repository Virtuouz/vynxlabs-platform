# Fact-check record: console/how-to/docs/move-rename-or-delete-a-page.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Rename by pencil, menu Rename, or F2; title and file name edited together; file name follows the title; limits 120 and 80; Save, Enter, Escape. | D/Docs.tsx:1130-1290, 576, 1038-1062 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| "Renamed <title>." and index keeps its name. | D/Docs.tsx:447-449, 1089 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Move by drag (inside a folder or between rows), or Move to… dialog Into the folder, Move; same dialog in the editor. | D/Docs.tsx:258-300, 1293-1349; D/DocEditor.tsx:703-727 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| "Moved X into Y." and "Put X in its new place." | D/Docs.tsx:274 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Lists follow and relative links are rewritten; topic links and links that start with / are left. | packages/docs-engine/src/ops.ts:274-325, 356-384 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Top-level folders have no grip. | D/Docs.tsx:297 (`row.path.includes("/")`) | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A page goes in a folder; top level holds folders. | packages/docs-engine/src/ops.ts:366-370, 459-463 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Duplicate: `-copy`, `-copy-2`; no topic, terms, key. | packages/docs-engine/src/ops.ts:503-545 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Delete asks to type the file name; page and folder texts. | D/Docs.tsx:913-930 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| To be removed; Keep, then Keep question: "This throws away the draft that removes it. The page stays as it was last deployed." | D/Docs.tsx:933-949; kit/RemoveDraftButton.tsx:20-26 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Undo from each message puts the pages back; page follows a move and back. | D/Docs.tsx:226-256, 854-894 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| The 90-day permanent redirect after a deployed rename or move; the old page before the deploy; no redirect in `_draft/`. | apps/control-plane/src/kernel/apps/front.ts:1290-1306; docs/documentation/fixed/p30-m4.md; run | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Errors "There is already something named … here.", "A folder cannot go inside itself.", "A page goes in a folder. Top-level folders are the sites." | packages/docs-engine/src/ops.ts:366-380, 395-404, 459-463 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
