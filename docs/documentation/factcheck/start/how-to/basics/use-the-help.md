# Fact-check record: start/how-to/basics/use-the-help.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks, 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| F1 or Ctrl+/ toggles the help; the header button is "Help for this page"; the palette and account menu have the same. | `kit/shortcuts.ts:32`; `Shell.tsx:732`; `kit/CommandPalette.tsx:566-575`; run (F1 opened and closed) | writer, run | holds as run |
| The panel opens at the page for the screen (topic). | `help/HelpPanel.tsx`; run (workspace overview) | writer, run | holds as run |
| Docked at 1280 and wider (over the page beside an open inspector until 1680), over the right edge on a tablet, full screen on a phone. | `help/HelpDock.tsx:12-60`; run (docked at 1440) | writer, run | docked holds as run; others from code |
| "Search the help" lists pages; "Nothing in the help matches." | `help/HelpPanel.tsx:266,561`; run | writer, run | holds as run |
| Results show up to three places per page, opening at the heading. | `help/HelpPanel.tsx:563-600` | writer | holds (not run) |
| Previous / Next, Related, path above the title, Help home, Back to the help for this page. | `help/HelpPanel.tsx:217-237,328,413-450,531`; run (Previous, Next shown) | writer, run | holds as run |
| "Copy a link to this help" says "A link to this help is copied."; the link has `?help=<topic>`. | `help/HelpPanel.tsx:198-207`; run (clipboard blocked in the headless browser, so the address was shown) | writer, run | partly run |
| "Open in documentation" opens /docs on this instance; "Open this page online" only when the instance names a docs site. | `help/HelpPanel.tsx:460-485` | writer | holds (not run) |
| "From your team" lists team pages on the same topic. | `help/HelpPanel.tsx:451-465` | writer | holds (not run) |
| "Underline my team's terms on screens" with its hint; a setting that follows you. | `help/HelpPanel.tsx:488-494`; `apps/control-plane/src/routes/preferences.ts:17` (`terms.underline`) | writer | holds |
| "There is no help for this screen yet."; "The help has no page called “{name}”."; "The help could not be loaded." | `help/HelpPanel.tsx:290-312,300` | writer | holds (not run) |
| Esc inside the panel closes it. | `help/HelpDock.tsx:61-67` | writer | holds |
| Served by the instance and works offline. | `help/content.ts`; `help/HelpPanel.tsx:155` (`/help/assets`) | writer | holds |
