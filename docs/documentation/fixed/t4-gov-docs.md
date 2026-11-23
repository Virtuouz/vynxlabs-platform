# Fixed: lane t4-gov-docs (tier 4)

Migration: none.

## GOV-31
- Test failed before: `sso.test.ts` "its providers arrive paused and its domains unproved, until someone confirms them" (a rename answered 409 `domain_needed`, and a rename turned the provider on).
- `kernel/sso/providers.ts` `updateProvider`: `paused` clears only on `enabled: true` or a changed `config`; `checkCanEnable` skips a paused provider. `routes/sso.ts` PATCH description and `docs/contracts/tenant-export.md:86` say the same.
- Siblings: `createProvider` (new rows are not paused), SCIM push check (reads `paused`, unchanged), console notice `SingleSignOn.tsx:1232` ("then turn it on") is now true.
- A person sees: a renamed imported provider stays "paused"; its switch turns it on.

## GOV-32
- Test failed before: `kernel.test.ts` "it is searched on the server..." (an email in `q` found 0).
- `routes/identity.ts` `auditSelect`: `q` also matches the IDs of targets and actors whose `TARGET_NAMES` name holds the text (email, hostname, name). Used by the page, facets and export. Placeholder in `Audit.tsx:476` now "An action, name, email or host".
- Screens: Audit at 390/1440, light and dark; type an email, a hostname; reload keeps the search.

## GOV-38
- Test failed before: `summary.test.ts` "a pool is made, shown with what serves it..." (a pool called `default` answered 201).
- `kernel/execution/workers.ts` `assertPoolNameFree` (400, says why); used by `routes/pools.ts` (make a pool) and `routes/execution.ts` (a credential for a pool not made yet makes it, so it is the second way in).
- Siblings: scripts naming `worker: default` in a manifest were not changed (found: see Found).
- A person sees: "A pool cannot be called default: ..." in the new-pool form (shown by the console's error notice).

## Found
- A script that names pool `default` in its manifest is not refused; it would share the default queue. Not checked further.

## DOC-13
- Test failed before: `Help.test.tsx` "a term on the page that explains it does not offer to open that page (DOC-13)".
- `help/HelpPanel.tsx` `term` resolver gives no `href` for a term whose page is the one shown, so no "More about" is drawn (the served site already did this, `docs.ts`).
- Siblings: `help/glossary.tsx` (a workspace's own terms lead to handbook pages, never the shown help page); `DocServed` has its own exception.
- Screens: open Help on Start > Concepts, press a term; 390 px, light and dark; Escape closes the popover.

## GOV-35
- Tests failed before: `Portal.test.tsx` "turning a served hostname off says what stops, and asks first (GOV-35)"; `Workers.test.tsx` "turning the instance's workers off says what waits, and asks first (GOV-35)".
- `screens/Domains.tsx` Disable on an enabled hostname asks (names the hostname, says it stops answering and sign-ins end); `screens/Execution.tsx` "Run only on our own workers" asks, and says whether a credential serves the default pool (read from the default pool row) or that none does. Turning on asks nothing.
- Siblings: SSO provider off already asks; trigger pause and end-user disable ask; `Environments`/`Git` switches not touched.
- Screens: Domains detail > Disable; Workers > the switch; Escape and Cancel change nothing; 390 px; light and dark.

## GOV-36
- Test failed before: `Workers.test.tsx` "the worker command hands the credential on standard input, never on the command line (GOV-36)".
- `screens/Execution.tsx` credential sheet: `printf '%s\n' '<token>' | volvel-worker --url <url> --token-stdin` (printf is a shell builtin, so the credential is not in the process list); the table description says `--token-stdin`.
- Siblings: Hosts/compose file already done (HOST-27); `docs/self-hosting.md:184` already recommends it.

## GOV-33
- Tests failed before: `SingleSignOn.test.tsx` "settings and a group mapping left unsaved say so, and can be put back (GOV-33)"; `Provisioning.test.tsx` "how pushes are taken is chosen and saved together, from the save bar (GOV-33)".
- The shared `kit/SaveBar` now closes the three: `SingleSignOn.tsx` Settings (a snapshot of every field against the last saved one; Discard puts back the provider's values; the form still submits through `requestSubmit`, so required fields are checked as before) and Groups (the "Save mapping" button is the bar's Save), and `Provisioning.tsx` ("How pushes are taken"). Leaving asks, and Ctrl+S saves, as on Branding and Retention.
- Existing tests that pressed Save with nothing changed now change a field first (the bar is shown only when something differs). "Save mapping" is now "Save".
- Siblings looked at: Branding, Retention, InstanceBranding, Environments, KitSheet (already use SaveBar); Domains tab and tokens act at once and say so.
- Not done: field errors there are still one notice, not at the field.
- Screens: provider Settings, Groups and Provisioning at 390/768/1440, light and dark: change a field, bar appears, reload leaves nothing; leave with a change asks; Discard; Ctrl+S.

## GOV-34
- Tests failed before: `sso.test.ts` (links `limit=2` answered 3), `scim.test.ts` "what cannot be taken in is refused..." (pushed `limit=2` answered 3), console `SingleSignOn.test.tsx` "a list that stops at its limit says so, and goes on (GOV-34)" and "the people who signed in are paged, and say so (GOV-34)", `Provisioning.test.tsx` "people pushed past the first page say so and load on (GOV-34)".
- Routes: `GET .../identity-providers/:p/links` now takes `limit` and `cursor` and answers `nextCursor` (was a bare list cut at 1000); `GET .../provisioning/:p/pushed` takes the same and answers `nextCursor` for `people` (refusals unchanged). Default page 50, at most 200. API change, additive in shape. No bundle, schema or worker change.
- Console: People and People pushed use `usePagedList` / the same cursor with "Showing the first N people." and Load more (`kit/paged.tsx` `LoadMore`); the group picker in Groups is searched on the server (`?search=`) with "Showing the first N groups." and Load more, and keeps a group already chosen as an option when a search leaves it out (options are held stable, or the box resets what is typed).
- Siblings looked at: Members, End users, Operate events (already page); the role picker in Settings (`roles?limit=200`, workspace-less roles only) is still cut at 200 without saying: see Found.
- Screens: provider > Groups (Add a mapping, type in the picker), People, Provisioning > People pushed; 390 px; keyboard in the picker.

## Found
- The role picker in provider Settings (`SingleSignOn.tsx`, `roles?limit=200`) is cut at 200 roles without saying.

## GOV-37
- Tests failed before: `SingleSignOn.test.tsx` "a member who may only read single sign-on is told so, and nothing offers to change it (GOV-37)"; `Retention.test.tsx`, `Workers.test.tsx`, `Portal.test.tsx` (Domains), one each, same name ending (GOV-37). `OneTimeSecret.test.tsx` now expects the GOV-36 command.
- New shared piece `apps/console/src/kit/Can.tsx`: `useCan(base, permission)` (from `/me` for the instance; from `GET <tenant>/access/member/<me>` for a tenant, the route a member may read about themselves; says yes while not known or in an unexpected shape, because the server decides again), `NotAllowed` (the line: "You can see X, not change it. It needs `perm`. Ask ...", words from `askForAccess()`), and `Can` (the line plus a disabled `<fieldset className="contents">` round what is inside, the same tree either way).
- Applied: SingleSignOn (Connect a provider; the provider's Turn on/off, Require, Remove; the Set up, Domains, Groups, Settings, People and Provisioning tabs, so the tabs themselves stay readable) with `sso:write` or, for the instance's own, `instance:write`; Domains (`domain:write`: Add a hostname, and Remove, Disable and Check now in the detail); Workers (`worker:write`, the whole screen incl. credentials); Retention (`tenant:write`); tenant Branding (`portal:write`).
- Siblings, not done (each needs only the same one-line wrapper): Audit and Instance screens other than SSO (Instance branding, Workers' instance side, Triggers), tenant Members/Roles/Groups/End users screens (those belong to the access slice), Environments export/import, Portal end-user actions. A permission held only at one workspace counts as held (the access route lists it), so a control for a tenant-level action may show to someone the server then refuses; the server remains the judge.
- Screens: the same screens as a member with a read-only role (`sso:read`, `domain:read`, `worker:read`, `tenant:read`, `portal:read`) at 390/768/1440, light and dark; reload keeps it; Tab skips the disabled controls; owner and administrator see no line and nothing disabled.

## Found
- `kit/Can.tsx` `useCan` makes one more request per screen (`/me` is cached; the access route is read once per tenant and permission set).
