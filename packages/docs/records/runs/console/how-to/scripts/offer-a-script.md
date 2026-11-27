# Run log: console/how-to/scripts/offer-a-script.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No other width or theme was run, and no keyboard-only pass.
- Scripts made for the run are named `scr-greet` and `scr-broken` (the page uses `greet`). The steps were run in pieces, then the page was written from what was seen; a single end-to-end run of the finished text was not made.

## The steps as followed
- Inspector of `scr-greet`, **Offer to an agent…**: dialog "Offer to an agent": "The account may run the script scr-greet and nothing else: it is given the Agent runner role here, at this script alone. An agent connecting with its key sees no other script, flow or run in the workspace.", **Service account** (api-docs-agent, phone-assistant), **Cancel**, **Offer**.
- **Offer** with api-docs-agent: "api-docs-agent may now run the script scr-greet, and nothing else here. An agent connecting with one of its keys is offered it as a tool." "Address for the agent" http://localhost:8091/api/v1/tenants/…/workspaces/…/mcp, **Copy the address**, "Keys and tools of api-docs-agent", **Done**.
- In the editor of the deployed script the header held **Offer to an agent…** first.

## The page got wrong (and was corrected)
- Nothing differed from the brief.

## Not run
**Continue** (an account already offered), a tenant with no service account, an instance without the role, a draft-only script (the button is not drawn; seen on the list only through the code), a connection of an agent to the address, dark theme, 768 and 390 px, keyboard-only.

## Second check, 2026-11-23
- Walked by the second agent, 2026-11-23, on http://localhost:8091 as Maya Brooks in Fernhill's Sandbox: the scripts list with its inspector, the run dialog, the script's page, its Settings form and the editor, in dark and light at 768 and 390 px (no sideways scroll, nothing cut off) and by keyboard (g then s; Enter on Run opens the dialog with the focus in it and Esc closes it and returns the focus to Run; Ctrl+Enter; Enter on the Settings summary opens it).
- **Continue** was run: **Offer to an agent…** on `scr-greet`, which `api-docs-agent` already holds. The dialog opened with that account chosen, the sentence "It is offered to this account already. Continue to see where the agent connects." and **Continue**; it led to "api-docs-agent may now run the script scr-greet, and nothing else here…", the address, **Copy the address**, "Keys and tools of api-docs-agent" and **Done**.
- Still not run: a tenant with no service account, an instance without the role, an agent connecting to the address.
