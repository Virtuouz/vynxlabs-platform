# Run log: console/how-to/flows/draw-and-deploy-a-flow

- Instance: the walk instance, `http://localhost:8091`, Fernhill seeded. Code at branch `phase-31-write-the-docs`, 2026-11-23. Signed in as Maya Brooks (`maya.brooks@fernhill.example`), tenant admin, workspace Sandbox, headless Chromium through Playwright, 1440 x 900, light. Flows were named `flows-…`. Scripts are in `/home/gplascencia/.local/share/volvel-walk/flows31/`.

## Steps as followed
1. **New flow** (button, `.../flows/new`): editor opened, header "New flow", **Draft**, "Not saved".
2. **Path** `flows-orders/handle`; **Started by hand**: canvas shows one step, `start`.
3. **Add step**, **Find a step** `Set values`, Enter: a step `set` was added. Inspector: **Name**, **Values** (**Name**, **Expression**), **Add a value**, **Where it goes next** with **On failure, go to**.
4. With nothing chosen first, the step was not connected and the header said "1 to fix" with "Nothing leads to set.". Choosing `start` first connected it.
5. **Save draft**: "Draft saved just now"; **Deploy** appeared. **Deploy**, **This change only**: the flow was in the list at **v1** with 2 steps, and the editor's pill said **Live**.

## What the page got wrong, corrected
- It had no **Add step** button and said Enter in the search box on its own; the palette opens from **Add step**.
- It did not say to choose the start first.
- The button is **Add a value**, not **Add**.
- The state after a deploy is **Live**.
Not reached: the "cannot be deployed alone" refusal, and the full toast text (only "Deployed" was read).

## Second check, 2026-11-23 (second agent)

On the walk instance, Maya Brooks, in a workspace of my own: Fernhill tenant, dev workspace `flows-check` (created with triggers running, so the shared Sandbox's paused triggers were not touched). Flows `flows-approve/mail`, `flows-hook/signed`, `flows-form/intake`, `flows-sched/tick`. Scripts in `/home/gplascencia/.local/share/volvel-walk/flows31/` (`h2.mjs` to `h15.mjs`, `w1.mjs`, `w2.mjs`).

Corrected: the header's state pill reads **Deployed** after a deploy (the earlier "Live" was the connection indicator beside it). Seen at 1440 px, and at 390 px in light and dark (no sideways scroll, **Add step** and the header controls wrap). A reload of the editor showed the deployed flow with **Deployed**.
Not run: the "cannot be deployed alone" refusal.
