# Fact-check record: start/reference/basics/finding-your-way.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks (or the operator admin where said), 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Rail items Overview, Build, Operate, Data, Configure, Tenant, then Tenants (member) or Instance (operator); theme and account buttons. | `Shell.tsx:960-1020,1040-1052`; `nav.ts:63-90`; run | writer, run | holds as run |
| Areas with several sections reveal them and go nowhere; pressing again or Esc puts them away. | `Shell.tsx:520-530,780-830,940-960` | writer | holds (not run) |
| The five workspace items are dimmed outside a workspace and use the last workspace of this browser. | `Shell.tsx:937-945` | writer | holds |
| Sections by area, with Deploy/Versions. | `nav.ts:112-300`; run (operator sections list) | writer, run | holds as run |
| Counts: "{n} failed", "{n} draft(s)", conflict/ahead/behind, "{n} not set up", "{n} active", "{n} to fix", "{n} online". | `Shell.tsx:166-206`; run ("5 failed", "11 drafts", "1 to fix", "0 online") | writer, run | holds as run |
| Deploy path: Draft, This workspace with v or nothing deployed, linked workspace with same/differs. | `Shell.tsx:384-440`; run | writer, run | holds as run |
| Hide navigation, Show navigation, Filter. | `Shell.tsx:1073,1084` | writer | holds |
| Docked panel from 1024, rail from 768. | `kit/layout.tsx:40` | writer | holds |
| Switch workspace / Switch tenant menus; keeps the object, else the section; filters go with a list. | `Shell.tsx:1147,1200,330-380` | writer | holds (not run) |
| Header: tag, Paused, "promotes to", breadcrumbs, Back to {section}, drafts Review, failed runs, Help, Search. | `Shell.tsx:1100-1310` | writer | holds |
| Live states and timings (3 s, 30 s). | `kit/LiveIndicator.tsx:11-24`; `stream.ts:36-38` | writer | holds |
| At most 5 streams per person per replica, 2 for own runs only. | `apps/control-plane/src/kernel/stream.ts:67-69` | writer | holds |
| Instance · operator tag, Personal tag; tab title object · section · workspace · product. | `Shell.tsx:1254-1256,859-866`; run (title "Overview · SSO Wave · Volvel") | writer, run | holds as run |
| Amber rule under the header in production. | `Shell.tsx:1314` | writer | holds |
| Operator strip with End now, Hide; mark with Show the notice and End access now. | `kit/OperatorStrip.tsx:93-130` | writer | holds (not run) |
| Account menu items. | `Shell.tsx:665-710`; run | writer, run | holds as run |
| What I may do here opens the member page; needs no permission. | `Shell.tsx:681-690`; run | writer, run | holds as run |
| Palette: empty-state sections and counts; prefixes; actions and where they show; keys; Pinned 12; Recent 20/8. | `kit/CommandPalette.tsx` (see the find-and-jump record) | writer, run | holds as run |
| Search kinds and permissions. | `apps/control-plane/src/routes/search.ts:12-27` | writer | holds |
| Read-only strip and its words. | `kit/ReadOnly.tsx:9-31` | writer | holds (not run) |
| Nothing here / For operators texts and "Go to your tenants". | `screens/NotFound.tsx`; `App.tsx:171,196-201`; run | writer, run | holds as run |
| Crash: This page could not be shown with Try again, Reload, Go back. | `kit/ErrorBoundary.tsx:44-62` | writer | holds (title text not read) |
| Skip to content; heading takes focus on a new page. | `Shell.tsx:1032,870-890` | writer | holds |

## Second check

Checked by: second agent, 2026-11-23. Sections, groups and labels compared with `nav.ts:121-292` (every area, tenant group names Work, People and access, Sign-in, Delivery, Governance, instance list); theme menu (**Match the system**, **Light**, **Dark**) and account menu (**Account**, **What I may do here**, **Help for this page**, **Keyboard shortcuts**, **Sign out**) seen on the instance as Maya; permission list and prefixes compared with the palette page's record; states, "Searching…" after 300 ms, 150 ms, 12/8/20 as in the limits page. By width, on Sandbox Runs: at 1440 and 1024 px the section panel, the tenant name, the promotion and "{n} drafts Review" are in the header; at 768 px the rail is there, the panel is hidden (**Show navigation**), and the tenant name, promotion and drafts link are not; "{n} failed runs" still shows; at 390 px there is no rail and **Open the menu** is in the header. The screenshot name `start/basics-finding-your-way` is the writer's. Not re-read in code: each count's wording on the section entries, the amber rule, the strips' sentences (the writer's citations stand).
