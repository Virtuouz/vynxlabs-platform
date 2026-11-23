# Run log: console/how-to/flows/start-a-flow

- Instance: the walk instance, `http://localhost:8091`, Fernhill seeded. Code at branch `phase-31-write-the-docs`, 2026-11-23. Signed in as Maya Brooks (`maya.brooks@fernhill.example`), tenant admin, workspace Sandbox, headless Chromium through Playwright, 1440 x 900, light. Flows were named `flows-…`. Scripts are in `/home/gplascencia/.local/share/volvel-walk/flows31/`.

## Steps as followed
1. New flow `flows-hook/in`, chose `start`, **It starts** list: By hand, or from another flow / On a schedule / When an event is published / When its address is called / When someone fills in its form.
2. Chose "When its address is called": **The flow is given**, **The request is answered**, **Each request is checked**, **Tags for each run (optional)** appeared.
3. **Save draft**, **Deploy**, **This change only**. The flow's page showed **How it starts**: `start POST http://localhost:8091/api/v1/hooks/…`, and a **Webhook** row under triggers marked "Workspace paused".
4. `curl -X POST` to that address answered 503 with `workspace_paused`, "This workspace's triggers are paused, so the webhook started nothing." Sandbox's Overview says "Triggers are paused": a dev workspace starts that way.

## What the page got wrong, corrected
- It did not say a dev workspace starts with triggers paused, so the webhook does not start runs. Added to "If it does not work".
- It dropped the tag hint; the screen says tags can be searched. Restored.
Not reached: a form, an event filter, a schedule and a signature were not set on the instance. A webhook that started a run was not seen, because Sandbox's triggers are paused and I did not resume a shared workspace.
