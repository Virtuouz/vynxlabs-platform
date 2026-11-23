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

## Not run
Pausing a workspace under **Workspace settings** and the instance pause (both would change the shared Sandbox or the instance; their texts are from the code), checked-row **Pause**, a webhook answering 503 while paused, the form text.
