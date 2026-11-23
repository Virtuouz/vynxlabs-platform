# Walk w-gov (t4-gov-docs)

Own tenant "wgov walk" (SAML members provider, SAML end-user provider, 230 member groups, 215 pushed people, a hostname, pools, credentials). Screenshots in `~/.local/share/volvel-walk/shots29/w-gov/`.

Right: GOV-33 Settings/Provisioning bar (appears, Discard, Ctrl+S, reload, Back asks); GOV-32 audit search (email/host, reload keeps q, 390/1440 light+dark); GOV-34 pushed Load more (200 then more); GOV-35 Domains Turn off and Workers switch (ask, Esc/Cancel change nothing, focus returns); GOV-36 command uses printf and --token-stdin; GOV-38 refusal text; DOC-13 no "More about" on Concepts terms; Retention save/confirm/field error.

Wrong:
1. Tab change inside a provider silently drops unsaved Settings, Groups or Provisioning edits (no dialog); Back does ask. Cause: tab switch not guarded, `screens/SingleSignOn.tsx:1498` (Tabs), `kit/SaveBar.tsx`. 1440 light, 390 dark.
2. Groups picker never narrows or caps (GOV-34): members route `control-plane/src/routes/tenants.ts:870` and `routes/endusers.ts:543` ignore `search` and `limit` (230 returned, "Showing the first" never drawn), and `onSearch` sets `filter: null` (`packages/ui/src/Combobox.tsx:106`). Typing "zzz" still lists everything. All widths. Shot `groups-search-1440-light.png`.
3. 390 px, SSO Settings with a change: save bar is not pinned; Discard/Save sit below the fold (y=802 of 800) until scrolled to the end. `kit/SaveBar.tsx:44`. `sso-settings-dirty-390-dark.png`. (Provisioning and Retention bars were fully visible.)
4. 390 px tables overlap text: Workers pool table ("never seen" over pool name), credentials table, Provisioning Tokens table (Revoke cut). `screens/Execution.tsx:1150,1245`, `screens/Provisioning.tsx:148`. `workers-list-390-light.png`, `prov-dirty-390-dark.png`.
5. After Load more (Enter) focus falls to body: button unmounts. `kit/paged.tsx:178`. 1440 and 768.
6. Concepts help copy says "organisation" (not American).
7. Minor: Disable button opens "Turn off" confirm; audit chip for hostname disabled reads DELETE; pushed rows show the email twice.

Not walked: GOV-31 (no paused imported provider to make), provider People paging (links need real sign-ins), GOV-37 read-only member (could not make a member with a read-only role), Domains enable-then-verified (no DNS offline), confirming the instance-wide "Run only on our own workers" (shared instance), the Help "More about" positive case (no term on another page found). Help panel does not reopen after reload (`?help` consumed).
