# Fixed by lane t3-instance (tier 3)

Items: INS-MP3, 4, 5, 7, 9, 10, 11, 12; HOST-MP2, 3/4, 5, 7. Each test was seen failing before its change.

## INS-MP5, INS-MP10 (read-only state; `volvel instance triggers`)
- **INS-MP5.** New `apps/console/src/kit/ReadOnly.tsx` (`useReadOnly`: `/readyz` every 30 s, true only when `checks.database.readOnly`; `ReadOnlyStrip`; `READ_ONLY_WORDS`). `Shell.tsx` draws the strip under the header on every screen. `kit/SaveBar.tsx` (every settings page's Save) and `ListScreen.tsx` `CreateDialog` (every create form) disable their action and say why (tooltip and visible line). CLI `status` (`packages/cli/src/cli.ts`) prints "Read only: ...".
- Tests: `ReadOnly.test.tsx` (three; failed with `useReadOnly` never true), `cli.test.ts` "status says when the database takes no writes".
- Siblings looked at: other buttons that save by themselves (inline editors, row actions) are not disabled; the server's 503 `read_only` refusal already says why in the toast. Left out: those buttons.
- Walk: any screen with the database made read only (fill a disk or `default_transaction_read_only`), at 390 px, light and dark; a settings page's Save bar; a Create dialog. States: strip appears within 30 s of the change and goes when writes return. Keyboard: Save is focusable only through its wrapper (tooltip). Copy: "The instance is read only. ..."
- **INS-MP10.** `volvel instance triggers [pause [--reason <text>]|resume]` (`cli.ts` `instanceCommand`, `commands.ts` new group "Run the instance"). Uses GET/PUT `/instance/triggers`, unchanged. Test: `cli.test.ts` "instance triggers pause and resume ...". Docs page of commands is drawn from `COMMANDS`; nothing in `packages/docs/content` edited.
