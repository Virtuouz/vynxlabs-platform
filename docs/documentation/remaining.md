# What lanes left: the final sweep of phase 29

Two lanes share this list: `sweep-server` takes what is in the control plane, the CLI, the SDK and the worker, and the console screens that only show what it adds; `sweep-console` takes what is in the console's screens and the widget packages. An item that is both is the server lane's.

Each item was in a lane's brief and was not built, or was found by a lane. The final sweep builds them, or says why one cannot be (and asks the owner if that trims a decision).

- WID-M4, WID-M6, WID-M10, WID-M11 (findings/widgets.md, missing parts): not built by t3-widgets.
- Money in a condition's "is between", typed as a number; the builder header title has no typed count (t3-widgets).
- `PageEditor` and `NewPageDialog` do not use `useCatalog`'s error; `dates.ts` `localeOf` duplicates `readerLocale` (t3-widgets).
- Actions written through a template (`${x}.created`) are not seen by the audit area test (t2-govb): phase 30 M9 typed registry.
- An approval's title is not masked by value; the flow run list's `error` is masked only when stored; event-filter refusal messages may quote payload values (mask2).
- D47's second half: a deleted tenant's log read at the instance (INS-28) (ins2).
- The connections wizard's address-change notice for group members (cfg/WLK-17).
- `tenant.console_code`: an audited switch for an operator and a tenant admin (D17; SCR-16, EXT-10, REL-18).
- `volvel dev` for file apps, interfaces and docs (CLI missing part 7).
- WLK-09, WLK-11, WLK-15, WLK-17 items that t2-walk-* lanes do not finish (see their fixed files).
- The `DraftClash` in `ResourceEditor.tsx` has no "Copy what I wrote" (t2-walk-shell).
- A binding older than the 200 newest uploads still reads as its old kind (cfg2 limit; needs a column) (t2-walk-shell).
- A retired table's `managedIn` is always `code` from the server (t2-walk-data).
- `CreateDialog`s with no `done` still say "Created." (t2-walk-data).
- The manual start's input schema is a raw JSON box, and invalid text is lost when another step is chosen; "To fix" does not check that an approver group still exists (t3-flow-editor).
- The instance audit log has no CSV and no single-entry route; Recent does not remember apps, triggers and schedules (t3-account).
- The Health screen opens the help topic `instance-databases`; it needs its own (`instance-health`) once phase 31 writes the page (t3-instance).
- The script page does not show the settings added to the editor (SCR-08); the repository form cannot show the stored user name, which the API does not return (t3-config).
- Not a missing part, said in the phase: unpublishing an app made in the console needs a new field on the app kind (only docs apps have `published`) (t3-config).
- `volvel dev` for file apps, interfaces and docs (CLI-MP7): build it (the owner's "build them too"); Git sync ignores `entry`/`resources` in volvel.yaml (t3-cli-docs).
- Bring back does not restore a retired table's description; the filter language has no not-contains; the cell dialog leaves without motion (t3-tables).
- `objectHref("dashboard")` can open `dashboards/at/<path>`; the Changes list links a draft-only data source to an unbound page; a dashboard draft clash is a message, not DraftClash; Files borrows the help topic `data-tables` (t3-data).
- The flow editor's list shows one fault per step; `JsonView` would read user data shaped `{stored: "runs/….json"}` as kept apart (t2-walk-flow).
- `ACC-27`'s "others' operator grants" was not understood by its lane (t3-access).
- Queries offers Name and path and Remove draft to people who may not use them; See it as shows references by ID (t4-data).
