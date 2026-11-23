# Phase 30 lane e2efix

Two faults the phase's full e2e run left.

## 1. Help search did not list the Approvals screen page (documentation.spec.ts:181)

Cause: ranking marked every page under a `reference` folder down (x0.6), and the written screen
pages moved there in M6; and the server answered 8 pages where the panel shows 12.

- `packages/docs-engine/src/search-query.ts`: a page carries `generated` ("1"/"0") in the index.
  Where the set says it, generated pages sort after every written page unless the query is their
  exact title or a heading; written reference keeps full weight. A set that does not say (tenant
  sites, older indexes) keeps the old x0.6 reference rule. `RESULT_LIMIT` (12) is the one limit:
  the server's default for `grouped` (`_search.json`) now equals what the panel shows.
- `packages/docs-engine/src/search.ts`, `output.ts`: `generated` option, passed through.
- `packages/docs/build.mjs`: generated = pages not in `written` (from `loadDocs`).
- Tests (`search.test.ts`): a written screen page outranks a generated page that says the word
  more often (failed before: the generated page was first), a generated page is first when typed
  by title, `grouped` returns `RESULT_LIMIT` pages.
- `e2e/documentation.spec.ts`: result matched by `^Approvals` (names now continue with the folder).

## 2. Record detail's Fields list lost `number` (phase-28.spec.ts:945)

Cause: TAB-30 (columns in definition order) made `number` the table's first text column, so
`displayGuess` chose it as the sheet's heading; `detailWidget` left the heading (and status) out
of `fields`, so it was not in the list. Before, the heading was `client_code` and `number` was
listed by accident.

- `apps/console/src/screens/builder/records.ts` (`detailWidget`): the heading and status columns
  are in `fields`, `hidden: true` (drawn once above, there to show again). Every column listed.
- Test `apps/console/src/sheet-and-starts.test.ts` ("a new detail lists every column"): failed first.
- The instance on 8080 runs the old build, so e2e for item 2 is proven by the unit test only.
