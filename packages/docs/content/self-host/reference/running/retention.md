---
title: Retention and the audit log
description: "How long runs, events, refused requests and audit entries are kept, the bounds of each, and how archived audit months are stored and read back."
subjects: [backup]
---

History is removed once it is older than its period. A pass runs every ten minutes, on one replica at a time, and removes a little at a time in small batches.

## Periods

| Kind | Default | Variable | Shortest | Longest |
| --- | --- | --- | --- | --- |
| Runs: script runs and flow runs, after they end, with their logs, steps and stored inputs and outputs | 30 days | `RETENTION_RUNS_DAYS` | 1 | 3650 |
| Events | 30 days | `RETENTION_EVENTS_DAYS` | 1 | 3650 |
| Refused webhook requests and SCIM pushes | 7 days | `RETENTION_REFUSALS_DAYS` | 1 | 3650 |
| The audit log | 400 days | `RETENTION_AUDIT_DAYS` | 90 | 3650 |

A value outside its bounds is refused when the instance starts. A tenant's admins can set the tenant's own periods under Retention, within the same bounds. A flow run is removed whole, with everything it started, once all of it has ended and its top run is past the period. A run still going is not removed.

## The audit log

The audit log is kept a month to a partition (`audit_entry_y2026m11`). A month is removed only when it is older than every tenant's period, and only after it is exported to the object store:

```text
audit/2025-07/manifest.json          rows, parts, and the sha256 of each part
audit/2025-07/part-0001.jsonl.gz     up to 50,000 entries, one JSON object a line
```

A tenant with a shorter period sees no further back in its log or its export, though the month is kept for others. Deleting a tenant does not delete its entries: they leave with their months. Entries cannot be changed or deleted one by one.

The instance's audit entries can be exported as CSV with `GET /api/v1/audit-export` (needs `audit:read` at the instance), and the screen is [the instance audit log](../console/audit-log).

## Reading an archived month

To read an exported month back as a table beside the log, copy its files from the bucket, then load the lines. The commands were not run for this page.

```bash
aws s3 cp --recursive s3://<bucket>/audit/2025-07/ ./audit-2025-07/
gunzip -c ./audit-2025-07/part-*.jsonl.gz > audit-2025-07.jsonl
psql "$DATABASE_URL" <<'SQL'
create table audit_restored_2025_07 (like audit_entry);
create temporary table lines (line jsonb);
\copy lines from 'audit-2025-07.jsonl' with (format csv, quote e'\x01', delimiter e'\x02')
insert into audit_restored_2025_07 select (jsonb_populate_record(null::audit_entry, line)).* from lines;
SQL
```

Compare the row count with `manifest.json`. A restored table is not part of the log and is not removed by a pass: drop it when done.

Related: [Settings](../settings), [Back up an instance](../../how-to/running/back-up-an-instance).
