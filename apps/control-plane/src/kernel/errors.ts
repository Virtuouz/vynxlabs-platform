import type { ErrorCode } from "@volvel/manifest";

/**
 * An error that maps directly to an HTTP problem response. Its code is one of the
 * registered ones (`ERROR_CODES`): a new code is added there first, with what it means.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly problemCode: ErrorCode;
  readonly issues: { path: string; message: string }[] | undefined;
  /** Headers the response carries, such as `retry-after`. */
  readonly headers: Record<string, string> | undefined;

  constructor(
    statusCode: number,
    problemCode: ErrorCode,
    detail: string,
    issues?: { path: string; message: string }[],
    headers?: Record<string, string>,
  ) {
    super(detail);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.problemCode = problemCode;
    this.issues = issues;
    this.headers = headers;
  }
}

export const notFound = (what: string) => new HttpError(404, "not_found", `${what} was not found.`);
export const forbidden = (permission: string) =>
  new HttpError(403, "forbidden", `This needs the ${permission} permission.`);
/** A 403 whose reason is a whole sentence, for what is not one permission's name. */
export const forbiddenBecause = (sentence: string) => new HttpError(403, "forbidden", sentence);
/**
 * Someone not signed in may not start a script or a flow: they could never read the run
 * back, nor follow it. A form of a page still starts them, for it needs no answer.
 */
export const guestStart = (what: "script" | "flow") =>
  new HttpError(
    403,
    "forbidden",
    `Sign in to start a ${what}. A run started by someone who is not signed in cannot be read back.`,
  );
export const unauthenticated = (detail = "Sign in or send an API key.") =>
  new HttpError(401, "unauthenticated", detail);
export const badRequest = (detail: string, issues?: { path: string; message: string }[]) =>
  new HttpError(400, issues ? "validation_failed" : "bad_request", detail, issues);
export const conflict = (detail: string) => new HttpError(409, "conflict", detail);

/** The database is busy: the request waited too long for a connection. Safe to try again. */
export const busy = (retryAfterSeconds = 2) =>
  new HttpError(503, "busy", "The database is busy. Try again in a moment.", undefined, {
    "retry-after": String(retryAfterSeconds),
  });

/** The database takes no writes for now: its disk is full, or it is in maintenance. */
export const readOnly = () =>
  new HttpError(
    503,
    "read_only",
    "The database is taking no changes for now: its disk may be full, or it is in maintenance. " +
      "Reading still works. Try again later.",
    undefined,
    { "retry-after": "30" },
  );
