# Fact-check record: start/explanation/basics/what-you-may-do.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks (or the operator admin where said), 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A permission at the tenant counts in every workspace; at a workspace, there alone; on a resource, for it. | `kit/Can.tsx:30-80,100-130` | writer | holds |
| The line "You can see {what}, not change it. It needs {permission}. {ask}". | `kit/Can.tsx:150-166` | writer | holds |
| The ask text in a tenant and under Instance. | `api.ts:7-15` | writer | holds |
| A gray button's tooltip "It needs {permission}…". | `kit/Can.tsx:230-240` | writer | holds |
| A refusal that names a permission gets the ask text. | `api.ts:96` | writer | holds |
| Counts you may not read are said, not 0. | `screens/Overview.tsx:186-196,420-445`; `apps/control-plane/src/routes/summary.ts` | writer | holds |
| A person with only a grant inside has no section list. | `Shell.tsx:166-180` (`onlyInside`) | writer | holds |
| Production editors read only; App Builder words; server refusal words. | `screens/builder/ReadOnly.tsx:34`; `apps/control-plane/src/kernel/authoring.ts:75-76` | writer | holds |
| Read-only instance strip. | `kit/ReadOnly.tsx:9-31` | writer | holds |
| For operators screen. | `screens/NotFound.tsx`; run | writer, run | holds as run |
| What I may do here: own member page; description text. | `Shell.tsx:681-690`; run | writer, run | holds as run |
| An API key has its member's permissions. | `screens/Account.tsx` (key panel text) | writer | holds |
| The server decides again on each request. | `kit/Can.tsx:35-45` (comment) | writer | holds |
