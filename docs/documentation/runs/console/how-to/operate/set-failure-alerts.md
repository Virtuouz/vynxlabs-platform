# Run log: console/how-to/operate/set-failure-alerts.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, Playwright headless. No other width, no dark theme, no keyboard-only pass, no reload test.
- Other writers share the Sandbox, so its Runs list holds runs that are not mine.

## The steps as followed
1. **Configure**, **Alerts**: **This workspace's default**, **Start a script** (None and the workspace's scripts), **Post to a connection** (None, sms, supplier), **Save**. Chose `alerts/run-failed` and pressed **Save**.
2. Ran `inventory/place-order` with a line that does not exist. It showed "attempt 1 of 3" and **Queued** between tries, and ended **Failed** after attempt 3 (about 77 s), with "#1 failed nothing logged" and so on.
3. The failed run's page showed **The failure handler's run**, **Published**, "It published no events.", and the error "That stock line no longer exists."
4. **Alerts**, **Recent alerts**: the run's script, "5s ago", the error and **The script it started**. The section **Set by scripts themselves** listed `reminders/send` starts `alerts/run-failed` with **From the repository**.
5. Set **Start a script** back to None and pressed **Save**.

## The page got wrong (and was corrected)
- The run showed that a run with retries stays **Queued** between attempts and is alerted only after the last one: the page says so under "If it does not work".

## Not run by the writer
**Send a test alert** and a post to a connection (the Sandbox's connections are stand-ins and nothing was chosen), two failures within ten minutes, a flow failure, a person without `workspace:write`.

## Second check (2026-11-23)

- Instance: http://localhost:8091, the throwaway instance (MAIL_CAPTURE_DIR set, so mail is read from its folder). Everything below ran in a workspace of my own: Operate check (a dev workspace) and Operate check live (a production workspace linked to it), in Fernhill's tenant, with scripts, flows, triggers, a secret and an HTTP connection of mine (deployed by the CLI from a repository of my own; the connection pointed to a listener of mine on localhost). Signed in as Maya Brooks, and as Devi Shah (not in the Practice managers group) where a second person was needed. Playwright, headless.

- **Configure**, **Alerts**: chose `opchk/note` and a connection of mine (HTTP, to a listener on localhost), **Save**: "Alerts will go there from the next failure."; **Send a test alert**: "Sending…", then "The test alert was posted." The listener received `{"run":{"id":null,"error":"A test",…},"test":true,"text":"Test alert from operate-check. Alerts for failed runs will look like this."}`.
- A script that always fails, run twice: one alert, then **Recent alerts** read "opchk/boom", "7s ago", **Posted**, "+1 more", the error and **The script it started**; the listener received `{"run":{"id","error","script","attempt","workspace"},"text":"Run failed: opchk/boom in operate-check. opchk boom: on purpose"}`; the first run's page read "The failure notification was posted." and "1 later failure was counted on this alert, not sent on its own."
- A flow run that failed (rejected) was alerted: "The failure notification was posted."
- Devi Shah (no workspace:write): **Save** disabled, the line "You can see where this workspace's alerts go, not change it. It needs workspace:write. …", **Send a test alert** still enabled.
- 390 px dark: no horizontal scroll.

Still not run: a post that fails, the handler that did not start.
