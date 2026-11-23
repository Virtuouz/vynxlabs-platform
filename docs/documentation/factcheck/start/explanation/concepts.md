# Fact-check record: start/explanation/concepts.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, 1440 px, light, as Maya Brooks (member) or the operator admin where said.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| An operator makes tenants, sees the Instance screens, and can pause every trigger. | `apps/control-plane/src/routes/tenants.ts:246`; `nav.ts:224`; `screens/Overview.tsx:430-445` | writer | holds |
| An operator enters a tenant by being a member or by an access grant with a reason that ends and is visible to admins. | `screens/Tenant.tsx:122-130,285-295` | writer | holds |
| Nobody makes their own account. | `kernel/auth.ts:38,86` (`disableSignUp`) | writer | holds |
| No MFA or passkeys. | grep of `apps/console/src` and `kernel/auth.ts` | writer | holds |
| Dev and production kinds; production changes by deploy or promotion. | `kernel/authoring.ts:75-130` | writer | holds |
| A draft is saved and not live until deployed; deploy produces a numbered version. | `kernel/authoring.ts:78`; `routes/summary.ts:228` | writer | holds |
| Promotion sends the same bundle to the linked workspace. | `kernel/execution/deploy.ts` (`promotedFrom`); `routes/summary.ts` (same by digest) | writer | holds |
| Triggers: schedule, webhook, form, event, poll. | `screens/Overview.tsx:35-41` (icons: schedule, webhook, event, form, manual) | writer | the word "poll" comes from the style guide's definition; "manual" is also a kind in the console |
| Roles are sets of permissions; a binding grants a role at a tenant, workspace or resource. | `kit/Can.tsx:20-50` | writer | holds |
| Term ids kept: tenant, workspace, dev-workspace, production-workspace, resource, deploy, draft, promotion, bundle, run, binding, member, end-user. | the file's frontmatter | writer | holds |
