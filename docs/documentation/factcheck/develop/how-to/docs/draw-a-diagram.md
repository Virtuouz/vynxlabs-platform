# Fact-check record: develop/how-to/docs/draw-a-diagram.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A fenced block with language `mermaid` is a diagram; drawn in the site's own colors, again on a theme change. | docs/sdk-guide.md:334-346; packages/docs-site/src/script.ts:182-186 | writer, read in the code 2026-11-23 | holds as written |
| Preview in the editor and the Documentation page view draw it. | apps/console/src/screens/docs/DocEditor.tsx:579-581; Docs.tsx:1720-1722 | writer, read in the code 2026-11-23 | holds as written |
| Keys: + and =, -, 0 fit, arrows move 40; ⌘ or Ctrl and scroll zooms; drag moves. | apps/console/src/diagrams/draw.ts:300-395 | writer, read in the code 2026-11-23 | holds as written |
| Fetched only by a page that has a diagram; without script it is its source. | docs/sdk-guide.md:346; script.ts:182-186 | writer, read in the code 2026-11-23 | holds as written |
| `volvel dev` does not draw diagrams. | packages/cli/src/dev-site.ts:117-118 | writer, read in the code 2026-11-23 | holds as written |
