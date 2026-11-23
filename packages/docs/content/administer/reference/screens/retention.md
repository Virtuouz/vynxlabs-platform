---
title: Retention
topic: tenant-retention
description: "Every control, state and permission of the Retention screen: the four periods, their defaults and bounds, and what shortening one removes."
subjects: [retention, audit]
moved_from:
  - tenant/retention
---

The **Retention** screen sets how long the tenant's history is kept, in days, one period for each kind. An empty field uses the instance's default. The screen is under **Tenant**, in the group **Governance**. F1 opens the help topic `tenant-retention`.

## Fields

Each field is labeled with the kind and "(days)", shows the instance's default as its placeholder ("30, the instance's default"), and says "Now N days" under it.

| Field | What it keeps | Default | Allowed |
| --- | --- | --- | --- |
| **Runs (days)** | Script and flow runs, with their logs, steps and inputs and outputs, after they end. | 30 | 1 to 3650 |
| **Events (days)** | Events published by scripts, flows and the API. | 30 | 1 to 3650 |
| **Refused requests (days)** | Webhook requests and SCIM pushes that were turned away. | 7 | 1 to 3650 |
| **Audit log (days)** | Who changed what. | 400 | 90 to 3650 |

The defaults are those of an instance that has not changed them. An instance sets its own with the settings `RETENTION_RUNS_DAYS`, `RETENTION_EVENTS_DAYS`, `RETENTION_REFUSALS_DAYS` and `RETENTION_AUDIT_DAYS`, and the placeholder and "Now" show what applies. A number outside the allowed range is refused at the field: "A whole number of days from 90 to 3650."

Finished tasks of Volvel itself (reading schemas, sending alerts, trying connections) are kept 7 days, and there is no field for that. No hold exists that keeps one run or entry past its period.

## Saving

The page is saved with the save bar. Making a period longer saves at once. Making any shorter asks first: the dialog "Keep this history for less time?" (or "Keep <kind> for less time?" for one) lists each kind as "Runs: from 30 days to 10." and says what goes:

| Kind | What the dialog says |
| --- | --- |
| Runs, events, refused requests | They are removed within minutes of saving, and cannot be brought back. |
| Audit log | Entries older than the new period stop showing at once, and are left out of the tenant's export. They are removed with their month, some time after, and then cannot be brought back. Until then, lengthening the period again shows them again. Files that rows replaced, or were deleted with, longer ago than the new period are deleted too. |

The confirming button is **Save and remove older history**. After saving: "Retention saved." **Discard** puts the numbers back. See [How retention and the audit log work](../../explanation/sso/how-retention-and-the-audit-log-work) for why the audit log leaves late.

## States

| State | What you see |
| --- | --- |
| Not loaded | The error state, with a retry. |
| Read only | "You can see how long this tenant's history is kept, not change it. It needs `tenant:write`." |

## Permissions

| Action | Needs |
| --- | --- |
| See the periods | `tenant:read` |
| Change them | `tenant:write`, or an operator's binding at the instance |

## Related

- [Audit log](audit-log)
- [Export](export): the audit log in a file is cut at its period.
