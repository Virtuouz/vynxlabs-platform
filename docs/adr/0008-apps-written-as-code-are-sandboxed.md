# Decision 0008: apps written as code are sandboxed, and act with a token

Status: **accepted** by the owner. The rules were decided on 2026-11-26 (phase 35, "Set aside for later"), and the default address on 2026-11-28. Built for 0.7.0 in #28.
Date: 2026-11-28.
Supersedes: the "Apps' address" row of decision 0001, and rule 8 of decision 0007.

## Summary

An app written as code is a tenant's own JavaScript, served by the instance. Until 0.7.0, every such app at one address shared that address's origin. One tenant's app could act as a visitor signed in to another tenant's app at the same address: it could read that app's pages and rows, and write. At the console's address, it could also call the console's API as a member of staff who opened it. This was proved in a browser in phase 35.

From 0.7.0, every page of such an app is **served sandboxed**. It has no origin of its own, so the browser:

- sends it no cookie;
- lets it read no other page;
- gives it no storage.

The page acts with a **short-lived token** that it is given when it is served. That token reaches only what apps use, in one tenant.

## Decision

1. **Sandboxed pages.** Every page of an app written as code is served with `Content-Security-Policy: … sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals`. The policy omits `allow-same-origin`. This holds at every address: the console's, `APPS_URL`, and a tenant's own hostname. `volvel dev` serves the page under the same policy (`codeAppPolicy`, `@volvel/manifest`).
2. **A token in place of the cookie.**
   - The page is still loaded by an ordinary navigation, with the person's sign-in: an app session, or the console session at the console's address.
   - Its `#vx-context` carries an app token (`vxa_…`, `kernel/apps/tokens.ts`).
   - The token names the tenant, the address it was given at, the sign-in it stands on (an `app_session`, or a `member_session`) and the person.
   - It lasts ten minutes, and is signed with a key derived from `AUTH_SECRET`. Nothing about it is stored.
   - It is worth nothing once the sign-in it stands on ends, or the person is disabled. Each use checks both.
   - The page renews it with itself (`GET /api/v1/app-token`). `@volvel/app` sends it on every call and renews it before it ends. The run stream is read with `fetch`, so the token is never in an address.
3. **The API answers a sandboxed page, without credentials.** A request with `Origin: null` is answered with `Access-Control-Allow-Origin: *` under `/api`, and its preflight is answered at any path. Credentials are never allowed. A cookie sent with `Origin: null` is ignored (`resolvePrincipal`). So a sandboxed page anywhere else gains only what a caller with no sign-in has.
4. **Staff act with their own roles, and only what apps use.** A token for a member is always app-only (`appTenantId`), also at the console's address. Routes that are a member's own account, the console's routes, and anything that is not app-facing refuse it, as they refuse an app sign-in. The approvals of a page (decision 0007) are reached through the member's own standing, without the app limit, and `approvalStanding` refuses an app token. A code app therefore cannot decide an approval, at any address.
5. **Nothing kept in the browser.** A sandboxed page has no `localStorage`, `sessionStorage` or cookies. What apps kept there is dropped and not replaced. #39 is the p2 that may give some of it back through the API.
6. **Files by a name made from their content, without a sign-in.**
   - An app's scripts, styles, fonts and pictures are served at `/_apps/<tenant>/<workspace>/<name>/<file>`. The name is a hash of every file's path and content.
   - They are public and immutable, with CORS for the sandbox, and served under a policy that sandboxes any of them opened as a page.
   - A file's ordinary path under the app answers with a redirect to that name, which also carries the CORS header.
   - The workspace's five latest bundles are looked in, so a page opened before a deploy still loads its files after it.
   - Only the pages need a sign-in. An HTML file of the app is a page.
7. **An app with a hostname of its own** is no longer served at the shared addresses. Once its registration is enabled and proved, they redirect to it with 308, keeping the path and query.
8. **The console's address is the default.** With no `APPS_URL`, code apps are served at the console's address, sandboxed. `APPS_ON_CONSOLE_ADDRESS` is removed. `APPS_URL` stays optional, for an operator who wants a second address. `/api/v1/instance` reports `appsAddress` as `console` or `separate`, never `none`.
9. **Rule 8 of decision 0007 is withdrawn.** It refused approvals wherever a code app could run, because the app's script could use the manager's cookie. A sandboxed page has no cookie, and its token never has the member's own standing (4). Approvals are decided in an app at every address. The widget SDK keeps the optional `decideIn` field for widgets written against an earlier instance, and the instance no longer sends it.

10. **Apps built before 0.7 keep working.** A page of a code app also loads `/_platform/app-token.js`, the platform's own script. It runs after the context and before the app's script (`kernel/apps/app-shim.ts`). A client built with `@volvel/app` 0.6 calls the API with the page's cookie and follows runs with an `EventSource`, and neither works in the sandbox. The script sends such a client's calls to the API with the token and no credentials, renewing it as the client does. It also reads an `EventSource` on the API with `fetch`. A call that already carries an Authorization header passes through untouched. The script is kept for as long as the versioning policy owes old bundles: the last three minor versions.

## Consequences

- One tenant's app cannot read, act as, or frame another's, at any shared address. This is proved in Chromium by `e2e/apps-isolation.spec.ts` and in the API by `apps.test.ts`.
- An instance needs no second address to host tenants that do not trust each other. Turning one on stays a choice about addresses and cookies, not about safety.
- An app cannot keep anything in the browser. A choice it remembered (a tab, a folded section, Fernhill's clinic) is forgotten on reload.
- An app cannot sign a person in by calling the API: a sandboxed page cannot set a cookie. Signing in is done on the tenant's sign-in pages, which `signInUrl()` and `staffSignInUrl()` give, as before. Signing out with `signOut()` ends the sign-in the token stands on.
- Help pages open in a new tab from a code app, not in a frame: a sandboxed page has no origin to compare a help page's with (`help.tsx`).
- A file of a code app can be fetched by anyone who knows its name. An app's files must hold no secret, which was already the rule: they are sent to every visitor.

## Alternatives

- **A second address for every tenant (a hostname each).** Rejected as the only answer. It would need DNS and certificates for each tenant. Isolation would rest on configuration, and one missing name would leave the hole open.
- **Keep the cookie and check `Origin` and `Referer`.** Rejected. Pages at one origin share it, so a check cannot tell one tenant's script from another's.
- **A token for the files as well.** Rejected. Module scripts and stylesheets are fetched without headers the page can add, and content names make them safe to serve to anyone.
- **Replace storage with the API.** Deferred, as #39.
