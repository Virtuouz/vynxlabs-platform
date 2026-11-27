# Run log: console/how-to/operate/pause-triggers.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, Playwright headless. No other width, no dark theme, no keyboard-only pass, no reload test.
- Other writers share the Sandbox, so its Runs list holds runs that are not mine.

## The steps as followed
1. **Operate**, **Triggers**, `?trigger=inventory%2Fhalf-hourly`: the inspector read "schedule trigger", Starts inventory/check (script), Schedule `*/30 * * * *` · America/Los_Angeles, Next "Fires once when resumed", Last fired "Not fired yet. Runs started by hand are not counted.", with **Edit** and **Pause this trigger**. The page note read "Every trigger here is paused. Resume them under Workspace settings."
2. **Pause this trigger** opened "Pause inventory/half-hourly?" with "Why (shown to everyone here)", optional, **Cancel**, **Pause**. Typed `op-docs check`, **Pause**.
3. The inspector then read "Paused just now by Maya Brooks: op-docs check. Nothing it would start is started until it is resumed." and offered **Resume** and **Edit**.
4. **Resume**: the notice went and **Pause this trigger** came back.
5. Production webhook `payments/payfern` in Clinics: inspector with **WEBHOOK ADDRESS**, **Copy address**, "Last refused 1h ago: the signature did not match".

## The page got wrong (and was corrected)
- No correction was needed from the run.

## Not run by the writer
Pausing a workspace under **Workspace settings** and the instance pause (both would change the shared Sandbox or the instance; their texts are from the code), checked-row **Pause**, a webhook answering 503 while paused, the form text.

## Second check (2026-11-23)

- Instance: http://localhost:8091, the throwaway instance (MAIL_CAPTURE_DIR set, so mail is read from its folder). Everything below ran in a workspace of my own: Operate check (a dev workspace) and Operate check live (a production workspace linked to it), in Fernhill's tenant, with scripts, flows, triggers, a secret and an HTTP connection of mine (deployed by the CLI from a repository of my own; the connection pointed to a listener of mine on localhost). Signed in as Maya Brooks, and as Devi Shah (not in the Practice managers group) where a second person was needed. Playwright, headless.

- Paused `opchk/slack` with the reason "op-docs pause test": the inspector read "Paused just now by Maya Brooks: op-docs pause test. Nothing it would start is started until it is resumed."; a request answered 503 `trigger_paused` ("This webhook is paused, so it started nothing. Try again later."); **Resume**.
- Batch: two rows checked; "Pause 2 triggers?" with the paths and **Why (shown to everyone here)**; **Pause**; both read **Paused**; **Resume** put both back.
- **Configure**, **Workspace settings**: **Triggers are on**, **Pause triggers** acted at once with no question; the section then read **Triggers are paused**; the Triggers screen said "Every trigger here is paused. Resume them under Workspace settings." and every row read **Workspace paused**; a webhook answered 503 `workspace_paused`; **Resume triggers** put it back.
- **Fire now** on a schedule opened a run named "Schedule opchk/nightly".
- In the production workspace **New trigger** is disabled.
- 390 px, light and dark: **Triggers** and the inspector stack, no horizontal scroll.

Still not run: the instance pause (it would stop every tenant of the shared instance; its words are from the code), the form text.
