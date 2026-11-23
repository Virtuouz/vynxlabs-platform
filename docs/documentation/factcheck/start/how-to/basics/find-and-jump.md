# Fact-check record: start/how-to/basics/find-and-jump.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks, 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Ctrl+K or ⌘K, or the header button "Search or jump to…", opens the dialog "Go to". | `kit/shortcuts.ts:29`; `Shell.tsx:1301`; `kit/CommandPalette.tsx:764`; run | writer, run | holds as run |
| With nothing typed: the open object's commands, Pinned, Recent (8), 12 screens, 4 actions. | `kit/CommandPalette.tsx:690-706`; run | writer, run | holds as run |
| Typed words must all appear; groups This workspace, Other workspaces, Runs, People, Screens, Actions. | `kit/CommandPalette.tsx:124-135,706-740`; run ("visit") | writer, run | holds as run |
| Prefixes `>` runs, `#` resources, `/` actions, `@` people. | `kit/CommandPalette.tsx:197-207`; run | writer, run | holds as run |
| `>` takes 8 or more hex characters of a run ID or `tag:`. | `apps/control-plane/src/routes/search.ts:44-52,183` | writer | holds (not run) |
| Search finds the listed kinds, each by its own read permission; secrets by name. | `routes/search.ts:12-27,256-270` | writer | holds |
| Up to 20 results; text up to 200 characters. | `routes/search.ts:95-111` | writer | holds |
| Ctrl+P pins, notice "{name} is pinned to the palette."; again "{name} is unpinned."; 12 pins per tenant. | `kit/CommandPalette.tsx:255-265,794-803`; run | writer, run | holds as run |
| Pinned is first with nothing typed. | run | writer, run | holds as run |
| Pins follow you across browsers. | `apps/control-plane/src/routes/preferences.ts:17` (`palette.pins:<tenant>`) | writer | holds |
| "Run script…", "Start flow…" pickers list deployed scripts and manually startable flows; Backspace leaves a picker. | `kit/CommandPalette.tsx:378-430,810-820` | writer | holds (not run) |
| "New script", "New flow" only in a dev workspace. | `kit/CommandPalette.tsx:466-490`; run (Sandbox is dev) | writer, run | holds as run |
| The dialog for a started item is titled "Run {path}" / "Start {path}", buttons "Run" / "Start flow". | `kit/CommandPalette.tsx:921-925` | writer | holds (not run) |
| Ctrl+Enter is Run on a script, Start on a flow, Run again on a run (asks first). | `kit/CommandPalette.tsx:578-620`; run (hint "Ctrl+Enter Run again") | writer, run | holds as run |
| "Nothing matches “…”." / "Type to find something." / "The search failed. What is typed may still be there; try again." with Request ID and Try again. | `kit/CommandPalette.tsx:822-840`; run | writer, run | holds as run |
| Recent keeps 20 per tenant, shows 8; only for a member; not drafts never deployed. | `routes/search.ts:293-420`; `recent.ts` | writer | holds |
| Outside a tenant no search of objects. | `kit/CommandPalette.tsx:297-300` (`!tenantId`) | writer | holds |

## Second check

Checked by: second agent, 2026-11-23. All rows re-read against `kit/CommandPalette.tsx`, `kit/shortcuts.ts` and `routes/search.ts`; run on the instance in Fernhill's Sandbox as Maya Brooks at 1440 px light and 390 px dark.

| Claim | Source / run | Result |
| --- | --- | --- |
| `/` then Enter on **Run script…** lists deployed scripts; choosing one opens the dialog **Run {path}** with **Start** (**Now** / **Later**), **Priority**, the input in fields or **JSON**, buttons **Cancel** and **Run**; **Run** opened the run page (Succeeded). The page lacked Now/Later and Priority: added. | `kit/CommandPalette.tsx:378-430,921-944`; `InputDialog.tsx:76-130`; run | corrected |
| **Start flow…** lists flows that have a manual trigger; the dialog is **Start {path}** with **Start flow** (**As JSON** when the flow takes no fields); **Start flow** opened the run (Waiting for approval). | `kit/CommandPalette.tsx:402-415`; run (`flows-approve/discount`) | holds as run |
| A flow that was never deployed is listed in the picker, and **Start flow** says "The flow tut-approve was not found." | `kit/CommandPalette.tsx:402-415` (no filter on a deployed version, unlike scripts); run | fault: the flow picker lists a flow that was never deployed. Page row added. |
| Backspace on an empty box leaves the picker; it returns to the list shown with nothing typed (Recent, Screens, Actions), not to the actions. | `kit/CommandPalette.tsx:794-795`; run | corrected |
| `>` and the first 8 hex characters of a run ID: lists runs whose ID starts so (an ID begins with the time it was made, so runs within about a minute share 8). | `routes/search.ts:44-52,183-200`; run | holds as run; sentence added |
| Outside a tenant (the **Tenants** screen) with nothing typed: **Screens** (your tenants, **Account**) and **Actions** (4: dark theme, API description, Help, Keyboard shortcuts); typing finds screens only. Note that opening `/` takes a returning member into a workspace, so use the rail's **Tenants** to see it. | `kit/CommandPalette.tsx:278,297-300`; run | holds as run |
| "The search failed. What is typed may still be there; try again." with "Request ID" and **Try again** (the search request answered 500 in the browser). | `kit/CommandPalette.tsx:822-840`; run | holds as run |
| Header button **Search or jump to…** opens the dialog at 390 px (header, no rail); the palette fits and scrolls. | run at 390 px dark | holds as run |
| 12 pins (`slice(0, 12)`), 8 recent shown, 20 kept, 12 screens, 4 actions. | `kit/CommandPalette.tsx:260,702-704`; `routes/search.ts:100,320,427` | holds |
