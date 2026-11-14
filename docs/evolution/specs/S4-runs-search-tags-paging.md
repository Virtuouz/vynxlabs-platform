# S4: Runs search, tags and paging

Roadmap: [P1-3](../07-roadmap.md#p1-3-runs-search-tags-and-paging-s4). Priority P1. Complexity M.

## Problem (verified)

- `Runs.tsx:92` requests `limit=100` and never pages.
- `/activity` (`routes/operations.ts:134`) filters by status, kind and time window only.
- `?status` is read once and not written back.
- The list doesn't show the error.
- The spec requires "runs are searchable per workspace" (`docs/master-spec.md:548`).

## Design

**Schema** (one migration):
- `run.tags text[] not null default '{}'` and `flow_run.tags text[] not null default '{}'`, with GIN indexes.
- `run.error_summary text` and `flow_run.error_summary text`. Each holds the first line of `error.message`, at most 200 characters, set when the failure is recorded. Add a `pg_trgm` index on each, falling back to `ILIKE` without the extension.
- Indexes on `(workspace_id, created_at desc, id)` for paging, if missing.

**Tags:**
- From code: `ctx.run.tag(...tags: string[])` (SDK `context.ts`, worker `ctx`, a new worker route `POST /worker/runs/:id/tags`). At most 10 tags, each `^[a-z0-9_.:-]{1,64}$`.
- From triggers: an optional `tags: string[]` of CEL expressions on webhook, event and schedule triggers, evaluated with the trigger input. Example: `["'order:' + string(trigger.body.id)"]`.
- Flow runs inherit the trigger's tags; step runs inherit the flow run's tags.

**API.** `GET W/activity` adds:
- `q`: matches path prefix, exact run or flow run ID, exact tag, or error summary (trigram).
- `tag` (repeatable).
- `cursor` / `limit` using the shared `PageQuery`/`pageOf`, limit 200 at most.

**Console.**
- Filters (status, kind, window, `q`, tags) live in the URL. The header failed chip links with `?status=failed`.
- **Result** column: the error summary, or "→ n items" for output arrays.
- Rows shrink to a single line, 40 px.
- "Load more" at the end, with infinite scroll on phones.
- Tag chips on rows; clicking one filters by it.

## Acceptance criteria

1. With 5,000 runs, the list pages through all of them. The first page answers in under 150 ms on the seeded Fernhill database plus 5,000 synthetic runs.
2. Pasting a run ID into search shows that run. Searching `refused` finds runs whose error contains it.
3. `ctx.run.tag("order:1234")` makes the run findable by `tag=order:1234`. The tag shows on the row and on the run page.
4. Reloading the page keeps all filters. Browser back restores the previous filter set.
5. The 390 px layout shows the path in full (wrapped), a status icon, and the time.
6. `schemas/` is regenerated (`pnpm emit:schemas`) for the trigger `tags` field, and `pnpm check:schemas` passes.

## Dependencies

P0-2 (bounded tables keep the indexes small). P0-5 (state vocabulary).
