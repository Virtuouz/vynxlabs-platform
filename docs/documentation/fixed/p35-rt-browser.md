# p35-rt-browser: what a browser does with the console's address

Tests: `apps/control-plane/src/browser-holes.test.ts` (A2, C1, B6) and `console-files.test.ts` (C17). Each was seen failing on the code before the fix.

## A2 (RT-01-1): a docs app's files run at the console's origin

- **Hole.** A docs app may carry `.html` and `.js` files. Where apps are served at the console's own address, they were sent with the app policy, whose origin is the console's: a script deployed by anyone with app-deploy rights ran with the session of whoever opened it.
- **Proof before.** `expected 'default-src 'self'; script-src 'se…' to match /(^|; )sandbox($|;)/` for `evil.html`.
- **Fix.** In `kernel/apps/front.ts`, a file of a docs app served at the console's address (`place.kind === "main"`) carries the app policy plus `sandbox` (no origin, no scripts), as widget frames do. `nosniff` was already sent. Interface apps are not changed: their files are the platform's own, and they must run at that origin. Apps at an address of their own are not changed. The pages the docs app draws (`serveDocs`) and the platform's `/docs` are not served by this branch.
- **Left.** A deploy still accepts `.html` and `.js` in a docs app; they are now only inert at the console's address. Refusing them at deploy would be a product decision.

## C1: a tab in a return address

- **Hole.** `/\t/evil.example` passed `consolePath`, `safeReturn` and `safePath`; a browser drops the tab and reads `//evil.example`.
- **Proof before.** `expected 'evil.example' to be 'localhost:8080'` (the staff link of a portal), and the sign-in form carried the value.
- **Fix.** One function, `ownPath` in `kernel/return-path.ts`, used by all three: it refuses a backslash, every C0 control and space, DEL and the C1 controls, and the line and paragraph separators, anywhere in the value, and `//`. Checked in siblings: the OAuth return in `routes/execution.ts` is read back as `pathname + search` of a parsed address, so it cannot leave the site; no other `startsWith("//")` check exists.

## B6 (RT-14-1): tokens in the access log and traces

- **Hole.** `/approve/<token>`, `/reset-password/<token>` and `/portal/<slug>/forms/vxf_<token>` were written whole.
- **Fix.** `publicPath` in `problem.ts` masks them. The request logger and the tracer (`app.ts`) both take the path from it, as do problem bodies, so it is the one place. Masked as `/approve/:token`, `/reset-password/:token`, `/forms/:token`.

## C17: no `frame-ancestors` on the console

- **Fix.** The hook in `app.ts` that gives the console's pages `frame-src` now also gives `frame-ancestors 'self'`. It touches only html answers that have no policy of their own, so apps, widget frames, the platform's pages and docs are untouched. The console frames its widgets, docs and apps as children; nothing frames the console from another site. Tenant apps at their own address keep their own policy.
- **Left.** Not walked in a browser with a real frame; checked from the code (frames in the console: `help.tsx`, `TenantWidgetHost.tsx`) and the header test.

## Round two

### C1 again: `/.//evil.example/x` passed `ownPath`, and the OAuth connection flow did not use it (low to medium)

**The hole.** A browser takes the dot segments out of an address before reading it, so `/.//evil.example/x` is `//evil.example/x`. `ownPath` accepted it, and the OAuth connection flow's `returnTo` did not go through `ownPath` at all: the start route only had a schema pattern, and the callback parsed the stored value with `new URL(returnTo, mainOrigin)` and sent `pathname + search` as `Location`, which was `//evil.example/x?...`. The earlier record's line "read back as pathname and search of a parsed address, so it cannot leave the site" was wrong for this reason.

**Proof before.** `browser-holes.test.ts` (the new bad values) and `connections.test.ts` (start with `/.//evil.example/x` answered 200; a stored one was sent on).

**Fix.** `kernel/return-path.ts` `ownPath` also resolves the value as a browser would (`new URL(raw, "http://own.invalid")`) and refuses it if the origin changed or the path then begins with `//`. `routes/execution.ts`: the start of the OAuth flow refuses a `returnTo` that `ownPath` refuses (400), and the callback reads the stored value through `ownPath` again (an older stored value falls back to `/`). Commit `b41f0cba`.

**Test.** `browser-holes.test.ts` (four dot-segment forms, and `/a/./b/../c` still allowed) and `connections.test.ts` (three starts refused; a stored `/.//evil.example/x` ends at a local path).

**Checked for the same mistake.** The other callers of `ownPath` (`auth.ts`, `apps/front.ts`, `routes/apps.ts`) send the raw string as `Location`, which a browser resolves on the same origin; they now also pass the stricter check.

**Left.** Nothing.

### B6 again: the token mask worked on the raw path (low)

**The hole.** `/api/v1/%6Dember-password-links/<token>` is routed to the real route, but `publicPath` masked the raw text, so the token stayed in the log line, the trace and a problem's `instance`. A doubled slash (`/hooks//<token>`) was also left.

**Proof before.** `browser-holes.test.ts` "a route name written with percent escapes, or with a doubled slash, is masked all the same".

**Fix.** `problem.ts` `publicPath` decodes the plain (ASCII) percent escapes first, then masks, and what is logged is the decoded, masked form. A malformed or multi-byte escape is left as it is, so it cannot throw. The patterns take one or more slashes before the token. Commit `003f58f8`.

**Left.** The path is not otherwise normalised (trailing dots, `;` parameters): the router does not read those as a route either.
