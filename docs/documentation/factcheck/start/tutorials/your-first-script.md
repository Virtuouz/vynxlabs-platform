# Fact-check record: start/tutorials/your-first-script

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; each row was also run (see the run log). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| **Create tenant** has Name, Slug and "Make me a member, as tenant admin", on by default | `apps/console/src/screens/Tenants.tsx:193` | writer, run 2026-11-23 | holds |
| A workspace is made from **Create workspace** with Name, Slug, Type, Promotes to; the type cannot be changed | `apps/console/src/screens/Tenant.tsx:409` and the dialog, run | writer, run | holds |
| A new workspace shows First steps with four steps | `e2e/first-run.spec.ts:70-78` | writer, run | holds |
| The starter "Total some numbers" and its text | `apps/console/src/screens/starters.ts:38` | writer, run | holds |
| Ctrl+Enter saves the draft and runs it in the **Test pane**; the button reads "Save and run" for an unsaved draft | `apps/console/src/screens/Authoring.tsx:787,1076` | writer, run | holds |
| Deploy shows Review draft and Deploy to dev, field **What changed**, button "Deploy N change(s)" | `apps/console/src/screens/Release.tsx:154,490`; `docs/Docs.tsx:606` | writer, run | holds |
| The script list shows Uses "Nothing outside" and Source CONSOLE | `apps/console/src/screens/Execution.tsx` (list), run | writer, run | holds |
| A run by hand shows "By hand" and the version | run page, run | writer, run | holds |
| First steps disappears when all four are done | `Overview.tsx`, run | writer, run | holds |
