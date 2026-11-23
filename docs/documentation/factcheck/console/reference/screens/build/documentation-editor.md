# Fact-check record: console/reference/screens/build/documentation-editor.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Header: path, pencil Change the title, Page title field, limit, "The top of this page cannot be read…" | D/DocEditor.tsx:302-314, 379-428 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| State pills Not saved yet, Draft, To be removed. | D/DocEditor.tsx:416-426 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| File name box with .md, Move…, locked for index, rename success "Renamed to X.md." | D/DocEditor.tsx:733-792, 450-452 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| New page Path field, hint and the three refusals. | D/DocEditor.tsx:282-290, 430-444 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Compare with deployed / Hide what is deployed; What changes; Deployed / As it is here; "Nothing: this is what is deployed." | D/DocEditor.tsx:459-463, 612-627 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Preview in the app, Delete…, Done / Close, navigation guard text. | D/DocEditor.tsx:464-501, 244-247 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Toolbar Write: Undo, Redo, Insert and /, Heading, Bold, Italic, Link, List, Code, ⌘B ⌘I ⌘K, Cursor in. | kit/markdown/MarkdownEditor.tsx:229-296, 178-190 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Source / Split / Preview; Split only at 1024 px and wider. | kit/markdown/MarkdownEditor.tsx:127-130, 296-330 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Right-hand tablist Beside the source with Preview and Page details; preview texts "Following the cursor" and "Nothing written yet." | kit/markdown/MarkdownEditor.tsx:366-430 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Insert menu: Find a component, Blocks, Inline, the twelve names and the container rules; `product` and `screenshot` not offered. | kit/markdown/insert.ts:23-70; kit/markdown/MarkdownEditor.tsx:479-586 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Folded top with hint "Title, description, topic, N terms… · Edit in Page details". | D/DocEditor.tsx:64-79 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Page details fields, limits (120, 80, 500, 40, 50 terms, 10 aliases, 500 short, 50 about, 20 extends) and labels. | D/PageDetails.tsx:118-427; packages/docs-engine/src/schema.ts:42-175 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Type options and the "Use the folder's (…)" / "None: the pages under it say their own" / "(not a type)" labels. | D/PageDetails.tsx:101-113 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Subjects: lowercase hyphenated, add by Enter or Subject, five at most, disabled text, struck-through sixth, offered buttons Add <subject>. | D/PageDetails.tsx:22-30, 95-100, 182-260 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Terms rows and About rows and Notes on the product's help. | D/PageDetails.tsx:264-427 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| The form cannot-read notice. | D/PageDetails.tsx:64-71 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Problems panel: Line N, headings, "No problems", "This page would deploy as it is.", "Mend these before it can be deployed.", Ln/Col. | D/DocEditor.tsx:629-678 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Type and subject lints are warnings; subject_once and type_folder are said by the deploy only. | packages/docs-engine/src/diataxis.ts:96-187; docs/documentation/fixed/p30-m3.md ("Left, and why"); run | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Save draft, Discard, Unsaved changes, ⌘S, the two save messages, the revision rule. | D/DocEditor.tsx:116-143, 256-259, 679-702 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Draft clash banner, Copy what I wrote, Load their version, Load theirs. | kit/DraftClash.tsx:24-66 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Removed page banner and read-only source. | D/DocEditor.tsx:504-524, 544 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Starter text of a new page: title, empty description, "Write here." | D/DocEditor.tsx:60-62 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Preview shows type eyebrow, cards, related and the page's product terms. | D/DocEditor.tsx:556-591; D/Served.tsx | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Production workspace shows the notice at /docs/edit. | apps/console/src/screens/Tenant.tsx:590-604 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
