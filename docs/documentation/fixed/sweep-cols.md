# Fixed: lane sweep-cols (the final sweep, rows that need a column)

Branch `p29-sweep-cols`. One migration, `0096_sweep_cols_kept_kinds.sql` (named after the highest number; `pnpm lock:migrations` was run): `connection_binding.connector` and `data_table.managed_in`, both nullable text, both also in the dedicated-store catalog (`packages/db/src/datastore.ts`). No kind schema, bundle or route shape changed.

## cfg2 / t2-walk-shell: a binding older than the 200 newest uploads is read as its kind
- The kind is stored with the binding: `bindConnection` takes `connector` (`kernel/execution/bindings.ts`); the bind route stores what `declarationOf` finds (`routes/execution.ts`, split out of `configSchemaOf`); a deploy writes the declared connector onto the bound path (`kernel/execution/deploy.ts`); a clone copies it (`kernel/tenancy/clone.ts`). The list reads declaration, then the stored connector, then the old HTTP/unknown guess.
- Test: `cfg-configure.test.ts` "a connection keeps the connector it was bound as, however many uploads came after" (205 uploads; seen failing).
- Siblings: connection groups' leftover list still reads uploads (members carry no connector column); a binding made before this migration has no stored kind until it is bound or its declaration is deployed again.

## t2-walk-data: a retired table's `managedIn`
- `retireTable` stores `managed_in` from the removed resource's ownership (`AppliedResource.ownership`, set by `deleteResource`); `GET tables` and `GET tables/*` read it for a retired table (`routes/data.ts`). Retired before the migration: still `code`.
- Console (`screens/Data.tsx`): the list shows Repository or Console for a retired table too; its page says "Was managed in the ...". A retired console table now shows Bring back (the control was keyed on `managedIn`, which was always `code`).
- Tests: `data.test.ts` "a retired table keeps where it was managed..." (seen failing), `Data.test.tsx` WLK-09b (seen failing with the console change reversed).
- Screens to walk: Tables list with a retired console table; its page (Bring back, Purge) at 390 px, light and dark.
