# Run: develop/how-to/access/define-roles-and-bindings-in-code

Instance http://localhost:8091 (Fernhill seeded), tenant `acc-main` made by the operator for this run; members acc-ann and acc-bob (tenant admins), acc-cy (viewer); commit 5ebf1c80 plus the working tree; 2026-11-23. Browser: Playwright, headless, 1440 px, light, signed in as acc-ann for the screens named; the rest through the API with the same session cookies. Not done: 768 and 390 px, dark, keyboard, reload.

Second check, 2026-11-23, by a second agent. Instance http://localhost:8091 (Fernhill seeded), tenant `acc2-main` made for this check (members acc2-ann and acc2-bob, tenant admins; acc2-cy, viewer; workspace `acc2-dev`), commit 5ebf1c80 plus the working tree. Playwright, headless, signed in as acc2-ann. Walked at 1440 px light, then the screen at 390 px light and at 1440 px dark: no horizontal overflow, controls reachable, nothing cut off. Not done: 768 px, keyboard-only, reload on every screen. Ran the page's code (src/access.ts, exported from src/index.ts) with the built CLI against acc2-dev: `volvel deploy --tenant acc2-main --workspace acc2-dev` listed `role roles/order-reader` and `binding bindings/support-reads-orders` and deployed. The Access tab then listed the binding (Tech desk, order_reader, Acc2 dev) with the tag **From repository** and no **Remove**; the Roles tab listed order_reader with **From repository** and "In Acc2 dev", **Held by** Tech desk. A binding to a group that does not exist was refused: "Could not deploy to acc2-dev. The binding refers to something that does not exist." then `no group has the key "nobody" in this tenant ...`; a role that does not exist: `no role named "nonexistent_role" can be bound in this workspace`. Neither refusal names the path: page corrected.

## Phase 34, A7 run, 2026-11-24

Instance http://localhost:8712 (throwaway, lane a7's build, commit `d619bfbd` plus the working tree), Fernhill seeded. Terminal only.

- `examples/a7access`: the two files deployed to `walk4` (`2 created`); with `role: roles/order-reader` the build failed with the page's text; with `role: nobody` the upload failed; with `key: nobody` the deploy was refused on `walk5`.
