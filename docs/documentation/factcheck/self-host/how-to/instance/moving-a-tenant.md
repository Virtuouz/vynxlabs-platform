# Fact-check record: self-host/how-to/instance/moving-a-tenant

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Export screen: passphrase twice, at least 12, history choice, Export tenant, file name SLUG-DATE.tar | `apps/console/src/screens/Environments.tsx:802` | writer, run | |
| History hint | `apps/console/src/screens/Environments.tsx:844` | writer, run | |
| CLI export flags and env passphrase | `packages/cli/src/cli.ts:802` | writer, code | |
| Export needs export:write in the tenant | `apps/control-plane/src/routes/portability.ts:38` | writer, code | |
| Import needs tenant:write at the instance | `apps/control-plane/src/routes/portability.ts:168` | writer, code | |
| Same migration level; refusal text | `apps/console/src/screens/Environments.tsx:1400` | writer, code | |
| Already here refusal; import disabled | `apps/control-plane/src/kernel/tenancy/import.ts:367` | writer, run | |
| Check lines | `apps/console/src/screens/Environments.tsx:1423` | writer, run | |
| Slug taken refusal | `apps/control-plane/src/kernel/tenancy/import.ts:368` | writer, code | |
| Passphrase refusal | `apps/control-plane/src/kernel/tenancy/import.ts:355` | writer, code | |
| Not a tenant export / damaged | `apps/control-plane/src/kernel/tenancy/import.ts:82` | writer, code | |
| Staged_elsewhere text | `apps/console/src/screens/Environments.tsx:1228` | writer, code | |
| 413 text and 50 GiB | `apps/control-plane/src/routes/portability.ts:24` | writer, code | |
| Unregistered location refused | `apps/control-plane/src/kernel/tenancy/import.ts:377` | writer, code | |
| Result notice and Open the tenant | `apps/console/src/screens/Environments.tsx:1303` | writer, run | |
| Triggers paused, git sync paused, providers paused, domains unproved | `apps/control-plane/src/kernel/tenancy/import.ts:857` | writer, code | |
| Members: kept by ID/email, passwords sealed | `apps/control-plane/src/kernel/tenancy/import.ts:50` | writer, code | |
| Export never carries API keys and worker credentials | `apps/control-plane/src/kernel/tenancy/export.ts:17` | writer, run | |
| tenant.imported and tenant_import.staged entries | `apps/control-plane/src/routes/portability.ts:359` | writer, run | |
| Same IDs after import | `apps/control-plane/src/kernel/tenancy/import.ts:380` | writer, run (the tenant's ID is the same in tenant.exported and tenant.imported entries) | |
| CLI import flags --slug --location | `packages/cli/src/cli.ts:880` | writer, code | |
| Throw it away removes the file | `apps/console/src/screens/Environments.tsx:1512` | writer, run | |
