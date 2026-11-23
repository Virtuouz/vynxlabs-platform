# Fact-check record: develop/how-to/api/page-through-a-list.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `limit` 1 to 200, default 50, `cursor` opaque; answer `{items, nextCursor}`. | `pagination.ts:5-6,22-25` | pending | pending |
| Rows take `limit` up to 1,000. | `routes/data.ts:52` | pending | pending |
| `nextCursor` is `null` on the last page; the loop made 3 requests for 6 rows at limit 2 and printed Biscuit, Juno, Miso, Moose, Olive, Pickle. | run (`page.mjs`) | pending | pending |
| A list with no cursor says "Every one there is. The list has no cursor." or "At most N. …". | `pagination.ts:29-52` | pending | pending |
| Caps: clones 50, bundles 100, deployments 100, promotion requests 200, files 200. | inventory B "Lists" (`listOf(item, cap)` call sites); to be re-checked by the second agent | pending | pending |
| Keyset cursor for a table with a key sorted by at most one column; otherwise a row count. | `kernel/data/rows.ts:632-636`; `routes/data.ts:70-90` | pending | pending |
| 400 "The cursor is not valid."; `limit` over the maximum: 400 "must be <= 200" (1000 for rows). | `routes/data.ts:83,87`; run | pending | pending |
