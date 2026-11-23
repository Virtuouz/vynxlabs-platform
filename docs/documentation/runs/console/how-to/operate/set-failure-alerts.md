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

## Not run
**Send a test alert** and a post to a connection (the Sandbox's connections are stand-ins and nothing was chosen), two failures within ten minutes, a flow failure, a person without `workspace:write`.
