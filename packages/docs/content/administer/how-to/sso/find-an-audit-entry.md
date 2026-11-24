---
title: Find an entry in the audit log
description: "Find who changed what and when in a tenant's audit log by searching, narrowing by area, time and person, open the entry, share a link to it, and download the result as CSV."
subjects: [audit]
---

## Find an entry in the audit log

By the end you have found the entry for a change, read what it recorded, and, if you need it, kept a file of the entries that match.

## Before you start

- You hold `audit:read` on the tenant. A tenant admin has it.
- What you know of the change: a name, an email, a hostname, roughly when, or who.

## Steps

:::steps
1. Open **Tenant**, then **Audit log**. The newest entries are first.
2. Type in **Search**. It finds an entry by its action, the ID or kind of what it was done to, and by the names, emails and hostnames of what it was done to and of who did it. "Acme Keycloak" finds the entries about a provider of that name.
3. Narrow it with **Area** (for example **Members and sign-ins** or **Hostnames**), **Since** (**Last 24 hours**, **Last 7 days**, **Last 30 days**, or **Between dates** with a **From date** and a **To date**) and **Workspace**.
4. Press **More filters** to choose **Who**, **Action** or **Done to**. Each list is made from the entries in the range chosen, and shows how many each has.
5. Choose a row. **Entry details** opens with **When**, **Who**, **Action**, **Kind**, **Name**, **ID**, **From**, **Request** and **Details**, the rest of what was recorded.
6. To see every change to the same thing, press **Everything about this**. To go back, press **Show everything**.
7. To send someone the entry, press **Copy a link to it**. "Link to the entry copied." The link opens the same view and entry for anyone who may read the log.
8. To keep the list, press **CSV**. The file `audit-log.csv` has the entries that match the filters, up to 100,000, with their times in UTC.
:::

::screenshot{name=administer/sso-audit-filters alt="The Audit log with its search box, area, since and workspace lists, More filters open, and the entry details beside the list."}

## Reading an entry

An action reads `area.thing`: `identity_provider.tested` is an identity provider that was tried. The tag beside it, **Create**, **Update**, **Delete**, **Execute** or **Read**, is read from how the action ends. **Operator** marks something an operator of the instance did under an access grant. The strings an action can have are in the [audit actions](../../reference/audit-actions).

A refused sign-in is `sso.refused`, and its **Details** has the reason and a message for the administrator. See [Why a sign-in is refused](../../reference/sso/refusals).

## The result

You have the entry and its details on the screen, a link to it, or a file.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| "Nothing recorded yet" or an empty list | The filters match nothing. Clear them. Entries older than the tenant's audit [retention](../../reference/screens/retention) are not shown. |
| "The end date is before the start date." | Fix the **To date**. |
| An entry you expected is missing | The log's period was shortened, which hides older entries at once, or the action is in another area. Search for the name instead of choosing an area. |
| The CSV has fewer rows than the list | The file is cut at 100,000 rows. Narrow the filters and download again. |
