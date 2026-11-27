# Run log: develop/how-to/configure/set-up-from-a-script.md

- Instance: http://localhost:8091 (Fernhill seeded), commit `5ebf1c80`. Node 24.15.
- Workspace: a dev workspace of my own, `cfg-code`, with a repository deployed that declares `stock-orders`, `SUPPLIER_ACCOUNT` (a secret named by the script) and `stock/reorder-quantity`. API key of Maya Brooks (tenant admin), made with `POST /api-keys`.

## The steps as followed
1. Saved the script as `bind.mjs` exactly as the page has it (after the two `if (!tenant)` and `if (!workspace)` checks were added in a first pass).
2. First I deleted the binding, the secret and the variable value by API (204 each), then ran `node bind.mjs fernhill cfg-code` with `VOLVEL_URL`, `VOLVEL_TOKEN`, `SUPPLIER_TOKEN=vs_demo_51be22`, `SUPPLIER_ACCOUNT=FERNHILL-CFG`. It printed "Set up stock-orders, SUPPLIER_ACCOUNT and stock/reorder-quantity in cfg-code."
3. `volvel run stock/reorder --remote --tenant fernhill --workspace cfg-code --input '{"sku":"VAC-DHPP"}'` then succeeded: "Succeeded in 198 ms. Output: { "reference": "VSD-900109" }".
4. Ran the script a second time: it succeeded again, replacing what it had set.

## Failures seen
- `node bind.mjs fernhill nope`: "Error: There is no workspace nope."
- A bad key: "GET /tenants: 401 {… "The Authorization header must be: Bearer <api key>." …}".
- As Sam Reyes (no role in the workspace) `PUT secrets`: 403 "This needs the secret:write permission."
- As Devi Shah, `PUT connection-bindings` with `baseUrl: "nope"`: 400 "The connection's configuration is not valid." with the field's error under `errors`.

## The page got wrong (and was corrected)
- The first script did not check for a missing tenant or workspace and stopped with a TypeError; the checks were added.
- The 403 text was first written for `connection:write`; the run gave the secret's. The page lists the three.

## Not run
Step 3's console look at the result (done as part of the connections run: `stock-orders` shows **Set up here**, **Reached**). A service account's key. A production workspace. A connection group member by API.

## Second check, 2026-11-23 (second agent)

- Instance http://localhost:8091, workspace `cfg-chk` of my own, Maya's API key. The three `PUT` calls of the page (a connection with `auth: bearer`, a secret, a variable) answered 204 each against the instance; the clone and OAuth PUTs of the connection route accepted `credential` left out (kept) as the table says. A changed authorization address on an OAuth connection forgot its sign-in.
- 390 px dark and 768 px: the **Connections**, **Variables** and **Secrets** screens the third step opens show no page scroll; the table of Connections scrolls inside its panel at 390.
- Not run: a service account's key, a production workspace, a group member by API.
