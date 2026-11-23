# Fact-check record: self-host/reference/console/tenants

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Screen title Tenants; operator description text | `apps/console/src/screens/Tenants.tsx:35` | writer, run | |
| Non-operator description 'The organizations you belong to.' | `apps/console/src/screens/Tenants.tsx:36` | writer, code | |
| Opening / returns to the last place | `apps/console/src/App.tsx:101` | writer, run | |
| Filter Tables kept in, Anywhere, kept in the address as location, '(not registered)' | `apps/console/src/screens/Tenants.tsx:45` | writer, code | |
| Filter shown only when a location exists | `apps/console/src/screens/Tenants.tsx:39` | writer, run (not shown with none, shown with one) | |
| Columns Name, Slug, Workspaces, You, Tables kept in, Created | `apps/console/src/screens/Tenants.tsx:76` | writer, run | |
| You column: Member / Through a grant | `apps/console/src/screens/Tenants.tsx:87` | writer, run | |
| Slug under the name on a phone | `apps/console/src/screens/Tenants.tsx:70` | writer, code | |
| Inspector fields Slug, Workspaces, Your access, Tables kept in, Created, ID | `apps/console/src/screens/Tenants.tsx:122` | writer, run | |
| Your access words | `apps/console/src/screens/Tenants.tsx:125` | writer, run | |
| Inspector footer: Open, Rename, console-code, Delete (operators) | `apps/console/src/screens/Tenants.tsx:157` | writer, run | |
| Workers panel states and button labels | `apps/console/src/screens/TenantPowers.tsx:69` | writer, run | |
| Locked-off text for the workers panel | `apps/console/src/screens/TenantPowers.tsx:59` | writer, code | |
| Toasts of the workers switch | `apps/console/src/screens/TenantPowers.tsx:36` | writer, code | |
| History kept text and Change how long | `apps/console/src/screens/TenantPowers.tsx:89` | writer, run | |
| Retention sheet title and description | `apps/console/src/screens/TenantPowers.tsx:103` | writer, code | |
| Retention fields '<label> (days)' | `apps/console/src/screens/Retention.tsx:54` | writer, code | |
| Retention bounds 1-3650, audit 90 | `apps/control-plane/src/config.ts:141` | writer, code | |
| Rename dialog texts and result toast | `apps/console/src/screens/Environments.tsx:302` | writer, code | |
| Rename drawn only when mayRename is not false | `apps/console/src/screens/Environments.tsx:1589` | writer, run (absent for Fernhill, present for a tenant the operator is in) | |
| mayRename is tenant:write checked in the tenant | `apps/control-plane/src/routes/tenants.ts:228` | writer, run | |
| API PATCH accepts an operator at the instance (tenantOrInstance) | `apps/control-plane/src/routes/tenants.ts:405` | writer, run (PATCH 200 on a tenant with no grant) | |
| Console-code confirmation text | `apps/console/src/screens/Environments.tsx:1641` | writer, code | |
| Console-code switch hidden if consoleCode undefined or mayRename false | `apps/console/src/screens/Environments.tsx:1629` | writer, run | |
| Create tenant fields and hints | `apps/console/src/screens/Tenants.tsx:193` | writer, run | |
| Slug pattern, max 63; Name 1-200 | `apps/control-plane/src/routes/shared.ts:13` | writer, run (Bad Slug refused) | |
| Field refusal 'Use only lowercase letters, digits and hyphens.' | `apps/console/src/api.ts:31` | writer, run | |
| Create tenant needs tenant:write at the instance | `apps/control-plane/src/routes/tenants.ts:143` | writer, code | |
| After create: toast 'Tenant NAME is made.' with link Open NAME, tenant opens | `apps/console/src/screens/Tenants.tsx:211` | writer, run | |
| addCreator ignored for a non-member caller | `apps/control-plane/src/routes/tenants.ts:274` | writer, code | |
| List page size 50, Load more line | `apps/console/src/kit/paged.tsx:198` | writer, code | |
| Empty and filter-empty texts | `apps/console/src/screens/Tenants.tsx:103` | writer, code | |
| Delete dialog text, type the slug, Delete tenant | `apps/console/src/screens/Environments.tsx:1683` | writer, run | |
| Delete refused while runs are in progress, text | `apps/control-plane/src/kernel/tenancy/remove.ts:29` | writer, code | |
| Second confirmation text and Delete anyway | `apps/console/src/screens/Environments.tsx:1698` | writer, run | |
| tablesLeftBehind recorded as tablesLeftIn and schemas | `apps/control-plane/src/kernel/tenancy/remove.ts:188` | writer, run | |
| Second question only when the tenant has workspaces (nothing to drop otherwise) | `apps/control-plane/src/kernel/tenancy/remove.ts:36` | writer, run (a tenant with no workspace deleted without it) | |
| Delete: audit entries stay, accounts stay, files removed after commit | `apps/control-plane/src/routes/environments.ts:308` | writer, code | |
| Delete is an instance tenant:write action | `apps/control-plane/src/routes/environments.ts:300` | writer, code | |
| Deleted tenants' entries are in the instance log | `apps/control-plane/src/routes/identity.ts:1297` | writer, run | |
| Read-only strip words and disabled dialog button | `apps/console/src/kit/ReadOnly.tsx:10` | writer, code | |
| Not an operator: For operators | `apps/console/src/screens/NotFound.tsx:31` | writer, code | |

Checked by: second agent, 2026-11-23. Instance http://localhost:8091 as the operator `admin@example.com`, Playwright headless: 1440 px light (text of every screen compared with the page), 390 px dark (no horizontal scroll on any instance screen; keyboard Tab order reaches the page's controls with a visible focus ring on each), and the controls named below. Tenants, members, a database and a database location made for the check were deleted afterwards (`instance-chk2`, `instance-chk3`, `inst-chk-db`, the throwaway database `instchk_loc`); the member `inst-chk@example.com` stays (a member cannot be deleted). Run: **Create tenant** dialog (labels and hints as the page), inspector fields (exact words), **Rename** (dialog text, result "OLD is now called NEW."), **Turn off / Turn on code in the console** (both dialogs and results, now on the page), **Workers the instance starts** both states, **Change how long** sheet, **Delete** (dialog, type the slug), the "You" column. Corrected: "Your access" for a non-member reads "Not a member. Inside it you work through an operator access grant, which needs a reason" (`Tenants.tsx:125`); the first-visit description now folded behind **About Tenants** (`kit/PageHeader.tsx:158-165, 215-240`). fault: instance (You column says "Through a grant" when no grant is open); fault: instance (Rename and the console-code switch hidden for a tenant the operator is not in); fault: instance ("Delete anyway" dialog has no full stop between the database error and the next sentence).
