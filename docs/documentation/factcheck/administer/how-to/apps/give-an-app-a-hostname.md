# Fact-check record: administer/how-to/apps/give-an-app-a-hostname.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add a hostname sheet: fields, texts, default workspace first, no apps hint. | `apps/console/src/screens/Domains.tsx:113-250` | writer, run on the instance 2026-11-23; second agent pending | holds as run (first workspace API docs; hint read) |
| Serves options and hint text. | `Domains.tsx:85-110` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Details sheet: three steps, record name `_vx-challenge.<host>`, value `vx-domain=…`, Copy buttons. | `Domains.tsx:300-440`; `routes/apps.ts` challengeOf | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Check now: texts for no record found, record found but not reached, Last checked. | `routes/apps.ts:896-912`; `Domains.tsx:340-365` | writer, run on the instance 2026-11-23; second agent pending | no-record text holds as run; found-but-unreached read |
| Enable refused with domain_not_verified text, and operator exception. | `routes/apps.ts:996-1004`; `Domains.tsx:30-37` | writer, run on the instance 2026-11-23; second agent pending | holds as run (text read in details sheet) |
| Disable asks "Turn off …?" with the quoted text; Remove asks with the quoted text. | `Domains.tsx:380-410` | writer, run on the instance 2026-11-23; second agent pending | holds as run (both dialogs read; Turn off cancelled on the seeded name) |
| Change what it serves. | `Domains.tsx:200-245`; `routes/apps.ts:1006-1030` | writer, run on the instance 2026-11-23; second agent pending | holds as run (Board to Desk) |
| Unique only while verified or enabled; refusal text. | `routes/apps.ts:851-867` | writer, read in code, not run; second agent pending | holds |
| Verified, record gone state. | `Domains.tsx:53-60,330-345` | writer, read in code, not run; second agent pending | holds; not run (needs a real record) |
| A verified, disabled name answers 404 with the quoted text; an unverified one opens the instance. | `front.ts:1450-1460`; `Domains.tsx:345-350` | writer, read in code, not run; second agent pending | holds |
| Changes reach other replicas within 30 s. | `kernel/apps/hosts.ts:29` | writer, read in code, not run; second agent pending | holds |
| Hostname rules and own-address refusal. | `routes/apps.ts:40,745-775` | writer, read in code, not run; second agent pending | holds |
| Needs domain:write. | `routes/apps.ts:724,748`; `Domains.tsx:interface` | writer, run on the instance 2026-11-23; second agent pending | holds |
| Rename carries hostnames; old address redirects 308. | `kernel/rename.ts:57`; `front.ts:873-888` | writer, read in code, not run; second agent pending | holds |
