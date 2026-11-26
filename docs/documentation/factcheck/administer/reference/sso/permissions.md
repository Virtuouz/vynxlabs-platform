# Fact-check record: administer/reference/sso/permissions

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| sso, portal, domain, worker, audit verbs | `packages/manifest/src/permissions.ts:180` | second agent, code, 2026-11-23 | holds |
| export:write | `packages/manifest/src/permissions.ts:67` | second agent, code, 2026-11-23 | holds |
| default role needs binding:write; group mapping needs group:write | `apps/control-plane/src/routes/sso.ts:278` | second agent, code, 2026-11-23 | holds |
| Can notice words | `apps/console/src/kit/Can.tsx:187` | second agent, code, 2026-11-23 | holds |
| `sso:write` can change a provider's issuer, and the provider's proved domains stay | `apps/control-plane/src/routes/sso.ts:321` (patch needs `sso:write`, `:227-228`); `kernel/sso/providers.ts:564-651` (only the links are removed on an issuer change, `identity_domain` is not touched) | writer, code, 2026-11-26 | holds |
| A sign-in through that provider takes the member whose email is in a proved domain; a verified-email answer is refused only when it says false; a member with instance access is refused | `kernel/sso/people.ts:76-135` (domain test `:95`, existing member `:106-111`), `:166`, `:283-290` | writer, code, 2026-11-26 | holds |
| A domain of members belongs to one provider (so the existing provider is the one to edit) | `kernel/sso/providers.ts:838-845` (`domainTaken`) | writer, code, 2026-11-26 | holds |
| `sso:write` makes a provisioning token; a push creates members only in proved domains; members with instance access are refused | `apps/control-plane/src/routes/scim.ts:110-111`, `:312-340`; `kernel/sso/scim.ts:663-700` | writer, code, 2026-11-26 | holds |
| A pushed group lands in the group an existing mapping names; saving a new mapping needs `group:write` and `binding:write` | `kernel/sso/scim.ts:975-989` (`identity_group_map` by `claim_value`), `:1205-1225`; `routes/sso.ts:278` | writer, code, 2026-11-26 | holds; not run |
| The permissions reference row for `sso:write` carries the warning | `packages/docs/generators/reference.mjs` (`MORE_THAN_THE_NAME`); `pnpm docs:check` output | writer, run, 2026-11-26 | holds |
