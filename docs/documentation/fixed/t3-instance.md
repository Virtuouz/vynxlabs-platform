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
