# Fixed by lane fix-narrow

No migration. No browser walk (the integrator walks). Tests were written with the fixes; the layout and class tests could not be seen failing in a real browser, only by the missing class or attribute they check.

## Shared pieces (POLISH-013)

- `apps/console/src/kit/DataTable.tsx` (table `style` with `--table-min-1/2/3`, classes `min-w-[var(--table-min-N)]`; data cells `[overflow-wrap:anywhere]`): the table keeps a width each shown column can be read in (7rem each, plus the check and actions columns) and scrolls sideways in its frame, so a cell cannot run under the next and an action column is not cut. Rows: w-configure 1-3, w-gov 4, w-operate 1, w-people 3, w-words 4-5. Test: `DataTable.test.tsx` "NARROW-1". Callers (22 screens use DataTable, and `<table>` elsewhere is only Roles, Overview, inspector, none touched): Connections, Variables, Secrets, Workers pools and credentials, Provisioning tokens, Runs, Account API keys and Sessions, AccessReleases, and every other list.
- `kit/health.tsx` (min-w removed), `kit/status.tsx` StatePill (`max-w-full`): a state's text truncates in its cell. Test: `kit/status.test.tsx` "NARROW-1". Used by every table with a state.
- `kit/SaveBar.tsx`: buttons take their own full-width row below 640 px, bottom safe-area padding. w-gov #3; the cause was not found by code (sticky bar looks right), so this is a best fix: re-walk. Test: `ReadOnly.test.tsx` "NARROW-2".
- `packages/ui/src/Button.tsx`: a loading button is `aria-disabled`, not `disabled`, so it keeps focus while it works (Check again, End other sessions, every `loading` button; clicks are swallowed). `Toast.test.tsx` updated. Tooltip wrapper no longer adds a tab stop for a loading button.
- `kit/paged.tsx` LoadMore: keeps its line after use and returns focus to the button or the line. Test: `kit/paged.test.tsx` "NARROW-3". Callers: every list that pages.
- `kit/SecretField.tsx`: Replace focuses the field; Keep, Remove focus each other. Test: `SecretFieldFocus.test.tsx`. Callers: every screen with a SecretField.
- `screens/Account.tsx` endOthers uses `keepPlace`; `screens/FlowStepFields.tsx` SchemaFields focuses the next field or Add a field after Remove. Tests in `Account.test.tsx`, `FlowEditorWalk.test.tsx`.
- `packages/ui/src/Combobox.tsx`: an option's hint wraps (platform event hints). Test: `dates-and-lists.test.tsx` "NARROW-4". Callers: every ComboboxField with hints.
- `router.tsx` `TEXT_LINK`: used for the failure handler's run (RunAlert, Runs), event links (RunAlert, Execution, ObjectPages). Test: `RunPage.test.tsx`.
- `help/HelpPanel.tsx` `tidyWords`: table pipes and rules become dots in found passages. Test: `help/tidy.test.ts`. (`Help.test.tsx` needs built docs; not run.)
- `screens/FlowEditor.tsx` `FIT.minZoom = 0.7`: the canvas is fitted but never smaller; a long flow is panned. Test: `FlowEditor.test.tsx` "NARROW-5".

## Screens to walk (390, 768, 1440, light and dark, keyboard)

Connections, Variables, Secrets (and Replace), Workers, Provisioning tokens and SSO settings (save bar), Runs, Run page, Account (API keys, Sessions), Access changes with help open, Instance health, a manual start's fields, any list with Load more, trigger event picker, flow canvas at 390/768.

## Found

- Other `loading` buttons that relied on `disabled` (a form submit): none failed in the console tests run.
