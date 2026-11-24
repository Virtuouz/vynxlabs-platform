# Fixed: lane cfg2 (configure, tier 2)

Branch `p29-cfg2`. No migration. No kind schema or bundle format change: `packages/manifest/src/kinds.ts` and `errors.ts` changed in a description only, and `bundle-check.ts` refuses one more thing (below). One new contract-visible field on a list: `connection-bindings` items gain `draft` and may say `connector: "unknown"`; `connection-groups` items gain `declared`; the clone report gains `connectionGroupMembers`.

Tests: control plane `cfg-configure.test.ts` (new), `connections.test.ts` (CFG-19), `git.test.ts` (D10); console `Configure.test.tsx` (new). Console tests were seen failing with the console changes reversed, control-plane ones with the single fix reversed or from the start.

## CFG-05 A bound connection no declaration speaks for is shown as what it was bound as
- `routes/execution.ts` `connectionsOf` reads the bundles uploaded to the workspace (shared loader `uploadedManifests`, also used by `configSchemaOf`) for a binding that no deployed, drafted or arriving declaration covers; drafted connectors are in the schema lookup. One that still has no declaration is `http` if its settings fit HTTP's, else `unknown` (console: "Not declared anywhere"). No column was added: the uploaded bundles hold the answer.
- Test: `cfg-configure.test.ts` "an SMTP connection bound from an uploaded bundle, and after its declaration was deployed away, is still SMTP".
- Siblings: connection groups' leftover list reads the same loader (CFG-10); variable and source lists have no connector.
- Left out: a connection that is bound, undeclared and whose bundle fell out of the five newest uploads is `unknown`.

## CFG-06 "Set up" on an unbound OAuth connection starts from a provider
- `screens/ConnectionWizard.tsx`: the Google preset is applied whenever the kind is OAuth and the settings are empty, whichever way the wizard was reached, and again when the Connection select changes. **Test:** `Configure.test.tsx` "CFG-06".

## CFG-07, CFG-22 A connection's page changes where it points, and says what the list says
- `screens/ObjectPages.tsx` `ConnectionPage` opens `ConnectionWizard` itself ("Change where it points", or "Set up" when unbound), has Test, and uses `ConnectionHealth` and `CONNECTOR_NAMES` (so "Reached", "Needs reconnecting", Connect/Reconnect, "OAuth 2.0"). `Connections` reads `?item=` as it reads `?setup=`. `TestConnection` is exported from `Execution.tsx`.
- **Tests:** `Configure.test.tsx` "CFG-07, CFG-22", "CFG-07: the list opens...". Siblings: the data source page has the same gap (not touched).
- Left out: Unbind on the page (missing part 1).

## CFG-08 A drafted connection is in Connections
- `connectionsOf` lists undeleted draft paths with `draft: "new" | "changed" | "removed" | null`, as groups and variables do; the console tags them. **Tests:** `cfg-configure.test.ts` "a drafted connection is listed...", `Configure.test.tsx` "CFG-08".

## CFG-10 (D46) Members of a removed group are listed with Remove
- `GET connection-groups` adds groups that only have members, `declared: false`. Console: "Not declared" tag, a sentence, Remove per member, no Change or Add. **Tests:** `cfg-configure.test.ts` "members of a group that is no longer declared...", `Configure.test.tsx` "CFG-10".

## CFG-11, CFG-12 A clone with Safety off copies group members, and says what it copied
- `tenancy/clone.ts` copies members (resealed), reports `connectionGroupMembers`. Console words (`Environments.tsx`): the settings row, the page description (any workspace may be deleted), the result ("connections, data sources, group members and secrets ... an OAuth connection is not signed in"). **Tests:** `cfg-configure.test.ts` "a clone with safety off takes the members...", `Configure.test.tsx` "CFG-11, CFG-12".
- Left out: the API's `/clones` description and docs page `configure/settings.md` ("its limits", "gets no connection ...") are in `packages/docs/content`, not edited. Lines for them: "With Safety on a clone gets no connection, data source, group member or secret value; with Safety off it gets this workspace's, resealed. OAuth connections are copied without their tokens: connect each again."

## CFG-13 Review and promote follows the saved target
- `Environments.tsx` `Promotion`: with a target chosen and not saved, the button is replaced by "Save the new target to review a promotion to it." **Test:** `Configure.test.tsx` "CFG-13".

## CFG-14 Already fixed (EXT-01, `b11e06e5`)
- `deploy.ts` `missingBindings` and `bundle-check.ts` already read a trigger source's `uses`. **Test:** `cfg-configure.test.ts` "a source's unbound connection and unset secret refuse the promotion" (passes on the code as it was).

## CFG-15 "Used by" includes groups and the workspace's default alert
- `kernel/references.ts`: target kind `connection_group` (`uses.connectionGroups`), and the workspace's `failure_alert` as uses by `{kind: "workspace", path: "settings"}`. **Test:** `cfg-configure.test.ts` "the workspace's default alert and a script's use of a group are listed".


## CFG-16 Uses still loading or unreadable are not "nothing"
- `kit/references.tsx` `useReferences` has `loaded`; `UsedBy` says "Reading…"; `RemoveButton` takes `usesUnread` and says what it does not know. Callers: connections, variables (cell only), secrets. **Test:** `Configure.test.tsx` "CFG-16".

## CFG-18 An alert names a connection that can post it
- `routes/workspaces.ts` PATCH refuses an unknown or non-HTTP `notify`; `bundle-check.ts` refuses `onFailure.notify` naming a non-HTTP connection of the bundle. **Test:** `cfg-configure.test.ts` "a missing connection and one that is not HTTP are refused".

## CFG-19 A provider's refusal never ends on JSON or a silent page
- `oauth.ts` says a connection removed on the way; the callback route turns any other failure into a redirect with a word. `App.tsx` `useOAuthReturn` says `oauth_error` (or "connected") anywhere but the Connections list, then clears it. **Tests:** `connections.test.ts` "a connection removed while the member was at the provider...", `Configure.test.tsx` "CFG-19".

## CFG-25 A webhook with its secret unset records which secret
- `triggers.ts`: `webhook_refusal.problem` is "The secret X is not set in this workspace."; the sender is told what it was. **Test:** `cfg-configure.test.ts` "the refusal kept for the operator names the secret".

## CFG-27, CFG-28 Texts
- `config-vars.ts` `EGRESS_ALLOW`, `errors.ts` `egress_refused` and `bindings_missing`, `kinds.ts` script `uses`: say what the guard covers (the control plane's own reach), and that production and promotion refuse while dev warns. `schemas/` regenerated. No test beyond the generated checks.
- Left out: `packages/docs/content` `variables.md`, `index.md` ("scripts and flows read variables": scripts and trigger sources do) and `settings.md`. Not edited.

## D10 A stored credential does not follow a changed address
- Git: `kernel/git.ts` `saveRepository` asks for the token again when the address is at another origin (`kernel/origin.ts` `sameOrigin`); `Git.tsx` says so before saving. **Test:** `git.test.ts` "a stored token does not follow a changed address to another host (D10)".
- Looked at and already covered: connections, group members, data sources (CFG-03, DAT-03), SSO (GOV-06). The other stored secrets (SCIM, webhook tokens, API keys, instance secrets) have no address.

## D42 A Test and an alert speak from the pool that can reach the connection (CFG-29)
- `tasks.ts` `poolOfConnection`: the pool of a script or trigger source that uses it (or names it in `onFailure.notify`). Used by `connection-tests`, `alert-tests`, and the alert of a failed run (the run's own pool). Flow runs have no pool: default. **Test:** `cfg-configure.test.ts` "a Test, a test alert and the alert of a failed run go to the pool of the script".

## Found at tier 1, now done
- Data sources list shows "Arrives with the next promotion" (`Data.tsx`); `?setup=<name>` opens the make form on Variables, Secrets and Data sources (`ListScreen` `setupField`; `RefusalList` links carry it). DeployMenu's refusal is a dialog with the list and a way to Review all drafts. **Tests:** `Configure.test.tsx` "?setup= opens...", "deploying one change...".

## Screens to walk (Fernhill throwaway instance, 1440/768/390, light/dark, keyboard, reload)
Connections (draft tag, Set up an OAuth connection, ?item=), a connection's page (Change, Test, Reconnect), Connection groups with a leftover group, Variables/Secrets/Data sources with `?setup=`, a refused promotion's Set up links, DeployMenu's refusal dialog, clone with Safety off, Workspace settings with an unsaved target, `/?oauth_error=x`, Repository after changing the address. **Not walked: no browser run in this lane.**

Polish gate answers (states, lifecycle, keyboard, copy): states of each list cell are pending/failed/none/some (CFG-16); the leftover group lifecycle ends at Remove (D46); every new sheet and dialog is the existing wizard, sheet or confirm (focus and Escape as they are); copy says what is missing and who can give it.

## Found
- The data source page has no Change/Test beside its list row (the connection page now has them).
- `environments.test.ts` "database locations ... removes it" timed out at 30 s while the machine was loaded; not touched by this lane.
