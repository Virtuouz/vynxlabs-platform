# Fact-check record: console/tutorials/docs-site-with-feedback

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" is left for the second agent.

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
