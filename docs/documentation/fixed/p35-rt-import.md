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

## Round three: patterns run on RE2

The owner's decision (2026-11-26): run tenant patterns on RE2 instead of refusing them by shape. The shape guard refused harmless patterns (`^(ab)+$`) and a pattern it refused in an already-deployed bundle never matched.

The engine. `re2js` 2.10.0, MIT, a JavaScript port of RE2/J with no native part and no dependency of its own. `pnpm view` reports last published 2026-11-10 and 20,433,484 downloads in the week 2026-11-19 to 2026-11-25. It runs in Node, in a worker thread and in a browser bundle. `re2` (node-re2) is native and covers only the server; `re2-wasm` was last published in 2022. Installed with `pnpm add re2js --filter @volvel/widgets`; the server packages reach it through `@volvel/widgets/pattern`.

Size. Built with Vite and minified, `re2js` is 182,812 bytes (49,989 gzipped), and `dist/pattern.js` with it 185,099 (50,858 gzipped). The widget frame's bundle (`@volvel/widgets/frame`) was 7.7 KB before (esbuild) and is 9.9 KB (Vite) with RE2 left out. That is over the 150 KB the brief allows, so **the widget frame keeps the shape guard** and RE2 runs on the server and in the flow expressions' thread. The guard moved to `packages/widget-sdk/src/pattern-shape.ts` (used only by `schema.ts`) with its tests, unchanged, and its limits (200 characters of pattern, 256 of text). The console's bundle grew by one chunk of about 147 KB (`LoadState`, 656,263 to 803,743 bytes) because the console imports `@volvel/manifest`, which is not tree-shaken; nothing in the console calls a pattern.

What changed.
- `packages/widget-sdk/src/pattern.ts` is now the engine: `compilePattern`, `matchPattern`, `patternProblem`, limits. It names a backreference, `\k<name>`, looking ahead and looking behind itself, and gives RE2's own message for anything else it cannot run. The shape guard is gone from it.
- Server schemas: Ajv's `code.regExp` is `re2RegExp` (`pattern-guard.ts`) for a tenant's schema; `own = true` keeps the built-in engine. A pattern RE2 does not run stops the compile with a `PatternError`; `validateJson` turns it into an issue, so a deployed bundle fails with the same words as the upload (`patternProblems`, `checkBundleManifests`). Text too long for the pattern fails the check with the limit named.
- Expressions: the thread no longer holds a copy of the guard as text. It imports `@volvel/widgets/pattern` (the URL goes in `workerData`, as the CEL library's does) and, while an expression runs, `RegExp` is a small class whose `test` calls `matchPattern`. The CEL library hides the reason behind "Invalid regular expression", so the thread sends the reason it kept.

Limits, decided. A pattern is at most 10,000 characters (the brief said 100,000; compiling 100,000 characters took 150 ms on the shared thread). RE2's time is the size of the compiled pattern times the length of the text, not the text alone: `[ab]{1000}` written 50 times took 71 s on 100,000 characters. So the text is at most 100,000 characters, and fewer for a large pattern: 2,000,000 divided by the compiled size (`a{1,1000}` is about 2,000 steps, so 1,000 characters). A compiled size over 20,000 is refused. RE2 itself refuses a repeat count over 1000 and nested counts that multiply past 1000, so `a{1,4000}` from the review is refused at upload with RE2's message, and `a{1,1000}` runs on text up to its limit.

The dialect, each point decided on purpose (also in the comment of `pattern.ts`).
- `u` flag: text is read as code points (`.` takes one emoji), as the flag does. `\p{L}`, `\p{Lu}` and `\p{Greek}` work; `\p{Script=Greek}` and other long forms are refused.
- `\d`, `\w`, `\b`: ASCII only, as in the browser. `\s`: only space, tab, line feed, form feed and carriage return; the browser also counts a no-break space and the Unicode spaces. Kept RE2's meaning rather than rewrite the class, so all three server places agree. `.` takes U+2028 and U+2029, which the browser's does not.
- `\uXXXX`, `\u{X}` and a written pair of surrogates are translated to RE2's `\x{X}`, in and out of a class, since zod and people write them. `\cX` is refused.
- Named groups: `(?<n>x)` and `(?P<n>x)` work; `\k<n>` is a backreference and is refused.
- Anchors: `^` and `$` are the start and end of the text (no multiline), as in the browser; `$` does not match before a final newline. `\A` and `\z` are accepted, and so are inline flags such as `(?i)`, which the browser refuses.
- Possessive quantifiers (`a++`) are refused; lazy ones work.

Tests (all new, none weakened).
- `packages/widget-sdk/src/pattern.test.ts`: the thirty patterns that froze the engine (`^a*a*a*b`, `(a+)+$`, `(a|aa)+$`, `^(a?){30}a{30}$`, nested and adjacent repeats, ranges) on the worst texts of 100,000 characters, each under 100 ms, and again at each pattern's own longest text; harmless shapes; the refusal messages; the dialect points.
- `packages/manifest/src/pattern-guard.test.ts`: the same list through `validateJson`; harmless shapes (`^(ab)+$`, email, UUID, zod's ISO date-time); backreference and lookahead refused at upload (`patternProblems`, `jsonSchemaProblem`, `checkBundleManifests` with the pointer) and failing the check in a deployed bundle with the same words; a table of 32 patterns and values where the server's check and the widget frame's give one answer, and the five shapes where the frame refuses and the server runs (`^(ab)+$`, `^(a?){3}b$`, `^([a-z]+-)*[a-z]+$`, `^a*a*a*b`, `^(a|aa)+$`).
- `apps/control-plane/src/kernel/flows/expressions-patterns.test.ts`: the list through `matches` in the thread, the limit, the harmless shapes, the two refusals.
- `packages/sdk/src/pattern-examples.test.ts`: every `pattern:` and `.regex(` in `examples/` compiles, and what zod writes for `z.uuid()`, `z.iso.datetime()`, `z.iso.date()` and `z.email()` tells good values from bad.

Existing tests changed because they asserted the old guard: `schema-safety.test.ts` (text over 4096 is refused: now over 100,000; `^(a+)+$` named at upload: now a backreference), `expressions-tenants.test.ts` (the bomb "is refused at once": now it answers `false` at once).

Docs. `develop/reference/scripts/define-script.md` ("Patterns in a schema"), `console/reference/flows/expressions.md` ("Patterns in `matches`"), the `matches` line of `flow-words.ts` (the generated Expressions page), and one sentence in `how-widgets-are-kept-safe.md` saying the page and the server differ.

Left. The widget frame still refuses by shape, so a widget refuses some patterns the server runs (the five above, and any pattern over 200 characters or text over 256). Other tenant-reachable `RegExp` uses were seen and not touched, as outside the three places: `packages/markup/src/validate.ts:259` (a markup prop's `pattern`) and `packages/docs-engine/src/schema.ts:258`; a reviewer should decide whether they take a tenant's text. The `Expressions` constructor's `EXPRESSION_PATTERN_INPUT` export is gone.

## Round four: an import brings no passwords unless the operator says so

**The hole.** The import made an instance-wide account for each member whose email had none, and gave it the password hash the archive held (`import.ts`, the loop over `members`). Whoever made the archive therefore knew a password of every account it created, and could sign in as that person if their email later joined another tenant or was made an operator. Member addresses from an archive also skipped the check every other route applies (`cleanEmail`; `format: "email"` and 254 characters on the members route).

**Proof before.** `portability.test.ts`, "p35 round four": the default import gave `members: { created: 2, linked: 1 }` with no count of passwords, and the new accounts signed in with the archive's password; the inspection had no `accountsToCreate`; an address of `not an address` produced no problem at inspection.

**The owner's decisions (2026-11-26) and the fix.**
1. By default an account the import creates has no password, no `member_account` row at all. Nothing else of a person's travels in an archive: sessions, recovery codes and the person's API keys are tables an export never carries (`NOT_CARRIED_BY_TABLE`, `INSTANCE_TABLES`), so no code was needed for them. Identity links are as B11 left them (a link may name only an account the export lists, or the account an exported member is matched to); not loosened. The person sets a password with a member password link (`kernel/member-reset.ts`), unchanged.
2. An account that already exists (matched by id or by email) was already skipped (`known`): the loop `continue`s before anything is written, so its password, keys and codes are never read from the archive. A test now pins this, with a recovery code and an API key on the existing account, with and without the option.
3. `keepSignIns` (query option on both import routes, `--keep-sign-ins` on `volvel tenant import`), off by default. On, the hash is carried as before, for accounts created only.
4. The inspection (`ImportInspection.accountsToCreate`, the staged route's `inspection`) says how many accounts the import would create. The command line prints it before asking: that they will have no password, or, with the flag, that they keep the password the export holds. Its closing report says how many accounts have no password.
5. Audit: the one `tenant.imported` entry (already written in the same transaction) now has `keepSignIns` and `members: { created, linked, withPassword, withoutPassword }`. It is in the tenant's own log, as before; no second entry was added.
6. Addresses: `readMembers` runs `cleanEmail` (trim, lower-case, one `@`, no white space, 320) and the members route's 254 limit on every member row, and puts the lower-cased address back before matching. A bad row refuses the archive at inspection (`problem`) and at import, with "member N (in members.0001.jsonl) has an address that is not an email address", before anything is written.

**Tests.** `portability.test.ts`: "by default the accounts it creates have no password, and a member password link gives one", "an account that is already here is not changed by the archive, by default", "the audit entry says the choice ...", "with keepSignIns the new accounts keep the password they had, and an account already here is still not changed", "the inspection says how many accounts the import would create", "an address in the archive that is not an address refuses it at inspection, naming the row", "an address with capitals and spaces ...". `packages/cli/src/tenant-move.test.ts`: the default says the accounts have no password and sends no `keepSignIns`; `--keep-sign-ins` reaches the route.

**Existing tests changed.** `portability.test.ts` "the import brings in everything the export lists" (now imports with `keepSignIns=true`, since that test is a move with its sign-ins, and expects the two new counts); `sso.test.ts` "its providers arrive paused ..." (imports with `keepSignIns=true`, then signs in as Alice with the archive's password). `apps.test.ts` "moving a tenant" was not changed: it signs in an end user, whose password the import still carries.

**Console.** `apps/console/src/screens/Environments.tsx` was not changed. The import still works from the console and has no control for the option, so it always brings no passwords. What it says after an import ("Members created: N. Members linked to accounts already here: M.") is still true, but it does not tell the person that the created members cannot sign in until they are sent a link. The smallest change, for the owner to decide: add one sentence to that notice, for example "Members created have no password: send each a link from Members." Not made, since a person sees it.

**Docs.** `self-host/how-to/instance/moving-a-tenant.md` (new section "Passwords do not come with the file", and the after-steps), `self-host/reference/console/import.md`, `develop/reference/command-line/flags-and-exit-codes.md`, and the command's line in `packages/cli/src/commands.ts`.

**Left.** The export screen's hint says the passphrase protects "the password of each member who belongs to this tenant alone": still true of the file, though an import now ignores those hashes by default. An export still carries the hashes sealed, so the choice stays open at import. Old staged uploads, inspected before this change, have no `accountsToCreate` (the field is optional in the response).
