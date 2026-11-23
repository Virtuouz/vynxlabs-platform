# Run log: console/how-to/extensions/write-an-extension.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs). Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox (dev) workspace, at 1440 px, light theme, Playwright headless. No other width or theme was run.
- Names made for the run start with `ext31` (the page's examples use `connectors/shop` and `sources/payments`). They are left in Sandbox.
- The steps were run in pieces, then the page was written from what was seen. A single end-to-end run of the finished text was not made.

## Connector
1. **Build > Extensions** was empty ("No extensions yet"). **New connector** opened "New connector", the pill "Not saved", **Path**, a starter with a `test` export, **Settings** open with **What it does** and the schema.
2. Path `ext31-shop`, **Save draft**: the address became `extensions/connector/edit/ext31-shop`, the pill **Draft**, buttons **Name and path**, **Discard draft**, **Save draft**, **Deploy**.
3. **Deploy > This change only**: toast "Deployed ext31-shop as version 6." with **Promote to Clinics**. The editor then showed **Deployed** with **Remove**, and **Deploy** was gone.
4. **Extensions** listed `ext31-shop`, "Connector", **Deployed**.
5. **Configure > Connections > New connection** offered only HTTP, Mail (SMTP), OAuth 2.0 as the Kind. So the connection was made at `resources/new/connection` (**All resources > New > Connection**): Path `ext31/shop-conn`, "What kind of connection" listed the connector; **Save draft**, **Deploy > This change only**.
6. **Connections** then listed it as "Not set up here" with **Set up**. The panel "Set up ext31/shop-conn" showed the connector's `ext31-shop` and an **Address** field from the schema, and a **Secret**. Address `http://127.0.0.1:4020/vetsupply`, **Save**: "Saved. Reached (404) in 40 ms." with **Test again**; the row said **Reached**. 404 is the status the starter's `test` export returned for the mock server.

## Trigger source
1. **New trigger source**: **It is handed** with the two options and the hint; path `ext31/inbox`, saved and deployed. The list showed "Trigger source for a webhook".
2. **All resources > New > Trigger** showed "It starts the script", "When its address is called", **The script it starts**, **Each request is checked** with "By a trigger source of your own" (offered because a webhook source existed). Trigger `ext31/inbox-hook` was saved, deployed and listed on **Triggers**, with the workspace shown as paused (a dev workspace). It was **not fired**: no request was sent, so the source's answer, a refusal and **Last refused** were not seen.
3. The schedule's **Trigger source (optional)** field was not run.

## Refusals
- Path "Bad Path": "Give the connector a path: lowercase letters, digits, hyphens and underscores, in folders. For example connectors/shop."
- Path `ext31-shop` again: "Something already exists at this path. Choose another, or open that one."
- Schema `{ nope`: "The schema is not valid JSON."
- Code importing lodash, saved as `ext31-lodash`: **Problems (1)** "Cannot find module 'lodash' or its corresponding type declarations." at 1:15 from the editor. **Deploy > This change only** opened "ext31-lodash cannot be deployed alone": "The code written in the console does not build. ext31-lodash.connector.ts:1 Code written in the console may import only @volvel/sdk and node: modules, not "lodash". Put shared code and packages in the repository." with **Close** and **Review all drafts**. The draft `ext31-lodash` is left.
- Not run: the "Someone else saved" clash, the tenant switch off, a production workspace, a poll source, the **Promote to** step.

## The page got wrong (and was corrected)
- The first text had the connection made on the **Connections** screen's **New connection**. That panel offers only the built-in kinds; the page now makes the connection as a resource and sets it up on **Connections**.
