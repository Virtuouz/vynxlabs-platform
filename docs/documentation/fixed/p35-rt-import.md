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

## Round two

A reviewer found the schema guard of B8 let a cubic pattern through and that two other keywords were costly. Three commits.

### B8 again: `^a*a*a*b` took 27 s (high)

**The hole.** `patternProblem` allowed three unbounded repeats, so three adjacent `a*` (cubic) passed; ranges such as `a{1,4000}` were not counted; and 4096 characters of input was too long for even a quadratic. The expression guard (`kernel/flows/expressions.ts`) and the widget frame's guard (`packages/widget-sdk/src/schema.ts`) were copies of one shape, with the same blind spots (an unanchored pattern, a fork inside a group).

**Proof before.** `packages/manifest/src/pattern-guard.test.ts`: `^a*a*a*b` accepted and 12 s on the worst text.

**Fix.** One function, `patternProblem` in `packages/widget-sdk/src/pattern.ts` (exported as `@volvel/widgets/pattern`), used by all three: the manifest's guard imports it, the widget frame's check imports it, and the expression worker is built from `patternProblem.toString()` (so it must stay one self-contained function; the comment says so). Its rule: refuse a repeated group, back reference, look-around, more than four optional atoms, a pattern whose choices (`|`) can be divided more than 4,096 ways (the branches of a group add, groups in a row multiply; the zod date-time pattern the examples use is 40), and more than eight repeats. The new part: two repeats that can take the same text, with nothing required between them that one of them cannot take, are an "overlapping pair"; more than one such pair is refused. Whether two atoms overlap is decided by trying a spread of about 4,500 characters on each. A range counts as a repeat. A pattern not anchored with `^` gets an implicit repeat in front. An optional group that starts with a plain atom (an ISO timestamp's `(?:\.\d+)?`) is let through. The most text a pattern is run on is 1024 characters on the server (was 4096), 256 in the widget frame, and 1024 in expressions (new: a longer text is refused).

**Test.** In each of the three: a list of 29 nasty candidates (nested and adjacent repeats, ranges, forks with a shared start, optional chains) and, for each the guard accepts, the worst texts of the longest allowed length, each under 100 ms: `pattern-guard.test.ts`, `packages/widget-sdk/src/pattern.test.ts`, `kernel/flows/expressions-patterns.test.ts`. Also in each: the harmless shapes still work (`^[a-z0-9-]+$`, `^[A-Z]{2}\d{6}$`, the email-like one, the ISO date, the examples' UUID pattern and `^S\d{7}$`). I also ran a throwaway fuzz of about 11,000 random accepted patterns against the worst texts at 1024: the slowest was 17 ms (not kept in the repo). Commits `a4b4e373`, `423286bb`.

**Left.** The overlap test samples characters, so two atoms that share only an unsampled character are taken as apart; the cost is then still at most quadratic times a small constant. A tenant pattern that needs more than one overlapping pair, or text over 1024 characters, is refused. The other two copies of the rule are now this one: a change goes in `pattern.ts` only.

### B8 again: `uniqueItems` and a schema's size (high / medium)

**The hole.** `uniqueItems` on 20,000 distinct objects took 9 s; compiling a schema of 20,000 properties took 5 s; neither was bounded at upload or at run time.

**Proof before.** `schema-safety.test.ts` "a uniqueItems on many objects, a schema of many properties and a huge value cost nothing": the 20,000-property schema took 1.8 s.

**Fix.** `packages/manifest/src/pattern-guard.ts`: `schemaProblem` refuses a tenant schema that is over **256 KiB** as JSON, over **5,000 parts** (objects, lists, values), or has `uniqueItems` over items whose `type` is not string, number, integer, boolean or null (a list of objects, or of no said type). `validateJson` (tenant schemas, not `own`) turns that into an issue and does not compile; `jsonSchemaProblem` returns it; the bundle upload check (`bundle-check.ts`, script, connector and flow bodies) names it with `schemaCostProblems`; a schema a worker derives from code (`authoring.ts` `acceptable`) is dropped. A value checked against a tenant schema may hold at most **100,000 values** (`MAX_VALUE_NODES`): a run's input was bounded only by the request body (1 MiB), which holds hundreds of thousands of small values. Platform-own schemas (`own = true`) are not held to these. Commit `f22c4fac`.

**Test.** `schema-safety.test.ts` (three new tests: the costs, upload naming, ordinary and own schemas unaffected).

**Left.** The reviewer's last case (30 `anyOf` branches by 30, over 2,000 items, with every error kept) was not proven and I did not try to prove it; the caps above bound the schema at 5,000 parts and the value at 100,000, not their product. If it is real the next step is to run validation of a tenant's schema in the expression worker's thread with a time limit, as expressions are.
