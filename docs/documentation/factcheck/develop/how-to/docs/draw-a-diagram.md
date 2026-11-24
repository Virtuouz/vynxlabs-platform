# Fact-check record: develop/how-to/docs/draw-a-diagram.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A fenced block with language `mermaid` is a diagram; drawn in the site's own colors, again on a theme change. | docs/sdk-guide.md:334-346; packages/docs-site/src/script.ts:182-186 | writer, read in the code 2026-11-23 | holds as written |
| Preview in the editor and the Documentation page view draw it. | apps/console/src/screens/docs/DocEditor.tsx:579-581; Docs.tsx:1720-1722 | writer, read in the code 2026-11-23 | holds as written |
| Keys: + and =, -, 0 fit, arrows move 40; ⌘ or Ctrl and scroll zooms; drag moves. | apps/console/src/diagrams/draw.ts:300-395 | writer, read in the code 2026-11-23 | holds as written |
| Fetched only by a page that has a diagram; without script it is its source. | docs/sdk-guide.md:346; script.ts:182-186 | writer, read in the code 2026-11-23 | holds as written |
| `volvel dev` does not draw diagrams. | packages/cli/src/dev-site.ts:117-118 | writer, read in the code 2026-11-23 | holds as written |

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| Keys + = - 0, arrows (40), Ctrl+wheel, drag, double-click, buttons Zoom in, Zoom out, Fit the diagram, and "Use Ctrl + scroll to zoom" on a plain wheel. | apps/console/src/diagrams/draw.ts:134-460; run on a served page at 1440 and at 390 dark (the transform changed by each key) | second agent, 2026-11-23 | corrected: double-click, the three buttons and the hint were missing |
| "This diagram does not read: …" for a wrong block. | draw.ts; run in the editor preview | second agent, 2026-11-23 | added |
| The drawing code is fetched only by a page with a diagram. | script.ts:182-186 | second agent, 2026-11-23 | holds |
