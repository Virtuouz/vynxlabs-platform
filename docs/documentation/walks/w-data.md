# Walk w-data (phase 29): tables, queries, sources, dashboards, files

Instance http://localhost:8091, as Maya Brooks (and Amara Okafor, viewer). Own workspaces `w-data dev` / `w-data prod`; in sandbox only `wdata-*` tables, `wdata/params`, three `wdata ...` dashboards. Shots: ~/.local/share/volvel-walk/shots29/w-data/ (`sw-<width>-<theme>-<screen>.png` is the sweep).

## Right (walked)
- Create table: description, reference first column, More columns, owner rows, duplicate name, empty name (native "Please fill out this field." tooltip).
- Rules (required/unique/default; unique refusal names "3" is in 3 rows), Change type, Change table, Add column with a default (bad default said on the field), Indexes add/remove/reload, Undo/Redo, Retire, Bring back, See it as person and group (search finds an end user past page one).
- Filters: `10..20`, `..5`, `7..`, `a | b`, `!x`, `!empty`, `empty`, `!~x` (text only; says so on a list column), "Rows must match" any/every, survives reload; the same on a source's rows. Shift-click and Shift+Enter multi-sort with numbers.
- Cells: choice select, day, moment, several-of-list dialogs; yes/no cycles by double-click, Enter, F2.
- Queries: parameter panel (bad name, bad default, saved, back after reload), Rows to return, cut-short message, "A value is needed.", viewer runs a deployed query by name, `?query=` of a missing query.
- Sources: Declare source, deploy, Connect (accessible name), Edit, failed health. Dashboards: name/description, Keep as resource, draft state, source table over a source (not offered to a stat). Files: upload, empty file refused, search, named-by, Delete confirm.
- No page overflow at 1440, 768, 390, light or dark.

## Wrong
1. Bring back loses indexes (TAB-P6). Retired page says "No indexes" and the table returns without them. Cause: `apps/control-plane/src/routes/data.ts:~544` reads `indexes` (and description) from the live resource, which a retired table no longer has.
2. Picker "Where it reads from": rows with a long hint (a source's table, a query like "Vet workload") show no name at all, 1440 light, shot `d15-list-bottom.png`. Cause: `kit/inspector/queryParts.tsx:167-170` hint is `shrink-0`.
3. Queries header at 390 (both themes): "New query / Name and path" buttons overlap "Draft, never deployed", `sw-390-light-queries.png`. Cause: `screens/Queries.tsx:545-557`.
4. New dashboard with 101 characters: the field cuts to 100 silently and makes the dashboard; no message (DAT-33). Cause: `packages/ui/src/Dialogs.tsx:177` native maxLength.
5. See it as a group says "1355 rows in all" (no comma, others show 3,652) and two near-duplicate lines: `RowRules.tsx:401`.
6. Files: why Delete is disabled is only a `title` (`Files.tsx:264`), unseen on keyboard and touch.
7. Minor: a text default shows quoted ("open") but a number does not; "Optional." repeats under "optional" fields.

## Not walked
Slow-read link to Indexes, hidden-tab timer, Share with groups, dashboard Remove/Keep and deploy-over-draft, over-50 files, second-context conflicts, 768 interactions beyond the sweep, a Connect that succeeds.
