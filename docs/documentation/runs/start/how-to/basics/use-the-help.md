# Run log: start/how-to/basics/use-the-help.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-24. Playwright, headless Chromium.
- Signed in as Maya Brooks, in Fernhill's Sandbox, 1440 px, light. The help the instance serves was built before this wave's pages, so it showed the old text of the workspace overview. No phone or tablet width.

## The steps as followed
- `F1` on the overview: the panel opened docked (`data-help-panel="docked"`) at "Workspace overview", with the path Console › Reference › Screens › Home › Workspace overview, **Previous** (Your tenants), **Next** (Account), **Open in documentation** and the checkbox "Underline my team's terms on screens" with its hint.
- **Search the help** with "saved views": a list of pages with the line of the page that matched. With "qqzzxx": "Nothing in the help matches."
- **Copy a link to this help**: the headless browser has no clipboard permission, so the address `…/overview?help=workspace-overview` was shown in the notice instead of "A link to this help is copied."
- `F1` again closed the panel.

## The page got wrong (and was corrected)
- Nothing in the parts that were run.

## Not run
- Widths under 1280 px, **Back to the help for this page**, **Help home**, **Open this page online**, **From your team**, and the failure states.
