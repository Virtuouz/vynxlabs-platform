---
"@volvel/sdk": minor
---

### For operators

- **Apps written as code are isolated from each other and from the console.** Every page of
  such an app is now served sandboxed, with no origin of its own, at every address. One tenant's
  app can no longer read another tenant's app, act as its visitors, or use the session of a
  member of staff who opens it. An instance no longer needs a second address to host tenants
  that do not trust each other.
- **Apps written as code are served at the console's address by default.** With no `APPS_URL`,
  they are served there, sandboxed. `APPS_ON_CONSOLE_ADDRESS` is no longer read: remove it from
  your settings. `APPS_URL` still gives apps an address of their own, if you want one.
- **An app with a hostname of its own is served only there.** Once its hostname is turned on and
  proved, the shared address sends visitors to it.
- **Approvals are decided in an app wherever it is served.** The Approvals widget no longer sends
  managers to the console to decide.

### For tenant developers

- **Your app's page is sandboxed.** It sends no cookie and has no `localStorage`,
  `sessionStorage` or `document.cookie`. Code that reads or writes them throws. Anything your
  app kept in the browser is forgotten when the page is reloaded.
- **Apps you built with 0.6 keep working without a rebuild.** The platform gives their calls the
  page's token. Rebuild with 0.7 when you next deploy.
- **`@volvel/app` calls the API with a token, not a cookie.** The page is given a token when it
  is served, in `appContext().token`. The helpers send and renew it for you. If you call the API
  with your own `fetch`, send `Authorization: Bearer <token>` (`appAuthorization()` gives the
  header) and no credentials.
- **Sign people in on the sign-in pages.** A sandboxed page cannot set a cookie, so an app
  cannot sign someone in by calling the API. Send people to `signInUrl()` or `staffSignInUrl()`,
  as before. `signOut()` still signs them out.
- **Your app's files are served without a sign-in.** Scripts, styles, fonts and pictures are
  fetched by a name made from their content, so anyone who has the name can fetch them. Keep
  secrets out of them, as before. Only the pages need a sign-in.
- **A member of staff acts in your app with what apps use.** At the console's address too, a
  member's calls from your app reach only what an app sign-in reaches, in that tenant.
- **`volvel dev` serves your page sandboxed too**, so what breaks when deployed breaks while you
  write it.
