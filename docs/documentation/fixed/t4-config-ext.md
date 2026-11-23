# Fixed: lane t4-config-ext (configure, extensions, scripts)

Paths: `C/` = `apps/console/src/`, `S/` = `apps/control-plane/src/`. No migration. No change to `schemas/`, `docs/contracts/` or a worker route. Two API changes, both additive: `GET /tenants/:t` and the tenant list gain `consoleCode`, `PATCH /tenants/:t` takes `consoleCode`; a new `GET /tenants/:t/workspaces/:w/allowed?permissions=a,b` (signed in; answers only the caller's own). Walks were not run in a browser; the tests stand in. Commits: `0b7b56bf` (CFG-20/21/23/24), `0e370245` (EXT-12), `eae8c37b` (EXT-10), `21f64cfe` (CFG-26), merge `99fca94c`.

Screens to walk (1440, 768, 390; light and dark; keyboard; reload): Connections list and its wizard (name with `_`, kinds failing, Save then the stored line), Variables (Set variable with empty value, "Empty" cell, the variable's page), Secrets list and a secret's page (replace, then the stored line), a connector and a trigger source editor with a build error, the same in a production workspace, Repository page (the new "Code in the console" block), and Connections, Variables and Secrets as a person who holds only the read permissions.

## CFG-20, EXT-16 (one fix)
- **Test:** `C/ConfigExt.test.tsx` "CFG-20, EXT-16" (failed before: no draft was sent, "Name it with…" shown). **Changed:** `C/screens/ConnectionWizard.tsx` `PATH` is now `new RegExp(PATH_PATTERN)` from `@volvel/manifest`; the refusal is on the Name field and names underscores.
- **Siblings:** grep for `a-z0-9-]*` finds only `prefs.ts` (its own keys). `Authoring.tsx` already uses the manifest pattern.

## CFG-21
- **Test:** "CFG-21" (failed before: no Try again). **Changed:** `ConnectionWizard.tsx` settings area uses the kit's `Pending of={kinds}` (error with Try again and request ID).

## CFG-23
- **Test:** "CFG-23" x2 (failed before). **Changed:** `C/screens/Execution.tsx` Variables: value `required: false`, `done` names the variable ("Set region to an empty value…"), cell says "Empty", and `C/screens/ObjectPages.tsx` VariablePage says "Empty". The row sheet from t3-config (`VariableSheet`) already names the variable and takes an empty value.
- **Siblings, not changed:** `CreateDialog`'s default "Created." stays for lists with no `done`; the group member dialog was not touched.

## CFG-24
- **Test:** "CFG-24" (failed before). **Changed:** `C/kit/SecretField.tsx`: when `setAt` changes, the stored line shows again. Users: `ReplaceSecret`, the wizard, Git, SSO, mail/kit sheets, group member sheet. Those that do not pass `setAt` are unchanged.

## CFG-26
- **Tests:** `C/ConfigExt.test.tsx` "CFG-26" x4 (failed before), `S/workspace-allowed.test.ts`. **Changed:** `S/routes/workspaces.ts` `/allowed`; `C/api.ts` `useMay(root, ...permissions)` (nothing offered until answered; if it cannot be had, controls stay and the server's refusal speaks); `C/ListScreen.tsx` prop `needs` (no create button, no row actions, a note naming the permission); used by Connections (`connection:write`; New also needs `resource:write` outside production; Test also needs `run:read`; Connect/Reconnect), Variables (`variable:write`), Secrets (`secret:write`), and the connection, variable and secret pages.
- **Left:** `Tenant.tsx:790`, `Environments.tsx:52` (clone, pause, delete), the data source and group lists. They can use `useMay` and `needs` the same way; GOV-37 (t4-gov-docs) asks for a shared can-gate and may want to adopt `useMay`.
- **Polish gate:** states: loading shows no change controls, then the answer; failed answer keeps them. Lifecycle: unchanged. Keyboard: fewer tab stops, no new control. Copy: "You can read this list. Changing it needs the X permission: ask an administrator of this workspace."

## EXT-10 = SCR-16, D17
- **Tests:** `S/console-code.test.ts` (failed before: no `consoleCode`), `C/ConfigExt.test.tsx` "EXT-10" x2. **Changed:** `S/routes/tenants.ts` (read, PATCH with `tenant:write`, audited as `tenant.updated` with `consoleCode`), `C/screens/Git.tsx` `ConsoleCodeSwitch` on the Repository page: state, confirm before turning off, a reader sees the state and what is lacking. An operator and a tenant admin both hold `tenant:write` path. `S/routes/authoring.ts` 403 text says who can turn it on.

## EXT-12
- **Tests:** `C/ExtensionEditor.test.tsx` (new file: in `Authoring.test.tsx` a real Monaco loaded by earlier tests made typing unreliable) x2 (failed before). **Changed:** `C/screens/Authoring.tsx`: build errors are matched by `<path>.<kind>.ts`, so a connector or trigger source lists its lines; a Problems section is drawn below the code for kinds with no test pane; the production notice says the kind, not "Code".
- **Siblings:** the repository notice already used `about.noun`.

## EXT-11 (not done)
Refuted as a fault, as the finding itself says ("Fix: none now… do not document as a fault"): no console kind (script, connector, trigger source) defines a widget or a page, so nothing an author writes types differently. No test can fail.

## Found
- `C/Authoring.test.tsx`: tests that type into the code editor depend on whether Monaco was loaded by an earlier test in the process (stand-in textarea or real editor). Drive saves through another field.
- An empty list shows its create button twice (header and empty state), as before; tests that wait for it must use `findAllByRole`.
