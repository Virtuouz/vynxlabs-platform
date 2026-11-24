---
title: What an app may load
description: The content policy an app is served with, the other headers, how files are cached, which addresses answer the page, and what the instance puts in the page.
subjects: [apps, access]
---

Every page and file of an app of files or of an interface is served with one content security policy. It is the same one `volvel dev` serves under, so what a deployed app would refuse is refused while you write it. A docs site has its own, close to it.

## The policy

| Directive | Value | What it means for the app |
| --- | --- | --- |
| `default-src` | `'self'` | Anything not named below comes from the app's own address. |
| `script-src` | `'self'` | Scripts come from the app's own files. No inline script, no `eval`, no script from another site. WebAssembly is not allowed either, since `wasm-unsafe-eval` is not set. |
| `style-src` | `'self' 'unsafe-inline'` | Stylesheets are the app's own. Inline styles are allowed, because components set styles on elements. |
| `img-src` | `'self' data: blob:` | Images are the app's own, a `data:` address or a `blob:`. No image from another site. |
| `font-src` | `'self' data:` | Fonts are the app's own or a `data:` address. A font from a font service is refused. |
| `connect-src` | `'self'` | `fetch`, XHR and `EventSource` reach the app's own address only: the API at `/api/v1` and nothing else. |
| `object-src` | `'none'` | No plug-ins. |
| `base-uri` | `'self'` | |
| `form-action` | `'self'` | A form posts to the app's own address. |
| `frame-ancestors` | `'self'` | The app can be framed by the app's own address only. |

Each response also has `x-content-type-options: nosniff` and `referrer-policy: same-origin`.

Under `volvel dev` the policy is the same except that `script-src` also allows a nonce made for the run, given only to the dev server's own scripts, and `connect-src` also allows `ws://localhost:*` and `ws://127.0.0.1:*`, for reload. See [Run an app while you write it](../../how-to/apps/run-an-app-while-you-write-it).

### A docs site

A site of documentation is served under a policy of its own. It differs in two directives: `img-src` is `'self' https: data:`, so a page may show an image from another site over HTTPS, and `font-src` is `'self'`.

## What the page may do with the address

An app can be served under a path (`/apps/<tenant>/<workspace>/<app>/`) or at the root of a hostname, so write addresses relative to the app. The instance puts `<base href="…">` in the page, so a link such as `href="#x"` resolves to the app's root and not to the page's address. Use `location.hash` for in-page state, and build every address from `appContext().base`. A hard-coded `/logo.png` fails under a path.

A cookie, a session and a CSRF check are on the app's own address: a request that changes anything and comes from another origin is refused with 403 `cross_site`.

## Which address answers the page

| The address | The answer |
| --- | --- |
| A file the app has | The file. |
| The app's root | The page named by `entry` (default `index.html`). |
| No file, and the app's `fallback` is not `false`, and the browser asks for HTML or the last part has no dot | The page, so an app can route in the browser. A screen with a dot, such as `/users/j.smith`, is answered with the page when the browser asks for HTML. |
| Anything else | 404. |

## Caching

| What | `cache-control` |
| --- | --- |
| The page | `no-store` |
| A file whose name holds the first 8 characters of its content's digest, or ends in `-` or `.` followed by 8 letters, digits, `_` or `-` with at least one digit or capital letter, then an extension (a bundler's hash: `index-3f9a8c1b.js`) | `private, max-age=31536000, immutable` (a year) |
| Any other file, such as `logo-horizontal.svg` | `private, no-cache`, with an `ETag` of the file's digest. The browser asks each time and gets 304 when it has not changed. |

Name a file that changes at a deploy so that it does not look like a hash, and let your build hash the files that do not change.

## What the instance puts in the page

The instance adds these to the page named by `entry`, before it is sent:

- `<base href>`, the app's address.
- `<script type="application/json" id="vx-context">`, which `appContext()` reads: `api`, `tenant`, `workspace`, `app`, `base`, `portal` and `principal`. It is JSON in an element the browser does not run, so the page needs no inline script.
- A stylesheet of the theme: the kit's, then the tenant's, then the workspace's. A value set for light does not carry to dark.
- The tenant's icons, unless the app names its own with a `<link rel="icon">`.

## Rate limits at an address

| What | Limit |
| --- | --- |
| Pages, to someone who is not signed in | 600 a minute for each address, counted in the instance's database, so every replica shares it |
| Files (hashed assets, icons, fonts), to someone who is not signed in | 1,200 a minute for each address, counted in each replica's memory |
| API calls, to someone who is not signed in | 120 a minute for each route |

Past a limit the answer is 429.

## Related

- [Run an app while you write it](../../how-to/apps/run-an-app-while-you-write-it)
- [How access to an app works](../../explanation/apps/app-access)
- [The app client](app-client)
