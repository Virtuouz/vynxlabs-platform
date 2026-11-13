/** The platform's own pages for a tenant's apps: signing in, setting a password, and saying no. */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ESCAPES[char] as string);

/** JSON that is safe inside a script element: nothing in it can end the element. */
export const jsonForHtml = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/[\u2028\u2029]/g, "");

/**
 * The style of these pages. They carry no script and are served without the
 * component kit, so they are styled here, from the same theme tokens.
 */
export const PORTAL_CSS = `
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
  background: var(--vx-canvas); color: var(--vx-ink); font-family: var(--vx-font);
  font-size: 15px; line-height: 1.45;
}
main {
  width: 100%; max-width: 380px; background: var(--vx-surface); border: 1px solid var(--vx-line);
  border-radius: var(--vx-radius-panel); padding: 28px 24px;
}
.brand { display: flex; align-items: center; gap: 10px; margin: 0 0 20px; color: var(--vx-ink-muted); font-size: 14px; }
.brand img { max-height: 36px; max-width: 160px; }
h1 { font-size: 20px; margin: 0 0 6px; }
p { margin: 0 0 16px; color: var(--vx-ink-muted); }
label { display: block; font-weight: 600; font-size: 13px; margin: 14px 0 4px; }
input {
  width: 100%; padding: 9px 10px; font: inherit; color: var(--vx-ink); background: var(--vx-surface);
  border: 1px solid var(--vx-line); border-radius: var(--vx-radius-control);
}
button, a.button {
  display: inline-block; width: 100%; margin-top: 20px; padding: 10px 14px; font: inherit; font-weight: 600;
  text-align: center; text-decoration: none; cursor: pointer; color: var(--vx-action-ink);
  background: var(--vx-action); border: 0; border-radius: var(--vx-radius-control);
}
button.plain { color: var(--vx-ink); background: var(--vx-sunken); }
a.button.plain { color: var(--vx-ink); background: var(--vx-sunken); margin-top: 8px; }
.or { margin: 20px 0 0; text-align: center; font-size: 13px; }
:focus-visible { outline: 2px solid var(--vx-action); outline-offset: 2px; }
.notice { margin: 0 0 16px; padding: 10px 12px; border-radius: var(--vx-radius-control); font-size: 14px; }
.notice.danger { background: var(--vx-danger-soft); color: var(--vx-danger); }
.notice.success { background: var(--vx-success-soft); color: var(--vx-success); }
p.who { margin: 20px 0 0; }
nav { margin-top: 20px; display: grid; gap: 8px; font-size: 14px; }
a { color: var(--vx-action); }
ul.apps { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
ul.apps a { display: block; padding: 12px; border: 1px solid var(--vx-line); border-radius: var(--vx-radius-control); text-decoration: none; font-weight: 600; }
ul.apps small { display: block; font-weight: 400; color: var(--vx-ink-muted); }
`;

export interface PageFrame {
  /** The tenant's name, shown above every page. */
  tenantName: string;
  themeHref: string;
  logoHref: string | undefined;
}

export interface Notice {
  kind: "danger" | "success";
  text: string;
}

function page(frame: PageFrame, title: string, body: string, notice?: Notice): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · ${escapeHtml(frame.tenantName)}</title>
<link rel="stylesheet" href="${escapeHtml(frame.themeHref)}">
<link rel="stylesheet" href="/_platform/portal.css">
</head>
<body>
<main>
<div class="brand">${frame.logoHref ? `<img src="${escapeHtml(frame.logoHref)}" alt="">` : ""}<span>${escapeHtml(frame.tenantName)}</span></div>
${notice ? `<div class="notice ${notice.kind}" role="${notice.kind === "danger" ? "alert" : "status"}">${escapeHtml(notice.text)}</div>` : ""}
${body}
</main>
</body>
</html>
`;
}

const hidden = (name: string, value: string | undefined) =>
  value === undefined ? "" : `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
const withReturn = (href: string, back: string | undefined) =>
  back === undefined ? href : `${href}?return=${encodeURIComponent(back)}`;

export function signInPage(
  frame: PageFrame,
  at: {
    portal: string;
    back: string | undefined;
    signUp: boolean;
    email?: string;
    /** The identity providers the tenant's end users sign in through. */
    providers?: { id: string; name: string }[];
    /** False when single sign-on is required of everyone, so there is no password to ask for. */
    password?: boolean;
  },
  notice?: Notice,
): string {
  const providers = (at.providers ?? [])
    .map(
      (provider, index) =>
        `<a class="button${at.password === false && index === 0 ? "" : " plain"}" href="${escapeHtml(
          withReturn(`${at.portal}/sso/${provider.id}/start`, at.back),
        )}">Sign in with ${escapeHtml(provider.name)}</a>`,
    )
    .join("\n");
  const password =
    at.password === false
      ? ""
      : `<form method="post" action="${escapeHtml(at.portal)}/sign-in">
${hidden("return", at.back)}
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="username" required value="${escapeHtml(at.email ?? "")}">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button>
</form>`;
  return page(
    frame,
    "Sign in",
    `<h1>Sign in</h1>
${password}
${providers && password ? '<p class="or">or</p>' : ""}
${providers}
<nav>
${at.password === false ? "" : `<a href="${escapeHtml(at.portal)}/forgot">Forgot your password?</a>`}
${at.signUp && at.password !== false ? `<a href="${escapeHtml(withReturn(`${at.portal}/sign-up`, at.back))}">Create an account</a>` : ""}
<a href="${escapeHtml(withReturn(`${at.portal}/staff`, at.back))}">Staff sign-in</a>
</nav>`,
    notice,
  );
}

export function signUpPage(
  frame: PageFrame,
  at: {
    portal: string;
    back: string | undefined;
    email?: string;
    name?: string;
    minPassword: number;
  },
  notice?: Notice,
): string {
  return page(
    frame,
    "Create an account",
    `<h1>Create an account</h1>
<form method="post" action="${escapeHtml(at.portal)}/sign-up">
${hidden("return", at.back)}
<label for="name">Name</label>
<input id="name" name="name" autocomplete="name" maxlength="200" value="${escapeHtml(at.name ?? "")}">
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="username" required value="${escapeHtml(at.email ?? "")}">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="new-password" required minlength="${at.minPassword}">
<button type="submit">Create account</button>
</form>
<nav><a href="${escapeHtml(withReturn(`${at.portal}/sign-in`, at.back))}">Sign in instead</a></nav>`,
    notice,
  );
}

export function setPasswordPage(
  frame: PageFrame,
  at: { portal: string; token: string; email: string; invitation: boolean; minPassword: number },
  notice?: Notice,
): string {
  return page(
    frame,
    "Choose a password",
    `<h1>${at.invitation ? "Welcome" : "Choose a new password"}</h1>
<p>${at.invitation ? "Choose a password for" : "For"} ${escapeHtml(at.email)}.</p>
<form method="post" action="${escapeHtml(at.portal)}/set-password">
${hidden("token", at.token)}
<input type="hidden" name="email" autocomplete="username" value="${escapeHtml(at.email)}">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="new-password" required minlength="${at.minPassword}">
<button type="submit">Save and sign in</button>
</form>`,
    notice,
  );
}

export function forgotPage(
  frame: PageFrame,
  at: { portal: string; mail: boolean },
  notice?: Notice,
): string {
  const body = at.mail
    ? `<p>Enter your email and we will send you a link to choose a new one.</p>
<form method="post" action="${escapeHtml(at.portal)}/forgot">
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="username" required>
<button type="submit">Send the link</button>
</form>`
    : "<p>Ask the person who gave you this account for a new link. They can make one for you.</p>";
  return page(
    frame,
    "Forgot your password",
    `<h1>Forgot your password?</h1>
${body}
<nav><a href="${escapeHtml(at.portal)}/sign-in">Back to sign in</a></nav>`,
    notice,
  );
}

export function messagePage(
  frame: PageFrame,
  message: { title: string; text: string; link?: { href: string; label: string } },
  signOut?: { portal: string; who: string },
): string {
  return page(
    frame,
    message.title,
    `<h1>${escapeHtml(message.title)}</h1>
<p>${escapeHtml(message.text)}</p>
${message.link ? `<a class="button" href="${escapeHtml(message.link.href)}">${escapeHtml(message.link.label)}</a>` : ""}
${
  signOut
    ? `<form method="post" action="${escapeHtml(signOut.portal)}/sign-out"><p class="who">Signed in as ${escapeHtml(signOut.who)}.</p><button class="plain" type="submit">Sign out</button></form>`
    : ""
}`,
  );
}

export function homePage(
  frame: PageFrame,
  at: {
    portal: string;
    who: string | undefined;
    apps: { href: string; title: string; description: string | undefined }[];
  },
): string {
  const list =
    at.apps.length > 0
      ? `<ul class="apps">${at.apps
          .map(
            (app) =>
              `<li><a href="${escapeHtml(app.href)}">${escapeHtml(app.title)}${app.description ? `<small>${escapeHtml(app.description)}</small>` : ""}</a></li>`,
          )
          .join("")}</ul>`
      : `<p>${at.who ? "There is nothing here for this account yet." : "Sign in to see what is here for you."}</p>`;
  return page(
    frame,
    "Apps",
    `<h1>Apps</h1>
${list}
${
  at.who
    ? `<form method="post" action="${escapeHtml(at.portal)}/sign-out"><p class="who">Signed in as ${escapeHtml(at.who)}.</p><button class="plain" type="submit">Sign out</button></form>`
    : `<a class="button" href="${escapeHtml(at.portal)}/sign-in">Sign in</a>`
}`,
  );
}

/**
 * Puts what an app needs to know into its page: where it is served, and for
 * whom. The data goes in an element a browser does not run, so the page needs
 * no inline script and can be served under a strict content security policy.
 */
export function injectContext(
  html: string,
  context: { base: string; themeHref: string; data: unknown },
): string {
  const head = `<base href="${escapeHtml(context.base)}"><script type="application/json" id="vx-context">${jsonForHtml(context.data)}</script>`;
  const theme = `<link rel="stylesheet" href="${escapeHtml(context.themeHref)}">`;
  let page = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (tag) => `${tag}${head}`)
    : `${head}${html}`;
  page = /<\/head>/i.test(page) ? page.replace(/<\/head>/i, `${theme}</head>`) : `${page}${theme}`;
  return page;
}
