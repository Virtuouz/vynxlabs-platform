# Fact-check record: self-host/reference/console/branding

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title and description | `apps/console/src/screens/InstanceBranding.tsx:116` | writer, run | |
| Product name hint, max 60 | `apps/console/src/screens/InstanceBranding.tsx:128` | writer, run | |
| Product name API max 60, default Volvel | `apps/control-plane/src/routes/branding.ts:82` | writer, code | |
| No logo text | `apps/console/src/screens/InstanceBranding.tsx:149` | writer, run | |
| Logo help text | `apps/console/src/screens/InstanceBranding.tsx:165` | writer, run | |
| Logo refusals | `apps/console/src/screens/InstanceBranding.tsx:87` | writer, code | |
| Wrong type text | `apps/console/src/screens/InstanceBranding.tsx:83` | writer, code | |
| Logo replaced at once | `apps/console/src/screens/InstanceBranding.tsx:92` | writer, code | |
| Icons made in the browser; failure text | `apps/console/src/screens/InstanceBranding.tsx:98` | writer, code | |
| Remove logo confirmation | `apps/console/src/screens/InstanceBranding.tsx:139` | writer, code | |
| Token list: 27 tokens | `packages/manifest/src/kinds.ts:1608` | writer, run (counted 27) | |
| Placeholders kit default / same as light | `apps/console/src/screens/Branding.tsx:185` | writer, run | |
| Value pattern and forbidden words | `packages/manifest/src/kinds.ts:1676` | writer, code | |
| Production attention sentence | `apps/console/src/screens/InstanceBranding.tsx:177` | writer, run | |
| Clear back confirmation | `apps/console/src/screens/InstanceBranding.tsx:201` | writer, code | |
| Preview and contrast check texts | `apps/console/src/screens/Branding.tsx:288` | writer, run | |
| Contrast warns, saving allowed | `apps/console/src/screens/Branding.tsx:268` | writer, code | |
| Save toast | `apps/console/src/screens/InstanceBranding.tsx:69` | writer, code | |
| Branding is public; instance:write to save | `apps/control-plane/src/routes/branding.ts:71` | writer, code | |
| Audit actions | `apps/control-plane/src/routes/branding.ts:105` | writer, code | |
| Needs line | `apps/console/src/screens/InstanceBranding.tsx:30` | writer, code | |

Checked by: second agent, 2026-11-23. Instance http://localhost:8091 as the operator `admin@example.com`, Playwright headless: 1440 px light (text of every screen compared with the page), 390 px dark (no horizontal scroll on any instance screen; keyboard Tab order reaches the page's controls with a visible focus ring on each), and the controls named below. Tenants, members, a database and a database location made for the check were deleted afterwards (`instance-chk2`, `instance-chk3`, `inst-chk-db`, the throwaway database `instchk_loc`); the member `inst-chk@example.com` stays (a member cannot be deleted). Seen only (never changed: the instance's branding is not to be changed): title, description, **Product name** and its hint, "No logo: the mark is the name's initials.", **Upload a logo** and its hint, the Light and Dark token lists (27 tokens), the "Production is always marked in the attention color..." line. Saving, the contrast check, the logo upload and removal, and **Clear back to the console's values** were NOT run; their texts are from the code. No dark or 390 px problem found.
