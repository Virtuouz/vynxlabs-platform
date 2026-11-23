# Fact-check record: develop/reference/documentation/links-pictures-and-moved-pages.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Link forms and what each resolves to; `.md` optional; folder means index; `../index` is home. | packages/docs-engine/src/set.ts:165-198 | writer, read in the code 2026-11-23 | holds as written |
| Topic links `topic:<id>#anchor`; unknown topic is topic_unknown. | packages/markup/src/links.ts:30-43; set.ts:240-251 | writer, read in the code 2026-11-23 | holds as written |
| Refused links: other schemes, empty, `//`, `\`. | packages/markup/src/links.ts:9-27 | writer, read in the code 2026-11-23 | holds as written |
| Messages "leads nowhere", "leads out of the documentation", "names a heading … does not have". | set.ts:242-261 | writer, read in the code 2026-11-23 | holds as written |
| Heading ids are slugs; a repeat gets `-1`. | docs/documentation/inventory/docs-system.md section B (Headings); packages/markup | writer, read in the code 2026-11-23 | holds as written |
| Pictures: relative file checked (image_missing text), https allowed, other refused. | set.ts:263-272; links.ts:45-50 | writer, read in the code 2026-11-23 | holds as written |
| Picture file extensions png jpg jpeg gif webp avif svg. | packages/cli/src/build.ts:96 | writer, read in the code 2026-11-23 | holds as written |
| The preview shows the deployed app's pictures. | apps/control-plane/src/kernel/apps/front.ts:1362-1377 | writer, read in the code 2026-11-23 | holds as written |
| 90-day permanent redirect after a deployed rename; none in the preview. | front.ts:1290-1306; docs/documentation/fixed/p30-m4.md | writer, read in the code 2026-11-23 | holds as written |
| `key` and `moved_from` fields and limits (20); a copy takes no key. | packages/docs-engine/src/schema.ts:73-80, 157-165; ops.ts:503-545 | writer, read in the code 2026-11-23 | holds as written |
| moved_from errors moved_from_self, moved_from_exists, moved_from_duplicate. | set.ts:480-510 | writer, read in the code 2026-11-23 | holds as written |
| A live docs app does not read moved_from (no use in apps/control-plane or docs-site render); it feeds the manifest and the export. | grep of `redirectedPath|\.redirects` finds only packages/docs-engine/src/{package,output,redirects}.ts, docs-site/src/export.ts and HelpPanel.tsx | writer, read in the code 2026-11-23 | holds as written |
