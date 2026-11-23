# Fixed by lane t3-instance (tier 3)

Items: INS-MP3, 4, 5, 7, 9, 10, 11, 12; HOST-MP2, 3/4, 5, 7. Each test was seen failing before its change.

## INS-MP5, INS-MP10 (read-only state; `volvel instance triggers`)
- **INS-MP5.** New `apps/console/src/kit/ReadOnly.tsx` (`useReadOnly`: `/readyz` every 30 s, true only when `checks.database.readOnly`; `ReadOnlyStrip`; `READ_ONLY_WORDS`). `Shell.tsx` draws the strip under the header on every screen. `kit/SaveBar.tsx` (every settings page's Save) and `ListScreen.tsx` `CreateDialog` (every create form) disable their action and say why (tooltip and visible line). CLI `status` (`packages/cli/src/cli.ts`) prints "Read only: ...".
- Tests: `ReadOnly.test.tsx` (three; failed with `useReadOnly` never true), `cli.test.ts` "status says when the database takes no writes".
- Siblings looked at: other buttons that save by themselves (inline editors, row actions) are not disabled; the server's 503 `read_only` refusal already says why in the toast. Left out: those buttons.
- Walk: any screen with the database made read only (fill a disk or `default_transaction_read_only`), at 390 px, light and dark; a settings page's Save bar; a Create dialog. States: strip appears within 30 s of the change and goes when writes return. Keyboard: Save is focusable only through its wrapper (tooltip). Copy: "The instance is read only. ..."
- **INS-MP10.** `volvel instance triggers [pause [--reason <text>]|resume]` (`cli.ts` `instanceCommand`, `commands.ts` new group "Run the instance"). Uses GET/PUT `/instance/triggers`, unchanged. Test: `cli.test.ts` "instance triggers pause and resume ...". Docs page of commands is drawn from `COMMANDS`; nothing in `packages/docs/content` edited.

## INS-MP3, INS-MP4 (= HOST-MP1), HOST-MP2 (Instance > Health)
- New screen `apps/console/src/screens/InstanceHealth.tsx` at `/instance/health` (`App.tsx`, `nav.ts` "Health", `e2e/polish-setup.ts`). Sections: Health (`/readyz` read directly because it answers 503 when something is down; database and object store, latency, "Takes no writes", version and migration level from `/instance`; asked every 15 s and by "Check again"), Master key (`GET /instance/master-key`: both fingerprints, what is still sealed with the second key by place, unopened values, "can be removed"), This replica's settings, Metrics (what `/api/v1/metrics` gives, token set or not, labels, OTLP).
- HOST-MP2 route: `GET /instance/settings` (`apps/control-plane/src/routes/instance-settings.ts`, `instance:read`; registered in `app.ts`). Mode, run slots, memory floor, workers max, pools, time limits, retention, mail (from address only), apps address (origin only), egress allow, trusted proxies, metrics token (set or not), OTLP (on or not). No secret.
- Tests: `instance-settings.test.ts` (404 before the route), `InstanceHealth.test.tsx` (three: health with version, key, replica, metrics; not ready and read only; second key removable).
- Siblings: `/instance/databases` (locations) is not changed. Help topic: the screen uses `instance-databases` because a topic of its own would be a new file in `packages/docs/content`, not mine to edit: the docs lane should add `instance-health` and point `nav.ts` at it.
- Left out: "a standalone worker's settings" are not on this screen (a worker is another process; HOST-MP7).
- Walk: Instance > Health at 1440/768/390, light and dark, keyboard (Check again), reload; with the database down (stop it) and with a second key set (`rekey` mid-way). States: loading, each section's error with Try again, not ready, read only.

## INS-MP7 (an operator's powers on a tenant, without a grant)
- `apps/console/src/screens/TenantPowers.tsx` (new), drawn by the tenant inspector in `Tenants.tsx` for operators only: "Workers the instance starts" (PATCH `/tenants/:t` `managedWorkers`; an operator's off locks it, as D16 says; said in the words) and "History kept" (the effective days; "Change how long" opens a side sheet with `RetentionSettings`, which now takes `bare` so the page's own title is not drawn twice). No API changed: both routes already allow an operator at the instance.
- Test: `TenantScreens.test.tsx` "an operator turns workers off for a tenant and reads its retention from the list, with no grant (INS-MP7)".
- Siblings: the same switch stays on the tenant's Workers screen and retention on its Retention screen (same routes). Not added to the mobile list's row menu.
- Walk: Tenants, pick a row (inspector at 1440, dialog at 390), turn workers off and on, open the sheet, shorten a period (confirm), reload. Keyboard: both buttons and the sheet (Esc closes). Copy as written. Not signed in with a grant: no tenant data is shown.

## INS-MP9, INS-MP12 (locations: Edit and inspector; tenants by location)
- API, both additive: `PUT /instance/database-locations/:name` takes `connectionString` as optional: left out, only a registered name's `description` changes, nothing is connected to, audited `database_location.described`; an unknown name without an address is 400 saying so (`routes/locations.ts`). `GET /tenants?dataLocation=<name>` (`routes/tenants.ts`).
- Console: `Environments.tsx` `DatabaseLocations` is now a `ListCollection` with Edit (description; new address optional, "leave it empty to keep it") and an inspector (what it is for, database and host, status or its problem, "Tenants here" with links and a link to the tenant list). `Tenants.tsx`: "Tables kept in" select (operators, kept in the address as `?location=`), its own empty text, the inspector's location is a link to the location. `kit/ListCollection.tsx` takes `filters` (shared piece; other lists may use it).
- Tests: `environments.test.ts` "a location's description changes without its address ... (INS-MP9, INS-MP12)" (400 before); `Locations.test.tsx` (two).
- Siblings: other lists with an inspector (`InstanceMembers`, `Operators`) not changed. The Tenants "Tables kept in" column stays plain text so a click still opens the row.
- Left out: pointing a tenant at another location (an export and an import, as the API says).
- Walk: Instance > Database locations: Edit, inspector at 390 px (dialog), Remove still for an empty location; Tenants with the filter, reload keeps it, Back.

## INS-MP11 (a staged import after a reload)
- New route `GET /instance/tenant-imports/staged` (`routes/portability.ts`, `tenant:write`): every unexpired upload with the check it was given and `here` (false when another replica keeps the file). Console: `Environments.tsx` `WaitingUploads` on Import a tenant's first step: tenant or file name, size, kept until, Open (back to the check; type the passphrase again), Throw away (confirmed, audited `tenant_import.discarded`); an upload kept by another replica says so and offers only Throw away.
- Tests: `portability.test.ts` "an upload still waiting is listed after a reload ... (INS-MP11)" (404 before), `Environments.test.tsx` "an upload that waits is listed after a reload ...". An existing test now picks the check's URL by `/staged/`.
- Siblings: CLI `tenant import` does not stage. The check's passphrase is never stored, so Open shows "not checked yet" until typed.
- Walk: Import a tenant: upload, reload, Open, Throw away from the list; at 390 px; keyboard (Tab to Open/Throw away, Enter); copy as written.
