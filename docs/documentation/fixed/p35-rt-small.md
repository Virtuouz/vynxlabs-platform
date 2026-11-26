# p35-rt-small: expressions, egress and small items

Findings of the phase 35 review, each shown by a test that failed on the code before the change.

## B13 (RT-12-1): one tenant's slow expressions failed every tenant's

- **The hole.** Every tenant's expressions ran on one thread, and all of them were handed to it at once. A slow regular expression (`'aaaa...!'.matches('^(a+)+$')`, reachable by anyone with `flow_run:read` through the expression preview route) held the thread for the 250 ms limit, the thread was rebuilt, and so on down the line. An expression that had waited 15 seconds without starting made the patience timer fail every waiting expression of every tenant ("the evaluator did not respond"); a thread that ran out of memory did the same.
- **Proof before.** `kernel/flows/expressions-tenants.test.ts`: 200 slow expressions of tenant `a`, then a plain one of tenant `b`. Before: the plain one failed after 15 s (`expected { error } to equal { value: 2 }`), no per-owner limit (`expected 0 to be greater than 0`), the pattern bomb ran for the whole limit. The lane's own proof used `trigger.n + 1` with a JSON number, which CEL refuses (doubles); the test uses `+ 1.0`. The rate the lane could not measure did not matter: the line ahead of the victim is the attacker's, whatever its length.
- **Fix** (`apps/control-plane/src/kernel/flows/expressions.ts`).
  - The thread works on one expression at a time. Each owner has a line of its own, served in turn, so a tenant waits behind at most one expression of every other tenant.
  - The owner is the tenant id, passed by every caller: `routes/flows.ts` (preview, three calls), `kernel/flows/events.ts` (filter), `kernel/execution/triggers.ts` (tags), `kernel/flows/engine.ts` (steps), `kernel/execution/bundles.ts` (deploy check).
  - When the limit ends an expression, or the thread dies (memory), only that expression fails; the thread is replaced and the others, of every tenant, are carried over. If the thread twice will not start on anything, everything waiting fails (that is a broken thread, not a tenant).
  - One owner may have 256 expressions waiting; past that a new one is refused at once ("Too many expressions are waiting ... for this tenant").
  - Patterns: while an expression runs (not while it parses) the thread's `RegExp` is a subclass that refuses a pattern that is not shown safe: the same rules as B15 below (repeated group, optional group with a repeat in it, back reference, look-around, more than two unbounded or ranged repeats, more than four optional atoms, over 200 characters). The library offers no way to replace `matches`, so the replacement is in the thread's own `RegExp`, which only the thread sees. The author sees "Invalid regular expression: ..." (the library wraps the reason).
- **Tests.** `expressions-tenants.test.ts` (four tests), and the existing `expressions.test.ts` still passes (`flows.test.ts`, `events.test.ts` too).
- **Left.** The pattern rules refuse some harmless patterns (a repeated group such as `^(ab)+$`); an author rewrites them. A slow expression that is not a pattern (deep loops over a 200 item list) still costs the whole limit per turn, but only its own tenant's turns. The pattern guard is a copy of `patternProblem` in `packages/widget-sdk/src/schema.ts` (a thread's code is a string and cannot import it): change both together.

## B15 (RT-13-2): the widget schema pattern check missed optional and ranged repeats

- **The hole.** `patternProblem` counted only `*`, `+` and `{n,}`. `^(a?){30}a{30}$`-style patterns without a group (`^a?a?...a?aaa...a$`, 24 of each took seconds, 40 does not return) and `a{0,60}` five times passed, and ran on the viewer's page thread.
- **Proof before.** `packages/widget-sdk/src/schema-pattern.test.ts` (the lane's proof, plus cases): the optional atoms took over 1 s, the chained ranges 15.7 s (`expected 15685 to be less than 200`).
- **Fix** (`schema.ts`, `patternProblem`). Refused now: a repeated group (`*`, `+`, `{`), an optional group holding a repeat (`(a+)?`, `(?:a{2,9})?`), look-around, back references, more than two repeats that are unbounded or have a range (`{m,n}` counts), more than four `?`. Lazy marks are not counted twice; `(?:` and `(?<name>` are read as groups. Fixed counts (`{3}`, `\d{2}`) are free. Failing closed: what is not shown safe this cheaply is refused.
- **Tests.** `schema-pattern.test.ts` (four tests), `schema.test.ts` unchanged and passing; `pattern` ordinary shapes (`^[a-z]{2,5}-\d+$`, `^(\+\d{2} )?[A-Z]{2}-\d{3,6}(?:x)?$`) still run.
- **Left.** Other places that run a tenant's pattern were not looked for beyond `payloadProblem` (the only user of `patternProblem`).

## C2: a refused name told the tenant what it resolved to

- **The hole.** `EgressRefused` said "`host` is at `10.0.0.5`, a private or internal address", through the 400 `egress_refused` answer: names could be tried to map the private network.
- **Proof before.** `kernel/egress.test.ts` "a refused name does not say which address it resolved to": the message was `localhost is at 127.0.0.1, a private ...`.
- **Fix.** The message is now "`host` resolves to a private or internal address ...", and the address stays on the error (`error.address`) and is logged by the error handler (`problem.ts`, `request.log.info`). A host given as an address says "is", as before (the tenant gave it). A redirect to a literal address names that address (the other server chose it, not our network). The SSO metadata path (`kernel/sso/metadata.ts`) reads `message` and so follows.
- **Changed test.** `egress.test.ts` first test asserted the old words ("localhost is at ..."); it asserts the new ones.
- **Left.** Timing and the refused/unreachable difference still tell a tenant a name is internal; that is not an address.

## C3: credentials followed a redirect to another origin

- **The hole.** `guardedFetch` followed redirects itself and sent the same headers to the next address, `Authorization`, cookies and key headers included.
- **Proof before.** `kernel/egress-redirect.test.ts`: the second server saw `authorization: Basic ...`.
- **Fix** (`egress.ts`). On a hop to a different origin the request headers lose `authorization`, `proxy-authorization`, `cookie`, `cookie2` and any header whose name contains `key`, `token`, `secret` or `auth` (the headers a connection adds). The rest stay; a same-origin hop keeps everything. Sibling code: every guarded call goes through this function (data sources, Git, SSO metadata use `redirect: "error"` or this loop); `checkHost` makes no request.
- **Left.** A custom credential header that does not have those words in its name would still be sent.

## C22: the 429 for too many streams had no Retry-After

- **Fix.** `routes/stream.ts` sets `retry-after: 5` on the `too_many_streams` answer. Test: `stream.test.ts` "one caller holds at most five streams" (failed with `NaN`).

## C21: asking for a password reset ended the pending one

- **The hole.** `createPasswordToken` deleted the person's unused reset tokens before making one, and the request is anonymous: knowing an email was enough to keep cancelling the mail in flight (5 requests a minute per address).
- **Proof before.** `apps.test.ts` "asking for a reset again does not end the link already sent (C21)": the first link gave 410 after a second request.
- **Fix.** New `createRequestedResetToken` (`kernel/endusers.ts`) used by both anonymous routes (`routes/endusers.ts` `password-links`, `kernel/apps/front.ts` `/forgot`): it only deletes expired tokens, keeps the earlier links good, and makes none when five are already good (then nothing is sent; the answer is the same). Using one link still ends all the others (`endUnusedTokens`). Staff-made links (`createPasswordToken`, with the "newest link only" rule) are as before.
- **Member equivalent.** Members' resets (`routes/member-resets.ts`, `kernel/member-reset.ts`) are made by a tenant admin, signed in, and a second link replacing the first is tested behaviour (`member-reset.test.ts`); better-auth's own `request-password-reset` is refused (no mailer set). No change.
- **Left.** Up to five good links per person for two hours: more exposure of the same mailbox, not new.

## SECURITY.md corrections

Checked in the code, then changed:

- **C10.** Was: "A member's console session lasts 7 days from signing in" and "Session and link tokens are stored as SHA-256 hashes". Code: `kernel/auth.ts:92-98` sets only `expiresIn` (7 days) and no `disableSessionRefresh`/`updateAge`, so better-auth's default refresh slides `expires_at` (`better-auth/dist/api/routes/session.mjs:179-181`); `packages/db/migrations/0002_identity.sql:13-16` stores `member_session.token text` as it is. App sessions are hashed (`kernel/apps/sessions.ts:13,68`) and fixed (`expires_at` set once at line 70). The file now says 7 days from last use for members, fixed 30 days and 12 hours for the others, and that the console token is stored as it is (the cookie is signed with `AUTH_SECRET`).
- **C14.** `export:write` is described in the "A tenant's exit" row: it reads every secret, the holder choosing the passphrase. `packages/manifest/src/permissions.ts:84-90` ("secrets included in encrypted form"); `export` is not an explicit kind, so a wildcard role holds it (the lane's "never given by `*`" was not true of this tree, and is not written).
- **A5.** Beside the `same` sentence: with `MANAGED_WORKER_USER=own` all tenants' workers run as the same one user (`kernel/execution/supervisor.ts` lines 233-262 take one `user` for the whole supervisor, no per-tenant allocation), so tenants can signal each other's script processes and read each other's bundle cache directory (lane: `worker.ts` temp directory, not verified by me). Also in `packages/docs/content/self-host/explanation/running/managed-workers-and-isolation.md`, which said "a user of its own" for all modes (intro and process-mode paragraph corrected).
- Not changed: the lane's suggestion to hash member sessions or stop the slide (code, not words).

## Dependencies (`pnpm audit --prod`, reached the registry)

26 advisories (7 low, 15 moderate, 4 high, none critical). Nothing upgraded. High:

- `nodemailer@7.0.13` (via `apps/control-plane`, `packages/worker`), GHSA-p6gq-j5cr-w38f, message-level `raw` option bypasses file/URL access limits: not reachable, no caller sets `raw` (`kernel/mail.ts`, `packages/worker/src/smtp.ts` pass named fields only).
- `nodemailer@7.0.13`, GHSA-2x7j-588g-ccc2 and GHSA-v53p-9fqp-m79j, quadratic time in `addressparser`: reachable. A script can pass long address lists to the worker's SMTP connection (`packages/worker/src/smtp.ts`, `to`/`cc`/`bcc`/`replyTo`; it costs that tenant's own worker); the control plane's mail goes to one stored email address.
- `nodemailer@7.0.13`, GHSA-r7g4-qg5f-qqm2, TLS validation in the OAuth2 token fetch: not reachable, only user and password authentication is configured.

## Round two

### C3 again: a 307 or 308 to another origin sent the body there (reproduced)

**The hole.** On a redirect to another origin `guardedFetch` dropped the credential headers but kept the body for 307 and 308 (and for a 301 or 302 to a method other than POST), so a token request with its `client_secret` in the form was repeated at the other address.

**Proof before.** `egress-redirect.test.ts` "a 307 or 308 to another origin is not followed when it would send a body there": a POST and a PUT with a body were followed and the other server saw them.

**Fix.** `kernel/egress.ts`: a redirect to another origin that would repeat a request with a body is refused with an error that says why; the same request without a body, and a redirect that turns the request into a GET (303, or 301/302 of a POST), go on as before. The older test of header stripping used a POST with a body; it now uses a GET, since it asserted the header rule, not the body's passing. Commit `8ce938a6`.

**Not done: dropping "every header the connection added".** `guardedFetch` gets one list of headers from its caller and cannot tell which the connection added, so the list is still by name (`authorization`, cookies, and any name with key, token, secret or auth). A caller would have to say which headers are credentials; that is a change in every caller, and the names that remain are `x-password`, `x-session`, `signature`, `x-jwt` and the like. Left for the owner.

### C21 again: five pending reset links blocked new requests (reproduced)

**The hole.** With five good links for one person, `createRequestedResetToken` made no new one. Anyone who knew an email could fill the five (5 requests a minute, no sign-in) and leave the person without a new link for up to two hours if they had deleted the mails.

**Proof before.** `end-user-reset-cap.test.ts`: the sixth request got no link.

**Fix.** `kernel/endusers.ts`: past the five, the oldest are replaced by the new one. Commit `3f450084`.

**Left.** The trade the first fix tried to avoid is back in a smaller form: someone who keeps asking can cancel the person's older links by pushing them out (it takes six requests, and the newest link always works). The person is never without one.

## Round three

### The mail library: `nodemailer` 7.0.13 to 10.6.1 (commit `c65fdf37`)

**Where it is used.** Dependencies: `apps/control-plane/package.json`, `packages/worker/package.json` (both were `^7`, now `^10.6.1`; `pnpm-lock.yaml`). Use: `apps/control-plane/src/kernel/mail.ts` (`createTransport(url)`, `sendMail({ from, to, subject, text })`) and `packages/worker/src/smtp.ts` (`createTransport` with host, port, `secure`, `requireTLS`, `ignoreTLS`, `auth`, three timeouts; `sendMail` with from, to, cc, bcc, replyTo, subject, text, html; `verify`; `close`).

**Which version.** The patched ranges of the four high advisories are `>=9.0.1` (GHSA-p6gq-j5cr-w38f, `raw`), `>=8.0.8` (GHSA-r7g4-qg5f-qqm2, OAuth2 TLS), `>=9.1.0` (GHSA-2x7j-588g-ccc2, address parser) and `>=10.0.6` (GHSA-v53p-9fqp-m79j, address parser). So the lowest is 10.0.6, a new major version; I took the latest 10.x, 10.6.1, which also clears all 15 moderate ones.

**Breaking changes read** (the package's `CHANGELOG.md`, 8.0.0, 9.0.0, 10.0.0) against how we call it:

- 8.0.0: the error code `NoAuth` is now `ENOAUTH`. Nothing in the repo reads that code.
- 9.0.0: HTTPS requests made to fetch remote content (attachment URLs, OAuth2 token endpoints, proxy CONNECT) now check the certificate. We send no attachments, use no OAuth2 and no proxy; the SMTP connection's own TLS options are as before.
- 10.0.0: Node 20 or newer (the repo needs 24); the library is written in TypeScript and ships its own types, so `@types/nodemailer` was removed from both packages. The `createTransport` and `sendMail` options we pass are unchanged. No source change was needed.

**Reachable in the control plane? Not by anyone but the operator.** The control plane mails only an address it stored: a member's (`routes/member-resets.ts:37`, `kernel/flows/approval-links.ts:132`), an end user's (`routes/endusers.ts:162`, `kernel/apps/front.ts:498`). Nothing mails a form's reply-to, an alert's recipients or an approval's free-typed address (no call to `kernel.mail.send` takes one). Every way an address is stored refuses a long list first: end users `cleanEmail` (`kernel/endusers.ts:16-24`: one `@`, no whitespace, at most 320 characters; used by sign-up, invitation, SCIM and sign-in providers, `kernel/sso/scim.ts:619-632`, `kernel/sso/people.ts:79-82`), members created by an admin `format: "email"` at most 254 (`routes/tenants.ts:709`, `routes/identity.ts:85`), and members from a provider the same 320-character check. A list needs many commas or colons, which that check lets through only up to 320 characters, a size where the parser takes microseconds. One path was not checked end to end: a tenant import (`kernel/tenancy/import.ts:591`) copies member emails from an export file without that check; it is run by someone who may import a tenant. In a tenant's worker the advisory was reachable by its own script, as the first review said; that costs that tenant's worker.

**Test.** `apps/control-plane/src/kernel/mail-address.test.ts` sends the shape through `Mailer.send`, to a closed port, so the time is the library reading the addresses. Before the upgrade, a list of 400,000 characters: names with commas and no domain 87.3 s, a list of addresses 9.8 s, a run of groups 0.5 s (the third test failed: `expected 87.34 to be less than 1`). After: 0.32 s, 0.36 s, 0.06 s. The other two tests (our own check refuses such a list; the longest address our check accepts is read in a few milliseconds) pass before and after.

**Checks.** `pnpm -s typecheck` clean. The mail tests (`arriving`, `extensions`, `connections`, `cfg-configure` in the control plane, `define-parity` in the worker, `local` in the CLI, and the new one): 7 files, 110 tests pass.

**Audit, `pnpm audit --prod`.**

- Before: 26 advisories: 7 low, 15 moderate, 4 high, 0 critical.
- After: 6 advisories: 6 low, 0 moderate, 0 high, 0 critical.
- Left that is high or critical: none. Moderate: none.
- Left, low (all in the console's bundle): five in `dompurify` (`IN_PLACE` and hook cases, a SMIL attribute guard, a `SAFE_FOR_TEMPLATES` bypass), one in `katex` (prototype pollution that bypasses its trust settings).

### An audit step in CI (commit `4d4b279a`)

`.github/workflows/audit.yml`: runs `pnpm audit --prod --audit-level high` on pull requests and on Mondays at 05:17 UTC. Same set-up steps as `ci.yml` (`actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4` with `.nvmrc` and the pnpm cache, `pnpm install --frozen-lockfile`). Run on this tree it reports only the 6 low and passes. No Dependabot. The first review also noted that actions are pinned by tag, not by commit; that is left as it is, as asked.

### Two things documented, not changed (commit `115302ed`)

**`sso:write` is as much as tenant admin.** Written in the permissions reference (a note on the `sso:write` row, from `packages/docs/generators/reference.mjs`, since that page is generated), in `packages/docs/content/administer/reference/sso/permissions.md` (a section), and in `SECURITY.md` (a row after `export:write`'s). Verified in code:

- Changing a provider needs `sso:write` (`routes/sso.ts:227-228`, patch `:321`). `updateProvider` (`kernel/sso/providers.ts:564-651`) removes the links tied to the old issuer and leaves `identity_domain` rows as they are. A domain of members belongs to one provider (`providers.ts:838-845`), so the existing provider is the one to edit.
- A sign-in then takes the existing member whose email is in a proved domain (`kernel/sso/people.ts:95-111`), whatever the provider says; the only refusal for the person is a member who holds access at the instance (`people.ts:166`, `:283-290`).
- A token for provisioning needs the same permission (`routes/scim.ts:110-111`, `:312-340`); a push creates or takes members in proved domains (`kernel/sso/scim.ts:663-700`) and a pushed group is put in the group an existing mapping names (`scim.ts:975-989`, `:1205-1225`). Saving a new mapping needs `group:write`, and `binding:write` for a group that holds a binding (`routes/sso.ts:278`), so the docs say it is the existing mappings that matter. Not run.

**An app's end users are not proved by sign-up, with or without mail.** Written in `packages/docs/content/self-host/how-to/running/set-up-mail.md` (a section, and the "Before you start" lines), `packages/docs/content/develop/explanation/apps/app-access.md` (a section under "Who the person is") and `SECURITY.md` (one sentence in what it does not protect against). **The address is not verified even where mail is set up**: sign-up (`routes/endusers.ts:1013-1055`, `kernel/apps/front.ts:379-411`) calls `createEndUser` (`kernel/endusers.ts:40-75`), which only trims, lower-cases and shape-checks it, and signs the person in; `end_user` has no verified column. What mail adds: an invitation made in the console has no password until its emailed link is opened, and "Forgot your password" exists only with mail (`front.ts:465`), and using a link deletes the account's app sessions (`endusers.ts:205-262`), so the owner of an address can take back an account made with it. I did not build verification. What the docs tell an app author to do instead: invite end users from the console, or use an identity provider of end users (which refuses an email it says is not verified, `people.ts:89`; an answer that says nothing passes). There is no bulk import of end users. The console's row rules name people by ID, group or attribute, not by email, so the case that matters is an app, script or flow that reads the principal's `email`.

Ledgers: rows added in `docs/documentation/factcheck/administer/reference/sso/permissions.md`, `.../self-host/how-to/running/set-up-mail.md` and `.../develop/explanation/apps/app-access.md`. `npx vitest run packages/docs` passes (303 tests), and `pnpm docs:check` too.
