# Fixed: lane t2-sso (tier 2b)

Migration: none. Test: `apps/console/src/Environments.test.tsx`.

Already done before this lane (tests named in `fixed/gov2.md` and `fixed/walk1.md`): GOV-12/D18, GOV-13, GOV-14, GOV-15, GOV-16, GOV-18, GOV-19, GOV-28, WLK-12a (secret dropped is said), WLK-12b (a 403 says whom to ask, `api.ts` `ASK_FOR_ACCESS`), WLK-12c's pattern half (`fieldWords`), WLK-12d (`Instance.tsx`). Refuted: none.

## WLK-12c, the export passphrase
- `screens/Environments.tsx` `TenantExport`: the native `minLength={12}` is gone (it showed the browser's bubble). A passphrase under 12 characters shows "Use at least 12 characters." on the field once something is typed, disables Export tenant, and the submit does nothing. Test: "a short export passphrase is refused in words, not by the browser's bubble" (failed before: no alert).
- Siblings: no other console `minLength` outside `@volvel/ui` Form/SchemaForm, which use `noValidate` and word it themselves.
- Screens: Tenant, Export, at 390/1440, light and dark; type 5 characters, then 12; keyboard Tab and Enter; the hint below is unchanged.

## Found
- None.
