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
