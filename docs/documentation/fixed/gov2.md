# Fixed: lane gov2 (tier 2)

Tests: `apps/control-plane/src/sso-governance2.test.ts` (new), `managed-workers-state.test.ts` (new), `export-not-carried.test.ts` (new), `apps.test.ts` (one step made to test the name), console `Account`, `SingleSignOn`, `Provisioning`, `Audit`, `Portal`, `Retention`, `Workers` (new) tests, `packages/ui/src/contrast.test.ts`, `packages/manifest/src/permissions.test.ts`. Every test was seen failing for the reason in the row before its fix. One migration: `packages/db/migrations/0093_gov2_record_gone.sql`, not locked.

Refuted: none. Left: none. Already done in tier 1: D12 (see below).

## GOV-12, D18 (aed172a3)
- A wrong password with a recovery code still spends the code (D18: kept). `SignIn.tsx`: the hint says "It works once, even if the password is wrong", and a 401 while using a code says the code was used up by this try. Test: "a wrong password with a recovery code says the code is spent". Siblings: the 403 branch (wrong code) already said "works once".
- Screens: sign-in, Use a recovery code, wrong password.

## GOV-13, GOV-15 (5f02d278)
- `providers.ts`: removed the `secret_needed` check in `checkCanEnable`; `clientSecret: null` clears a stored secret (`updateProvider`, route schema in `routes/sso.ts`). A changed issuer origin on a provider that is on and holds a secret still answers 409 `secret_needed` (that secret was for the old origin). `oidc.ts` `configurationOf`: on "does not match the expected issuer" it tries the issuer with the closing slash toggled; the stored issuer stays without it. Console Settings: "Remove the stored client secret" checkbox. Tests: "a public client, with no secret, can be turned on", "an issuer that publishes a trailing slash connects, typed either way"; console "a stored client secret can be removed".
- Siblings: SAML has no secret; the connect sheet's hint already said public clients are allowed.

## GOV-14, GOV-18, GOV-19, GOV-21 (4f4579ee)
- `SingleSignOn.tsx`: Scopes keeps the typed text and splits on save. Attributes split at the first `=`; a line not whole is shown ("Line 2 is not complete") and nothing is saved. Group mappings: a row with one half is shown as an error and not saved. Mappings with `managedBy: "release"` are drawn read only with a link to `/t/<id>/releases`, and are not sent back. Adding a domain says "Prove it is yours" only when a record came back unproved. Server: `GroupMapView.managedBy`. Tests: console `SingleSignOn.test.tsx` (five); server "a group mapping an access release made".
- Siblings: the existing group mapping test encoded the bug ("a row with no group is left out") and was changed.

## GOV-16 (954b71d1)
- New `kit/useOpenRow.ts`: what a save answered is shown until the list is read again after it. Used by `SingleSignOn.tsx` and `Domains.tsx`, the only two `fresh` copies. Test: "after an edit, removing the last domain turns the header off with the provider". The first SSO test's mock list now follows the provider, as the server does.

## GOV-17, GOV-27 (69994e73)
- `Audit.tsx`: a counter ignores an answer to a first page that is no longer the latest, and an older page when the filters changed. The area list holds every area a literal action name starts with, and the instance log gets its own list. Tests: "an answer to a filter that is no longer the one asked is not shown", "every action the server writes by a literal name has an area" (reads the control plane's source), "the instance's log offers the instance's areas". The only other hand-written `load` is the command palette's, which has cancel.
- Left out: actions written through a template (`${x}.created`) are not seen by the test; the typed registry of phase 30 M9 is the real source.

## GOV-22 (7f622def)
- `packages/ui/src/contrast.ts`: `parseColor` reads names, `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `transparent`; `contrastRatio(ink, ground, page)` lays a faint color over its ground. `ContrastCheck` (Branding) says which pairs it could not read and why. `readableOn` (Badge) now treats the color as the ground. Tests: ui "any CSS color is read...", console "the contrast check reads any color, and says which pairs it could not check". Instance branding has no contrast check; nothing else called `contrastRatio` but `Badge`.

## GOV-23 (b741cfc2)
- `/managed-workers` has a new state `unavailable` (the tenant has the switch on, the instance starts none). `Execution.tsx` words the line from the state and reloads it after the switch. Tests: `managed-workers-state.test.ts`, `Workers.test.tsx`.

## GOV-24, GOV-25, D45 (d9347032)
- `hosts.ts` `turnedOff`, used in `front.ts`'s first hook: a registered, proved, disabled hostname answers 404 "not served here" for pages (its `/api` check address still answers); an unproved one is left as it was, and the words say so. Migration: `record_gone_at` on `app_domain` and `identity_domain`. A check that misses the record of a verified name keeps `verified_at`, sets `record_gone_at` once, audits `app_domain.record_gone` / `identity_domain.record_gone` once, and a found record clears it. Nothing is stopped (D45). Domains and SSO Domains show "Verified, record gone" and since when. Tests: "a proved one is not served...", "a hostname keeps its first date...", "an email domain of a provider does the same", console Portal and SingleSignOn.
- Left out: the summary's "domains to fix" count does not count a gone record.

## GOV-26, GOV-29 (8988f407)
- Retention: the audit log has its own sentences in the page and the confirmation (hidden at once, leaves with its month, returns if lengthened). Worker permission words no longer claim the managed-workers switch. Tests: Retention "GOV-26", manifest "Workers: write does not claim...".

## GOV-28 (5732a6d1)
- Provisioning tokens table: Expires and Status columns. Test: "a token says when it expires, and an expired one does not look live".

## GOV-30 (0e1cb5de)
- `export.ts` `NOT_CARRIED_BY_TABLE`; test fails when a table left out is not named. New lines: provisioning tokens, refused pushes, webhook refusals, health checks, sign-ins in progress, approval links, promotion requests, workspace copies, members' saved views and recents, recovery codes, the audit log's cut. Retention settings already travel (`tenant_retention` is "always"). `docs/contracts/tenant-export.md` row updated.

## D12
- Done in tier 1 (the Turn off confirmation says "A directory that pushes people to it keeps pushing while it is off"); this lane added the assertion to the console test.

## apps.test.ts
- "another tenant cannot take the name" passed on a 400 for a workspace that was not the other tenant's. It now makes a workspace for that tenant, registers the name (201, a different record), shows it cannot be enabled (409 `domain_not_verified`), and keeps the old missing-workspace check apart.

## Found
- The tenant overview first-run step and `summary.ts` still say "The instance starts workers for this tenant" from the switch alone (same untruth as GOV-23, `Overview.tsx:189`).
- SSO provider's PATCH description and `docs/contracts` do not mention `clientSecret: null`.

## Screens to walk
Sign-in with a recovery code; Single sign-on: connect, Settings (scopes, attributes, remove secret), Groups (release rows), Domains (instance and tenant); Domains (hostname details, proved off, record gone); Audit (area list, tenant and instance); Branding contrast check with named, hsl and rgba colors; Workers line; Provisioning tokens; Retention confirmation. Polish gate for each: states (empty, gone, error) drawn above; lifecycle covered (remove secret, clear flags); keyboard: all new controls are native buttons/checkboxes/links; copy plain.

## Changelog and docs lines
- A public OIDC client can be turned on, and a stored secret removed. An issuer that publishes a closing slash connects.
- A proved hostname that is turned off serves nothing. A verified name whose record is gone is shown with the first date and since when, and audited.
- Tenant export lists everything it leaves out.
- The audit area list holds every area; the contrast check reads any CSS color.
