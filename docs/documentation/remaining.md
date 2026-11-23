# What lanes left: the final sweep of phase 29

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
