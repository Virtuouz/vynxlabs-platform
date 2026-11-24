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
 * What the frame of a developer's widget may load and do (decision 0005): its own script and
 * inline styles, images it is given, and nothing else. No `connect-src`, so `default-src 'none'`
 * leaves it no network: it cannot fetch, open a socket or send a beacon.
 */
export const WIDGET_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:";
