# Fixed: lane cfg

Commits are on branch `p29-cfg`. No migration. No contract change (no kind schema, bundle format or worker route).

## CFG-01 A credential stays readable after a rename, a promotion or a clone
- **Commit:** "a credential is sealed to its row ..."
- **What changed:** `apps/control-plane/src/kernel/execution/sealed.ts` (new): `sealRow`/`openRow`. A connection's credential, its OAuth tokens, a group member's credential and a data source's password are sealed under the ID of their row, not under the path. A row sealed under a path (every existing one) opens under the path it has or any path its resource had (`resource_version`, `resource_alias`), and is sealed again at once. A credential nothing opens answers 422 `connection_unusable` ("cannot be read ... enter it again"), and saving without retyping it is refused the same way. Used in `bindings.ts` (`bindConnection`, `bindGroupMember`, `readConnection`, `readGroupMember`), `oauth.ts` (`oauthBinding`, `storeTokens`, refresh), `data/sources.ts` (`bindSource`, `openSource`, new `readSourcePassword`), `tenancy/clone.ts`.
- **Test:** `src/seal-rename.test.ts`: "a credential is read after a rename, a swap, a rename back and a clone", "a row sealed under its path before ... is sealed again", "a credential no name opens is said in words ...". `connections.test.ts` helper `expireIn` now uses the new helpers.
- **Siblings looked at:** webhook tokens (`triggers.ts`) are sealed by resource ID: not affected. Git and SSO secrets are not path-bound. OAuth state is sealed by state ID. Group members sealed by group path and key: handled. `renames.test.ts` still passes.
- **Left out:** OAuth tokens have no test of their own (same helper, covered by `connections.test.ts` refresh tests).

## CFG-03 A stored credential does not follow a changed address (D10)
- `bindings.ts` `addressChanged` (origin of `baseUrl`/`url`/`endpoint`, whole `tokenUrl`/`authorizeUrl`, `host`, `port`): a save that changes it without a credential drops the stored one (and an OAuth connection's tokens). Same in `bindGroupMember` and `bindSource`. Both return `credentialDropped`.
- **Test:** `seal-rename.test.ts` "another origin without a credential drops it; the same origin keeps it", "a data source pointed at another host drops its password".
- Console: `ConnectionWizard.tsx` says so before saving; `GroupMemberSheet.tsx` hint.

## OPS-09, CFG-17 A renamed connection keeps the workspace's alert
- `kernel/rename.ts` `renamePathState` rewrites `workspace.failure_alert.notify` and `.script`. **Test:** `seal-rename.test.ts` "renaming the connection renames what the alert points at". Per-script `onFailure.notify` is in the bundle body and follows the bundle.

## REL-05 Clone keeps key, title and meta
- `tenancy/clone.ts` selects and passes `key`, `title`, `meta`. **Test:** "the clone's row equals the source's". `adoptBundle` copies the stored bundle, whose manifests carry key and meta: not changed.

## CFG-02 A redirect to another origin sends nothing there (D11)
- `packages/sdk/src/http.ts`: redirects followed by hand, at most 5, each checked against the connection's origin; another origin throws naming it. A caller's header of another case no longer joins the connection's. `oauth2`, `core/http-request` and alert delivery all use `httpConnector`. **Test:** `packages/sdk/src/http.test.ts`.

## CFG-04 Production is set up for what a promotion brings (D23)
- `kernel/execution/arriving.ts`: manifests of the active bundles of workspaces linked to this one. `routes/execution.ts`: `configSchemaOf` (so SMTP, OAuth and custom connectors are checked as what they are), connection list (`arrives`, connector and schema from the arriving bundle), variable list (`arrives`); `routes/sources.ts` data source list (`arrives`).
- Console: `kit/RefusalList.tsx` is the one refusal list, used by Release (deploy and promote), Environments, request review (`Promotion.tsx`), each entry with a "Set up" link into production (`/connections?setup=<path>`, variables, secrets, sources). Connections lists arriving ones tagged "Arrives with the next promotion"; in production the wizard never offers a new connection or drafts. Variables lists them, and "Set variable" offers them.
- **Tests:** `src/arriving.test.ts` (promote refused, set up smtp connection, variable and source by API, promote succeeds); `console/src/Connections.test.tsx` "production lists what the next promotion brings ...". `execution.test.ts` updated for `arrives`.
- **Left out:** the data source screen (`Tenant.tsx` sources tab) does not yet show the "arrives" tag, and `?setup=` is only read by Connections. Secrets are already settable in production. DeployMenu text still prints refusals as a sentence.

## CFG-09 A group member is edited with its connector's own form
- `screens/GroupMemberSheet.tsx` (SchemaForm of the group's `configSchema`, `SecretField`) replaces the HTTP-only dialog; each member row has Change, which opens with what it holds (auth and headers kept). **Test:** `console/src/ConnectionGroups.test.tsx`.

## Screens to walk (Fernhill throwaway instance, 1440/768/390, light/dark, keyboard, reload)
Connections in dev and in production (arriving tag, "Set up a connection", `?setup=`), refused promotion preview in Release, Environments and request review (Set up links), Variables in production, Connection groups (Add a member for SMTP and HTTP groups, Change), wizard address-change notice. Not walked: no browser run in this lane.

## Found
- `Tenant.tsx` sources tab and data-source wizard do not show "arrives" yet (see CFG-04 left out).
- Stashes: `git stash` was used twice in this worktree (stash and pop of my own changes, to check that tests fail before the fix); both popped. `git stash list` shows only other lanes' entries.
