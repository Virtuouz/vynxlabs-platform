# Walk: w-instance (phase 29)

Instance localhost:8091, operator. Own data: tenant "w-instance walk one" (deleted at the end), member w-instance-m1@example.test (disabled). Shots: ~/.local/share/volvel-walk/shots29/w-instance/.

## Walked and right (1440/768/390, light/dark, keyboard, reload; no page overflow anywhere)
- Health: ready, key fingerprints, settings, metrics; Check again by Enter; reload.
- D17 code button: overview and Tenants inspector; confirm by keyboard, Esc returns focus, confirm flips to "Turn on", survives reload.
- INS-MP7: workers off/on from the inspector, retention sheet, shorten confirm ("Keep runs for less time?"), Esc focus.
- INS-MP9/12/15: location inspector and Edit (390 dialog, reload keeps item), "Show them in the tenant list" filters; registering the platform's own database is refused naming the cause.
- INS-MP11: upload, reload, "Uploads that wait", Open, Throw away (confirm, focus ok, gone after reload).
- INS-27: own row "You cannot disable your own account."; Operators "Remove yourself" confirm text; stale second Disable gives no error and one member.disabled entry.
- INS-28: entry link (?entry=, opens on reload), CSV 200, "Deleted tenant" tag on a deleted tenant's entries.

## Wrong
1. Reload on All tenants (URL "/") leaves the list for the last place, losing the "Tables kept in" filter and search; the fix write-up says reload keeps the filter. 1440 light, shot tenants-by-location-1440-light.png. Cause: App.tsx:92 (useReopenLastPlace) with :175.
2. Import check contradicts itself for a tenant already here: "This tenant is on this instance already" (red) beside "Its slug is free here" (green). 390 dark, import-opened-390-dark.png. Cause: kernel/tenancy/import.ts:309 (`one.id !== manifest.tenant.id`).
3. Health "Check again": after Enter, focus drops to the page start. 1440 light. Cause likely screens/InstanceHealth.tsx (button remounted while loading); not confirmed.
4. All members: emails cut with an ellipsis at 1440 and 390, no full text reachable (no title). members-1440-light.png. Cause: span.truncate in screens/Instance.tsx.
5. Minor: audit rows of a tenant show the raw ID, not its name, after deletion (audit-tenant-1440-dark.png); CSV times are UTC while the console shows local with no zone; "Member disabled" wears the red DELETE tag.

## Not walked
Read-only strip, database down, second key/rekey, run `instance triggers` CLI, the Instance > Keys screens beyond Health's Master key; two-replica upload; Edit save (only opened, to leave cdrloc alone).
