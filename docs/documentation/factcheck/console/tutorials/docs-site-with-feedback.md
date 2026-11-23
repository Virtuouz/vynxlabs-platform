# Fact-check record: console/tutorials/docs-site-with-feedback

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" for the rows below: second agent, 2026-11-24.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Documentation is under Build; sites are marked **Site** | `apps/console/src/nav.ts:125-127`, `screens/docs/Docs.tsx`, run | writer, run | holds |
| The site menu: Turn on page feedback…, New page here, etc. | `Docs.tsx:506-545`, run | writer, run | holds |
| Dialog text for feedback, both branches, button **Make the table and turn it on** / **Turn it on** | `Docs.tsx:1356-1430` | writer | "already keeps" branch run; first-site branch read only |
| A draft change appears as "Deploy N change(s)", dialog "Readers see them at once. Nothing but documentation is deployed." | `Docs.tsx:606`, run | writer, run | holds |
| New page row: Page title, File name, Type, Save | run | writer, run | holds |
| Question "Was this page helpful?" with Yes/No; "Thank you for saying." | `packages/docs-site/src/render.ts:418-428` | writer, run | holds |
| Answers go to `docs-feedback` with site_key, site, page, helpful, version, at | `packages/docs-engine/src/workspace.ts` (FEEDBACK_COLUMNS), run | writer, run | holds |
| No name or address kept (dialog text) | `Docs.tsx:1411` | writer | holds (text only) |
| The site's home page shows no question | run | writer, run | observed; reason not read |
| A doc writer may deploy documentation | run (Sam deployed) | writer, run | holds |
| Steps 1-4 as Sam: Documentation list, menus, the dialog texts of **Turn on page feedback…** ("already keeps" branch; button **Turn it on**), **New page here** row, file name `swap-a-shift`, "No problems / This page would deploy as it is." | instance walk | second agent, run | holds |
| The how-to template is `## Do the thing`, `## Before you start`, `:::steps`, `## The result`, `## If it does not work` | instance walk; `diataxis.ts` | second agent, run | corrected: page said `## Goal` |
| Steps 6-7: the served page ends "Was this page helpful?" Yes / No; the site's home page now asks too | instance walk (rota-site, deployed earlier) | second agent, run | corrected: page said the home page has no question. fault fixed (fe) |
| Step 5 **Deploy** as Sam is refused: "This needs the deployment:write permission" while any app removal is drafted in the workspace (`removedApps` counts an App Builder app, here `tut-visits`) | instance walk; `kernel/docs/working.ts:83`, `routes/authoring.ts:1149-1165` | second agent, run | fault: docs Deploy of a doc writer refused by another kind's removal. Steps 5-9 not rerun; the writer's run of them stands |
| Steps 8-9 (Maya sees the row; the supplies site's dialog) | writer's run | writer | not rerun, see above |

Checked by: second agent, 2026-11-24.
