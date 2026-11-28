/**
 * What an app's page may load and do: no inline script, and nothing from another site.
 * Said once, here, for the instance that serves an app and for `volvel dev` that serves it
 * while it is written, so that what breaks when deployed breaks in development.
 */
export function appPolicy(
  /** Only for a development server, whose tooling puts a few inline scripts in the page. */
  development?: { nonce: string; connect: readonly string[] },
): string {
  return [
    "default-src 'self'",
    development ? `script-src 'self' 'nonce-${development.nonce}'` : "script-src 'self'",
    // Components set styles on elements, which a policy without this would refuse.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    development ? `connect-src 'self' ${development.connect.join(" ")}` : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/** The policy of an app as deployed. */
export const APP_POLICY = appPolicy();

/**
 * What a page of an app written as code may do besides (decision 0008): it is sandboxed, with
 * no origin of its own. It reads no other page at its address, the browser sends it no cookie,
 * and it keeps nothing in the browser's storage; it calls the API with its app token. It may
 * run scripts, send forms, open other windows as ordinary pages, download, and ask with
 * `confirm()`.
 */
export const CODE_APP_SANDBOX =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals";

/** The policy of a page of an app written as code, deployed or in development. */
export function codeAppPolicy(development?: Parameters<typeof appPolicy>[0]): string {
  return `${appPolicy(development)}; ${CODE_APP_SANDBOX}`;
}

export const CODE_APP_POLICY = codeAppPolicy();

/**
 * Said on each file of an app written as code, which is served without a sign-in by a name made
 * from the app's files. A page's script loads it; opened by itself it is a page with no origin
 * and no network, so a picture or a page among the files can do nothing where it is served.
 */
export const CODE_APP_FILE_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

/**
 * What the frame of a developer's widget may load and do (decision 0005): its own script and
 * inline styles, images it is given, and nothing else. No `connect-src`, so `default-src 'none'`
 * leaves it no network: it cannot fetch, open a socket or send a beacon. `sandbox
 * allow-scripts` is the host's iframe attribute said again by the page itself: opened on its
 * own, not in a frame, it still has no origin, so it never holds the cookies of the address that
 * serves it and the files may be served at the console's address when an instance has no other.
 */
export const WIDGET_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:; sandbox allow-scripts";
