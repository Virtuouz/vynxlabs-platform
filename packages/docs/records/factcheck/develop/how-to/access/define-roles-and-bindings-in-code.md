# Fact-check: develop/how-to/access/define-roles-and-bindings-in-code

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| defineRole, defineBinding | `packages/sdk/src/index.ts:1310-1365` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| The code deploys: role, binding listed, tag From repository, no Remove | CLI run; `apps/console/src/screens/Access.tsx` | second agent, 2026-11-23 | holds; run with the built CLI |
| A missing principal or role is refused naming the path | CLI output | second agent, 2026-11-23 | corrected: the refusal names the problem, not the path |

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Role file and binding file shapes; role by `name`; deploy output. | `schemas/files/role.v1.schema.json`, `binding.v1.schema.json`; run on `walk4` | writer, 2026-11-24 | holds as run |
| A binding naming a role's path fails the build with the quoted text; an unknown role fails the upload; an unknown group refuses the deploy. | `packages/manifest/src/bundle-check.ts`; run on `walk4`, `walk5` | writer, 2026-11-24 | holds as run |
| A binding from a repository, file or code, has the tag **From repository** and no **Remove**. | `apps/console/src/screens/Apps.tsx:226`; `apps/control-plane/src/routes/permissions.ts:76` (`managedByResource`) | writer, 2026-11-24 | holds as read |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. The role and binding files validate against the schemas; the YAML repository and the TypeScript repository of the page each build; both together are refused as 'defined in src/index.ts and again in platform/...'.
