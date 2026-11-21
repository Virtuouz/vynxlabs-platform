# Decision 0006: one page model, read on the server, with no compatibility for the old bodies

Status: **accepted** by the owner, 2026-11-21 (phase 25 owner decisions 3 and 5). Built in phase 25.
Date: 2026-11-21.
Prompted by: the owner: "Old applications created using the current system do not have to be compatible … assume this feature as if it was being created from scratch, but naturally still work with the rest of Volvel. The same goes for dashboards."

## Summary

`interface` and `dashboard` bodies are replaced by one page shape (S9). Every widget's data is read by one server endpoint from the stored body. Bodies written before phase 25 are not read, upgraded or migrated: the examples are rewritten, member dashboards are cleared by a migration, and the upgrade code is deleted.

## Context

| Fact | Evidence |
|---|---|
| No instance of Volvel exists outside the owner's local ones and the Fly test instance | the owner, 2026-11-21 |
| Two bodies, two renderers, two editors, two data paths for one job | S9, Problem |
| Dashboards already carry an upgrade from interface pages (`upgradeDashboard`) | `packages/manifest/src/dashboard.ts:700-810` |
| Apps read rows and totals from the browser, sending the query shape; dashboards read on the server from the stored widget | `packages/screens/src/data.ts`, `routes/dashboards.ts:360-462` |
| Both enforce row policy the same way, through `withData` | `routes/data.ts:676`, `kernel/data/query/views.ts` |

## Decision

1. **One shape**, `packages/manifest/src/page.ts`. The kinds keep their names: an `interface` is pages, a `dashboard` is one page. `member_dashboard.body` is the dashboard body.
2. **Data is read by the server from the stored body** (S9, Reading data). The browser names a widget and the filter values. A served page can't be made to ask a question its builder didn't write.
3. **No compatibility.** A body without the new shape is refused at save and at deploy with a problem that says so. The examples (`fernhill`, `acme`, `higher-ed-devices`) are rewritten; a migration deletes `member_dashboard`, `dashboard_share` and `dashboard_widget_query` rows; `upgradeDashboard`, `isOldDashboard`, `placeWidgets` and the `interface.ts` checks are deleted; the tenant export's member-dashboard body is documented anew (`docs/contracts/tenant-export.md`).
4. **The Fly test instance** is redeployed from the rewritten Fernhill after phase 25; its old interface and dashboards are removed by that deploy (an example deploy deletes what the repository lacks).

## Consequences

- Phase 25 deletes more than it adds in `apps/console/src/screens/dashboards` and `builder`.
- Saved queries keep working: they are read by `{ query }` inputs, and the widget-query bookkeeping (`dashboard_widget_query`, used when a query is renamed or removed) is kept for both kinds.
- Anyone with a local instance on an older body re-runs Fernhill's setup.

## Alternatives

- **Upgrade old bodies on read**, as dashboards did in phase 18. Owed to nobody, and it would keep two models alive in the code.
- **Keep apps reading from the browser.** It works for end users today, but it lets the browser choose the question, and it would keep two data paths.
