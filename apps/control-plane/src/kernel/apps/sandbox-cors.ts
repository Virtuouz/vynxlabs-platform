/**
 * The API answers a page with no origin of its own: an app written as code, which is served
 * sandboxed (decision 0008). Such a page sends `Origin: null` and no cookie, and acts with its
 * app token in the Authorization header. It is allowed to read what the API answers it, and
 * nothing more: credentials are never allowed, so a sandboxed page anywhere else gains only
 * what a caller with no sign-in has. A page with a real origin is answered as before, with no
 * CORS at all.
 */
export const SANDBOX_ORIGIN = "null";

/** The headers that let a sandboxed page read an answer. */
export const SANDBOX_CORS_HEADERS: Readonly<Record<string, string>> = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers":
    "retry-after, x-request-id, x-trace-id, location, link, deprecation, sunset",
};

/** The headers the app client sends, always allowed. */
const CLIENT_HEADERS = ["authorization", "content-type", "idempotency-key", "last-event-id"];

/**
 * What a preflight is answered with: the methods the API takes, and the headers the client sends
 * besides any the browser says it will add (an extension or a test may add one of its own).
 * Nothing it allows is a credential: the page has no cookie, and what it acts with is its token.
 */
export function preflightFor(asked: string | string[] | undefined): Record<string, string> {
  const named = String(asked ?? "")
    .split(",")
    .map((one) => one.trim().toLowerCase())
    .filter((one) => /^[a-z0-9-]{1,64}$/.test(one));
  return {
    ...SANDBOX_CORS_HEADERS,
    "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE",
    "access-control-allow-headers": [...new Set([...CLIENT_HEADERS, ...named])].join(", "),
    "access-control-max-age": "600",
  };
}

export const fromSandbox = (origin: string | string[] | undefined) => origin === SANDBOX_ORIGIN;
