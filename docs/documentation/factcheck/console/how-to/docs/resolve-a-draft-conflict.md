# Fact-check record: console/how-to/docs/resolve-a-draft-conflict.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The banner text "Someone else saved this page after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." | apps/console/src/kit/DraftClash.tsx:61-64 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Buttons Copy what I wrote and Load their version; "Copied what you wrote." | kit/DraftClash.tsx:33-45 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Question "Load their version?", its text, buttons Load theirs and Cancel. | kit/DraftClash.tsx:46-52 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| After Load theirs the source holds their version and the banner is gone. | apps/console/src/screens/docs/DocEditor.tsx:525-536 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A save from an older revision is refused with 409 draft_changed; a draft is shared by everyone who may write the workspace. | apps/control-plane/src/kernel/authoring.ts:290-312 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| The save message "Saved as a draft. Deploy it from Documentation when it is ready." | D/DocEditor.tsx:133 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Compare with deployed shows the draft against what is deployed. | D/DocEditor.tsx:459-463, 612-627 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| The banner, its two buttons and the confirmation words. | DraftClash.tsx; writer's run | second agent, 2026-11-23 | holds; not re-run: Copy what I wrote (clipboard) |
