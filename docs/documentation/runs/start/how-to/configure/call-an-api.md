# Run log: start/how-to/configure/call-an-api.md

- Instance: http://localhost:8091 (Fernhill seeded), commit `5ebf1c80`; CLI from the same tree (`packages/cli/dist/bin.js`); stand-in server on `127.0.0.1:4020`.
- Workspace: `cfg-code`, a dev workspace of my own, standing for `try-it`. Maya Brooks in the console at 1440 px, light, headless Playwright; the CLI with Maya's API key.
- The repository was a folder with `package.json`, and `src/index.ts` as on the page. It was made by hand, not with `volvel init`, so the `volvel init` and `volvel login` lines were not run.

## The steps as followed
1. `src/index.ts` as written.
2. `volvel deploy --tenant fernhill --workspace cfg-code`: "Deployed version 1 to cfg-code (dev): 3 created, 0 updated, 0 deleted, 0 unchanged." then the three `created` lines and two notes: `the connection "stock-orders" is not bound in this workspace` and `the secret "SUPPLIER_ACCOUNT" is not set in this workspace`. The variable gave no note (it has a default).
3. **Configure > Connections**: `stock-orders`, **Used by** `stock/reorder`, kind HTTP, **Not set up here**, button **Set up**. The sheet was titled "Set up stock-orders" and held "stock-orders · HTTP · VetSupply Direct: prices and orders for stock."
4. Address `http://127.0.0.1:4020`, **Authorization: Bearer**, token `vs_demo_51be22`, **Save**: "Saved", "Reached (200) in 104 ms."
5. **Secrets > New secret**, `SUPPLIER_ACCOUNT` / `FERNHILL-CFG`: toast "The secret SUPPLIER_ACCOUNT is made. Name it in a script's uses to read it." with **Open SUPPLIER_ACCOUNT**; the row showed `stock/reorder` under **Used by** and "14:26:17 by maya.brooks@fernhill.example".
6. **Variables**: `stock/reorder-quantity`, **Default: 10**, **Set**, `12`, **Save**: the row showed `12` with **Change** and **Use default**.
7. `volvel run stock/reorder --remote …`: "Test run 01a20a4d-d2b7-738c-bdd0-40aa14e680f2 of stock/reorder in cfg-code, from this build (preview, version 1). Nothing was deployed. Succeeded in 188 ms. Output: { "reference": "VSD-900108" }".
8. The stand-in's page listed `VSD-900108`, `FERNHILL-CFG`, `VAC-DHPP`, 12.

## Failures seen
- Secret deleted: "Failed: GET /runs/…/secrets/SUPPLIER_ACCOUNT?attempt=1 answered 404: The secret SUPPLIER_ACCOUNT was not found."
- Connection removed: "Failed: GET /runs/…/connections/stock-orders?attempt=1 answered 404: The connection stock-orders was not found."

## Differences from the brief and the page
- `volvel run --remote` runs the local build as a test run ("from this build (preview…). Nothing was deployed.") against the workspace's settings; it is not a run of the deployed version.
- The step order was run in pieces over a longer session, with the variable set after the first run in one pass; the page's order (variable before the run) was followed for the order of the screens, and the quantity 12 was seen in the stand-in.

## Not run
`volvel init`, `volvel login`, a production workspace, 768 and 390 px, dark, keyboard only.
