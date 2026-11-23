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
