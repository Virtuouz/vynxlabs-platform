# Run log: console/how-to/releases/ask-for-a-promotion.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs). Playwright, headless, 1440 px, light theme. No other width or theme was run.
- Names made for this run start with `rel`: workspaces Rel dev (slug `rel-dev`, later renamed Rel dev two and back) and Rel prod (`rel-prod`, production, the target of Rel dev), a clone `rel-clone` (deleted again), variables `rel-greeting`, `rel-farewell`, `rel-region` and a connection `rel-courier`. Fernhill was not changed.
- Signed in as Dr. Amara Okafor (viewer) to ask, and as Maya Brooks to decide. Devi Shah could not be used to ask: she holds Deployer in Fernhill, so she promotes herself (the page shows **Promote to production**, no form).

## Steps as followed
1. Amara, Rel dev, `?step=promote` (Rel dev at v2, Rel prod at v1): the section "PROMOTING TO REL PROD" said "You may not promote to Rel prod yourself. Ask, and those who may are shown your request on the tenant's overview, with what it would change.", the field "A note for whoever decides (optional)", the button "Request promotion of v2" and "Change where this promotes to". There was no **Promote** button.
2. Typed a note and pressed it. The tenant's audit log showed "Promotion requested". Reloaded: **Waiting**, "Asked 13s ago by Dr. Amara Okafor for v2.", **Withdraw the request**.
3. Maya, tenant **Overview**: "PROMOTION REQUESTS: Dr. Amara Okafor asks to promote v2 from Rel dev to Rel prod. 17s ago · “v2 adds the farewell variable. Ready for production.”" with **Review**. The sheet: "Promote v2 to Rel prod?", "Asked by Dr. Amara Okafor 19s ago, from Rel dev.", the note, "Creates 1, changes 0 and removes 0.", the change, and the buttons **Decline…** and **Promote**.
4. **Decline…**: the dialog "Decline the request?" "Why? The one who asked reads it." with **Cancel** and **Decline**; gave a reason. Amara's view: **Declined**, "v2, by Maya Brooks 5s ago." and the reason, then the note field and the request button again.
5. Amara asked again. Maya pressed **Review**, then **Promote**: "Promote v2 to Rel prod?" "Rel prod starts running it at once. Runs in progress there finish on the version they started with." **Cancel**, **Promote**. Rel prod **Versions** then had v2 on top. Amara's view: **Promoted**, "v2, by Maya Brooks 8s ago."

## What the run found that differs from the brief or the code
- Product observation: a viewer, who cannot change anything, is shown **Change where this promotes to** under the request form.
- The page names permissions and not roles, since in Fernhill the developer is also a deployer.

## Not run
- **Withdraw the request**, the notice that the workspace moved on to a newer version, a request whose promotion is refused, and what the person who may promote sees when they open the step with a request pending.
