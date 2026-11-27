# S2: Retention and pruning

Roadmap item (the 2026 roadmap, in volvel-internal): P0-2. Priority P0. Complexity M–L.

## Problem (verified)

- No code deletes from `run`, `run_log`, `flow_run`, `step_run`, `event`, `webhook_refusal`, `health_check`, or the S3 objects behind `input_ref` and `output_ref`.
- `audit_entry` has triggers that block update, delete and truncate (migration 0007), so even tenant deletion cannot remove it.
- The spec requires retention configurable per tenant (`docs/master-spec.md:549`) and leaves the default open (`:749`).

## Design

**Policy.** Instance defaults come from the environment. A tenant can override them, within instance bounds.

| Record | Default | Instance minimum |
| --- | --- | --- |
| Runs (`run`, `run_log`, payload objects) and flow runs (`flow_run`, `step_run`) | 30 days after finish | 1 day |
| Events | 30 days | 1 day |
| Webhook refusals, health checks | 7 days | 1 day |
| Audit | 400 days | 90 days |

The owner confirmed these defaults on 2026-11-14.

**Storage.** New table `retention_policy(tenant_id pk, runs_days, events_days, refusals_days, audit_days)`. Missing rows use the defaults.

**Pruner.** `kernel/retention.ts`, run every 10 minutes from `background.ts` under `pg_try_advisory_lock`, so only one replica prunes.
- Batches of 1,000 by `finished_at` / `created_at` per tenant, oldest first.
- Run deletion order: S3 payloads (collect refs, then delete), then `run_log`, then `run`.
- Flow runs: `step_run`, then `flow_run`, then their child runs.
- Never prunes a non-terminal run, nor a run referenced by a non-terminal flow run.

**Audit.**
- Migration: create `audit_entry` as a table partitioned by month on `created_at`, copy the rows, and recreate the append-only triggers on each partition.
- The pruner detaches partitions entirely older than the longest tenant audit policy. It first writes them to S3 as JSONL (`audit/<yyyy-mm>.jsonl.gz`), then drops them.
- Per-tenant shorter retention is honored at read time, filtered in the audit routes.
- Tenant deletion does not drop audit; partitions age out.

**Console.** Tenant → Settings gets a Retention section. The run list shows "History kept for 30 days".

**Indexes.** Add `(tenant_id, finished_at)` on `run` and `flow_run` if they are missing.

## Acceptance criteria

1. With `runs_days=1`, a finished run 2 days old and its logs and S3 payloads are gone after one pruner pass. A running run of the same age remains.
2. The pruner holds no lock longer than 2 s, measured on a seeded database of 1 M runs.
3. Two replicas never prune at once (advisory lock test).
4. Audit partitions older than the policy are exported to S3 and detached. UPDATE and DELETE on `audit_entry` still fail.
5. `docs/self-hosting.md` documents the policy, the export location and how to restore an exported partition.
6. The migration is locked (`pnpm lock:migrations`), and `pnpm check:migrations` passes.

## Dependencies and risks

- **Dependency:** none. The defaults are decided.
- **Risk: the audit partition migration on a large instance.** Run it as copy-then-swap in a maintenance window, documented in the upgrade notes.
