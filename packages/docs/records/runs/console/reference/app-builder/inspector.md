# Walk log: console/reference/app-builder/inspector

- Instance: http://localhost:8091 (throwaway, Fernhill seeded), Maya Brooks (tenant admin), Sandbox workspace, 1440 px, light, Playwright headless, 2026-11-23. Reading only the texts of the screens by script; no width under 1440, no dark theme, no keyboard walk, no reload check was run.

- Settings of a Button (Display; its Data tab text not read), a Section (Display, Rules), Tabs, an Action group; ⋯ menu (Layout, Duplicate Ctrl+D, Move to…, Remove); Layout panel for a button and a table; Move to… dialog.
- Not walked: Rules and Actions tab contents, When a row is clicked, Add a form, Text on the page, the `Needs fixing` notice, More … options. Those are read from the code.

## Second check, 2026-11-23 (second agent)
- Instance http://localhost:8091 at commit `87000022` plus the working tree. Playwright headless. My own apps are named `chk2 …` (in Fernhill's Sandbox); no Fernhill app, table or person was changed. People: Maya Brooks (tenant admin); Abchk Maker (a member made for the check, App maintainer in Sandbox: `interface:write`, no `resource:write`); Abchk Dev (Developer in Sandbox: no `deployment:write`); Amara Okafor (viewer). Walked at 1440, 900, 768 and 390 px; light at all and dark at 1440, 768 (list, dialog, workbench) and 390 (list, workbench). A session reload was made for the rename and the page order.
- Run now: the Rules tab of a Button (**Show this button**, **Only when…**, **Who can see it** with **Limit to a group**; the picker lists Billing and Practice managers as Team, Front desk, hilltop, northside, riverside as End users); the Display tab of a Button; the Tabs editor of one tab (Name, **Opens first**, **Move them to**, **Move and remove the tab**, **Remove it with its widgets**); the Layout panel fields. Not run: the Actions tab steps and **When a row is clicked**, **Add a form**, **Text on the page**; they stay read from the code.
