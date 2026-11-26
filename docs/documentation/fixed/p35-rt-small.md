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
