# Fixed: lane host

## HOST-01, HOST-02 Restored databases show every table, under any database name

- **Commit:** "Phase 29: a restored database reads every table, under any name (HOST-01, HOST-02)".
- **Changed:** `packages/db/src/datastore.ts` (`POLICY_NAMES`, the one list; `setUp` hands every policy name to the new role, not only `rows`); `packages/db/src/index.ts` exports it; `apps/control-plane/src/kernel/data/apply.ts` (`upgradePolicies`) also finds every active table with no policy for the store's role, turns row security on and compiles its policy again from `data_table.policy`; it uses the shared `POLICY_NAMES`.
- **Tests:** `data.test.ts` "tables restored without their policies (HOST-01)" (runs in both platform and dedicated mode); `datastore.test.ts` "row policies of every shape are handed to the new sign-in (HOST-02)". Both fail without the fix. Real drill (docker exec `pg_dump --no-owner` and `psql`, databases `p29_host_dedicated` and `p29_host_renamed`, dropped after): a tenant on a dedicated database with open, owner and rules tables, one row each, dumped, database and `vxd_` role dropped, restored; before: 0, 0, 0 rows and 403 on insert; after: 1, 1, 1 and 201, same name and a new name. The drill script is not in the suite (it needs `docker`).
- **Siblings:** dedicated databases (same `#upgraded` path on `connect` and `platform`), tenant import (`restoreRules` calls `setPolicy` with the new role: right), clone (same). The setting `policy` of a retired table stays unmade by design.
- **A person sees:** after a `pg_dump` restore the instance reads and writes its tables again at the first start; a log line "row policies now read the signed claim" counts them.
- **Left for the writing phase:** a drill in `docs/self-hosting.md` (`--no-owner`, restore, start). D59 says `pg_dump` is a backup once this is fixed: it is.
