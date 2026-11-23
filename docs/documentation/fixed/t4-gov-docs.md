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
