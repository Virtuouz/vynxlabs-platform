---
title: How retention and the audit log work
description: "What the audit log records, why an entry cannot be changed or deleted by a person, how a shorter period hides entries at once and removes them later, and what the period also decides."
subjects: [audit, retention]
---

A tenant keeps two kinds of history: what its scripts and flows did, and what people did to the tenant. Both are kept for a time and then removed. This page says how, because the two are not treated the same.

## The audit log

Every change to a tenant, and every request an operator made into it under an access grant, is written to the audit log as part of the same step that made the change. If the change is undone, so is the entry. An entry has a time, who did it, an action such as `member.created`, what it was done to, and what else was recorded: the address it came from and the request's ID.

A person cannot change or delete an entry on the screen: it has no control for it. An entry leaves when retention removes it. The instance has its own log, for what belongs to no tenant, and it also holds the entries of tenants that were deleted.

## The periods

Retention is a number of days for each kind: runs, events, refused requests and the audit log. A tenant sets its own, or leaves a field empty to take the instance's default. Each has a range, and the audit log's smallest is 90 days, because an audit log that can be cut to a day would not be one.

Runs, events and refused requests go within minutes of passing their period. There is no hold that keeps one run or one entry past its period.

## Why the audit log goes late

Shortening the audit log's period does two things. At once, entries older than the new period stop showing in the console and are left out of the tenant's export. Later, they are removed. The delay is deliberate: the log is stored in months, and a month is exported whole to the instance's object store before it is removed, so that the operator keeps what they need to. A month goes when all of it is older than the longest audit period of the instance's default and of every tenant. Until then, if you lengthen the period again, the entries show again. After, they cannot be brought back.

The period also decides how long a file stays after a row replaced it, or after the row was deleted: a replaced or removed file is kept for as long as the audit log is kept, and is then removed.

## What is left to others

Volvel does not keep legal holds. If you must keep a record longer than its period, export the tenant, or download the audit log as CSV, before the period passes. See [Export a tenant](../../how-to/sso/export-a-tenant).

## How it fits

The screens are [Retention](../../reference/screens/retention) and [Audit log](../../reference/screens/audit-log). To find an entry, see [Find an entry in the audit log](../../how-to/sso/find-an-audit-entry).
