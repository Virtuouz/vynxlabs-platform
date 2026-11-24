# Fact-check record: console/reference/screens/build/flows

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Chips All, Failed in 24 hours, Waiting, Drafted; search placeholder | apps/console/src/screens/Flows.tsx:107-135 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Columns Flow, Started by, Steps, Last run (N in 24 hours, failed, waiting), State (vN, Draft, Removing) | Flows.tsx:137-200 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Waiting note counts approvals only; link Decide | Flows.tsx:96-101 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Empty-state texts | Flows.tsx:215-232 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Inspector rows and buttons | Flows.tsx:233-330 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Flow page: Edit needs dev+resource:write; Offer to an agent and Start flow need a manual start and flow_run:write; arrangement needs flow:write; messages | Flows.tsx:430-575; routes/flows.ts:746 | second agent, 2026-11-23 | checked: labels matched against the console source |
| How it starts lines, Recent runs (Started, Status, Started by), Schedules and triggers that start it, Used by | Flows.tsx:576-645 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Started-by words | apps/console/src/kit/starts.ts:7-17 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Shortcut g f; palette Mod+K | apps/console/src/kit/shortcuts.ts:29,36 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Offer to an agent grants a service account the agent_runner role on the flow | apps/console/src/screens/OfferToAgent.tsx:75-110 | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- The search box's accessible name is **Find a flow**; "Find by path or purpose" is its placeholder (Flows.tsx:117-121); "1 run is waiting for a person." for one (Flows.tsx:107). The button is **Offer to an agent…** with an ellipsis (OfferToAgent.tsx:249). Confirmed on the instance: chips All 4, Failed in 24 hours, Waiting, Drafted; the inspector rows Deployed v1, Draft None, Steps, Runs in 24 hours, What starts it; the flow page buttons Edit, Offer to an agent…, Start flow, Add a schedule. Walked at 390 px light and dark: no sideways scroll.

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Empty-state text quoted; a flow is also a file. | `apps/console/src/screens/Flows.tsx:232` | writer, 2026-11-24 | holds as read |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build, `pnpm docs:check` passes. Second agent, 2026-11-24. The empty-state quote is in `apps/console/src/screens/Flows.tsx` (a8 is changing the copy). A `<path>.flow.yaml` builds (webhook run). Holds.
