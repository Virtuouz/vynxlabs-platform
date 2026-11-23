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

## Second check, 2026-11-23 (second agent)

On the walk instance, Maya Brooks, in a workspace of my own: Fernhill tenant, dev workspace `flows-check` (created with triggers running, so the shared Sandbox's paused triggers were not touched). Flows `flows-approve/mail`, `flows-hook/signed`, `flows-form/intake`, `flows-sched/tick`. Scripts in `/home/gplascencia/.local/share/volvel-walk/flows31/` (`h2.mjs` to `h15.mjs`, `w1.mjs`, `w2.mjs`).

Done now, as written:
- A webhook with a signature: **Each request is checked** set to **By a signature in a header**, **Header it is sent in** `x-signature`, **Text before it (optional)** `sha256=`, **Secret it was signed with** a workspace secret `HOOK_KEY`. Deployed. Good signature: 202 with a run ID, the run **Succeeded**, **Started by** Webhook. Wrong signature, missing header, and a good signature without the prefix: 401 `signature_invalid`. A repeated `idempotency-key`: the same run ID. After **Pause this trigger**: 503 `trigger_paused`, "This webhook is paused, so it started nothing. Try again later."
- A form: **When someone fills in its form**, a **Title of the form**, the one question **Message** the editor gives, deployed. The **Form address** is in the Triggers inspector. Opened signed out, filled in, sent: "Thank you. Your answer was sent." The run was **Started by** Form.
- A schedule: **On a schedule** (default `0 8 * * *`, next five times listed), deployed. **Fire now** on the Triggers screen started a run, **Started by** Schedule.
- The triggers were not paused in `flows-check` (created with triggers running). The Sandbox pause was the dev-workspace default; it was left as it was.
Corrected on the page: the trigger source option and the secret list depend on the workspace; a form starts with **Message**; the form's address is on the Triggers screen.
Not run: a webhook that answers by an **Answer the request** step (25 s hold), an event start with a filter, a trigger source.
- 390 px and dark: the flow's page and the editor were opened at 390 px in light and dark: no sideways scroll, the **Test** panel under the canvas, the start's address wraps.
