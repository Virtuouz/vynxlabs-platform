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

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| The Insert list: Callout, Tabs, Steps, Details, Code tabs, File tree, Pages in this folder, Glossary, Field under Blocks and Term, Key under Inline; Tab only inside Tabs; nothing inside Code tabs; "Inserts at the cursor, inside tab “One”."; / opens it on a line; Esc closes and returns to the source; a search with no match says "Nothing is called that." | apps/console/src/kit/markdown/insert.ts:55-75, MarkdownEditor.tsx:480-580; run | second agent, 2026-11-23 | added the empty state and the keys; the rest holds |
| "Cursor in tabs › tab “One”"; Source/Split/Preview; Split hidden below 1024 px; Page details a tab beside the source. | MarkdownEditor.tsx:300-380; run at 1440 and 390 | second agent, 2026-11-23 | holds as written |
| Ln and Col, "No problems" / "N problem(s)", "This page would deploy as it is.", Save draft (Ctrl+S) with "Saved as a draft. Deploy it from Documentation when it is ready.", Discard, "Unsaved changes", Close instead of Done while unsaved. | DocEditor.tsx:130-140, 460-500, 630-690; run | second agent, 2026-11-23 | holds as written |
| A mermaid block is drawn in the preview, and "This diagram does not read: Parse error on line 2:" with the source when it is wrong. | apps/console/src/diagrams/draw.ts; run | second agent, 2026-11-23 | holds |
| Page details limits (Title 120, Topic 80, Description 500, Icon 40, subject 80, five subjects, terms 50, also written 10, about 50, extends 20). | apps/console/src/screens/docs/PageDetails.tsx; packages/docs-engine/src/schema.ts:48-161 | second agent, 2026-11-23 | holds as written |
| Layout at 768 and 390 px, light and dark; no horizontal scroll; Source and Preview only at 390. | run, screenshots read | second agent, 2026-11-23 | holds |

## Phase 33, M5 (writer, instance 8097, 2026-11-24)

Lines are current at commit `661a2ceb`. Paths are under `packages/` unless stated.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Page details **Date**: a date field, optional, written as `date: YYYY-MM-DD`; meaning of the three sources. | apps/console/src/screens/docs/PageDetails.tsx:164-170; packages/docs-engine/src/schema.ts:165-168 | writer, run on 8097 | holds as written |
| The preview draws `::changelog` once the page's folder is a site; none otherwise; no date for an entry with neither date nor name day. | apps/console/src/screens/docs/model.ts:372-393 | writer, run on 8097 (none before publishing, three after) | holds as written |
| `::changelog` is not in the **Insert** list. | the list on 8097 | writer, run on 8097 | holds as written (a product gap, reported) |

## Phase 33, second check, 2026-11-24

Checked by: second agent, 2026-11-24. Run on 8097 and read against `model.ts`, `PageDetails.tsx`, `schema.ts`.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| A `::changelog` line draws the page's own site's entries newest first, none outside a site; an entry with no date shows none in the preview. | model.ts:373-393; run | second agent, 2026-11-24 | holds |
| The **Insert** list lacks `::changelog`: type it. | run (list read) | second agent, 2026-11-24 | page corrected: Insert offers **Changelog**; fault fixed (d4): `::changelog` is in the Insert menu (insert.ts), confirmed in the code |
| **Date**: a day from the browser's date field, optional, written `date: YYYY-MM-DD`; the order of precedence in the hint. | PageDetails.tsx:164-170; schema.ts:165-171; run | second agent, 2026-11-24 | holds |
