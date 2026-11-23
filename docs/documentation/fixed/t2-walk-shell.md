# Fixed: lane t2-walk-shell

Paths: `C/` = `apps/console/src/`. Each test was seen failing before its fix.

## WLK-17a Connections at 390 and 768
`C/kit/DataTable.tsx:471` (and `packages/ui/src/Table.tsx`) headers `whitespace-nowrap`; `C/kit/health.tsx` `HealthCell` min width 9rem; `C/kit/references.tsx` `UsedBy` is an inline block of min 9rem; `C/screens/Execution.tsx` Kind cell does not wrap. Test `WLK-17a` in `C/Connections.test.tsx` (classes: jsdom has no layout). Siblings: every `DataTable` and `Table` header; `HealthCell` also draws Data sources' health; `UsedBy` is in Variables, Secrets, Data sources. Seen: "Failed" and "Used by" keep their words, the table scrolls sideways instead of overlapping. Walk: Connections at 390 and 768, light and dark, with a failed Test. Gate: states unchanged; keyboard unchanged.
