# Fact-check: develop/how-to/access/define-roles-and-bindings-in-code

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| defineRole, defineBinding | `packages/sdk/src/index.ts:1310-1365` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| The code deploys: role, binding listed, tag From repository, no Remove | CLI run; `apps/console/src/screens/Access.tsx` | second agent, 2026-11-23 | holds; run with the built CLI |
| A missing principal or role is refused naming the path | CLI output | second agent, 2026-11-23 | corrected: the refusal names the problem, not the path |
