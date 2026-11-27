# Fact-check record: console/reference/screens/build/flow-editor

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Header controls and labels; Deploy menu This change only / Review all drafts | FlowEditor.tsx:2350-2490; kit/DeployMenu.tsx:100-130 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Save-state texts; retry 1.5, 3, 6, 12 s; five failures | FlowEditor.tsx:1692-1706; kit/retry.ts | second agent, 2026-11-23 | checked: labels matched against the console source |
| Add-step groups and labels | FlowEditor.tsx:128-245 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Starters Started by hand, Decide then answer | apps/console/src/screens/starters.ts:96-140 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Notices for repository and removed flows | FlowEditor.tsx:2505-2545 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Rename keeps address via key and its message | FlowEditor.tsx:1185-1230 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Test panel labels, Build with all drafts, Last test, Test from | FlowTestPanel.tsx:30-230 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Test permissions | apps/control-plane/src/routes/authoring.ts:1276-1284 | second agent, 2026-11-23 | checked: labels matched against the console source |

| Undo holds 100 steps; typing in one field within 1 s is one step | apps/console/src/kit/history.ts:4-6 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Shortcuts Mod+D, Mod+C/X/V, Mod+Z, Shift+Mod+Z or Ctrl+Y, Mod+S, F1 or Mod+/, Shift+F10 | apps/console/src/kit/shortcuts.ts:32,81,89-105 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Zoom 0.2 to 1.5; Fit never smaller than 0.7 | FlowEditor.tsx:367,1874-1875 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Minimap hidden under 640 px (max-sm) and while testing | FlowEditor.tsx:1882-1883 | second agent, 2026-11-23 | checked: labels matched against the console source |
| To fix lists problems of the build's graph check; one fault at a time | FlowEditor.tsx:514 (manifestProblems), 2548-2575 | second agent, 2026-11-23 | checked: labels matched against the console source |
| 200 steps, 1000 edges | schemas/kinds/flow.v1.schema.json:20,833 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Run: a test was driven in the browser; panel showed Build with all drafts, As JSON, Run again, Open the run, the steps with times, Last test, Test from set | packages/docs/records/runs/console/how-to/flows/test-a-flow.md | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- State pill words: **Draft**, **Deployed**, **From the repository**, **Removing** (kit/status.tsx:79-82; FlowEditor.tsx:2352-2365); corrected from "draft, deployed, repository". Test panel shows the output with a **Copy** button and no "Output of" label (confirmed on the instance and in the run log); corrected. Walked at 390 px light and dark: no sideways scroll; the Test panel sits under the canvas.
