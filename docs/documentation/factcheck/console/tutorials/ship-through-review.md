# Fact-check record: console/tutorials/ship-through-review

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Create workspace: Name, Slug, Type, Promotes to; the type cannot be changed | `apps/console/src/screens/Tenant.tsx:409`, run | writer, run | holds |
| Add member: Email, Name, Initial password (12 characters), Roles | run | writer, run | holds |
| Deploy steps: Review draft, Deploy to dev, Promote | `apps/console/src/screens/Release.tsx:154` | writer, run | holds |
| Promote page: FROM/TO, WHAT CHANGES, BEFORE IT GOES, HOW DEV DIFFERS FROM LIVE, **Promote to production** | `apps/console/src/screens/Promotion.tsx` | writer, run | holds |
| **Request promotion of v…** for someone who may not promote | `Promotion.tsx:114` | writer, run | holds |
| `developer` role may not promote; `tenant_admin` may | role list, run | writer, run | holds (behavior seen; permission set not read) |
| Promotion requests are on the tenant overview with **Review**, **Decline…**, **Promote** | `apps/console/src/screens/Tenant.tsx`, run | writer, run | holds |
| Production's screen is **Versions** with **Roll back to this version** and **Deploy this version** | `Release.tsx`, run | writer, run | holds |
| Rolling back asks "Roll back Live to version 1?" and the button is **Roll back in production** | run | writer, run | holds |
| Promoting needs `promotion:write`; deploying `deployment:write` | `packages/manifest/src/permissions.ts:282` | writer | holds |
| Production numbers its versions apart from dev's | run (dev v2 became Live v1) | writer, run | holds |
