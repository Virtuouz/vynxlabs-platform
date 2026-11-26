# p35-rt-import: tenant schemas and the tenant import

From the phase 35 red team, lane 15 (B8 to B11, C19). No migration was needed.

## B8: a tenant's JSON Schema was compiled in one shared Ajv

The hole. `validateJson` (`packages/manifest/src/registry.ts`) compiled every schema in one process-wide Ajv, at each run start, on the control plane's only thread. (a) A `pattern` such as `^(a+)+$` blocked the thread for every tenant. (b) Two schemas with the same `$id` collided, and the second threw on upload or run start. (c) A schema read again from the database is a new object each time, so the `WeakMap` never hit and Ajv kept every compiled validator.

Proof before. `packages/manifest/src/schema-safety.test.ts`: the pattern check took 2151 ms for 27 characters (the limit is 200 ms); `schema with key or id "https://tenant.example/input" already exists`; the cache count did not exist.

Fix.
- Each schema is compiled by an Ajv of its own, so no `$id` is visible to another schema. The compiled validators are kept in a list of at most 256, keyed by the schema's text (the same bundle and script give the same text, so they share one entry; the `$id` plays no part) and dropped oldest first.
- A pattern is run through `guardedRegExp` (`pattern-guard.ts`, the rules of the widget frame's `patternProblem`, with a longer pattern allowed): a pattern that repeats a group, refers back, looks around, or repeats freely never matches, and no pattern is run on a string over 4096 characters.
- `checkBundleManifests` refuses such a pattern in a script, connector or flow at upload, with its pointer.
- The platform's own schemas pass `own = true` (their patterns, such as paths, repeat a group and are safe). Call sites: `tenant.ts`, `routes/sources.ts`, `kernel/execution/bundles.ts`.

Siblings checked: every caller of `validateJson` (runs, flows engine and events, connectors, execution routes, oauth, authoring, bundle check). `jsonSchemaProblem` uses the guarded options. No re2 or similar is in the store, so none was added.

Left. A pattern that is dangerous without repeating a group (`(a|aa)+` is refused, but `a*a*a*a*b` is allowed up to 3 repeats on at most 4096 characters, a few milliseconds). Patterns inside `$ref`ed remote schemas are not reachable (Ajv has no loader). Cost of compiling: a few milliseconds once per schema.

## B9: a negative tar size, and a scrypt cost chosen by the archive

Hole. `tarIndex` read the size with `parseInt`, so `-1000` was accepted and the walk never advanced; `key.json` named its own scrypt cost, run synchronously.

Proof before. `kernel/tenancy/import-limits.test.ts`: `-1000` ran until the test's own 3 s stop; a cost of n=2^17, p=8 was run (1.6 s) instead of refused.

Fix. `tar.ts` takes only 1 to 11 octal digits for a size and refuses a size beyond what is left of the file. `crypto.ts` `scryptCostAllowed`: n a power of two of 2^15 or 2^16, r 1 to 8, p 1 or 2 (what an export writes, and at most twice it), checked in `importTenantKey` before scrypt runs.

## B10: a signed export edited down to format 1

Hole. A format 1 file has no signature, and the file says its own format.

Proof before. `portability.test.ts` "an export edited down to format 1, with a new admin in it, is refused": the import passed the signature step (it only failed later on a count the attack did not keep).

Fix, a decision: **format 1 is refused outright** (`EXPORT_FORMATS_READ = [2]`, the owner owes no back-compatibility); no option to allow it. `authenticate` no longer has an unsigned way out.

Existing tests changed because they encoded the hole: "an export in format 1 ... is still imported" now expects the refusal; the `altered()` helper signs again after its change (a passphrase holder can do that) and has an `unsigned` option for the attack; the inspection test that expected `formatVersion: 1, authenticated: false` expects format 2, true, and the refusal for the format 1 file. The console's "not signed" note (`Environments.tsx`) is now never shown for a staged file; it was left alone (no visible change).

## B11: an imported identity link naming any account

Hole. `identity_link` rows were loaded with no check on `principal_id`.

Proof before. "a link may not name an account the export does not list (B11)": 201.

Fix. In `import.ts` `validate`, a member link must name an id in `memberIds` (the archive's members, after those matched to accounts here by id or email are renamed, the existing rule), and an end user link an end user of the export. Otherwise the import is refused. Left: an archive member row that carries someone's email still ties to that account under the existing matching rule, and so can carry a link to it (an operator's act, as before).

## C19: an object key naming another tenant's object

Hole. Keys in the `stored` columns were checked only for `..`.

Proof before. "a row may not name another tenant's object, though the archive carries its bytes (C19)".

Fix. `ownKey` in `import.ts`: the key must be under `bundles/`, `files/`, `assets/` or `branding/` followed by this tenant's id, or under `runs/` or `flow-runs/` followed by a run or flow run of the export. Keys are not remade.
