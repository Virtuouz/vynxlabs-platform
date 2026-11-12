/** An error that maps directly to an HTTP problem response. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly problemCode: string;
  readonly issues: { path: string; message: string }[] | undefined;

  constructor(
    statusCode: number,
    problemCode: string,
    detail: string,
    issues?: { path: string; message: string }[],
  ) {
    super(detail);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.problemCode = problemCode;
    this.issues = issues;
  }
}

export const notFound = (what: string) => new HttpError(404, "not_found", `${what} was not found.`);
export const forbidden = (permission: string) =>
  new HttpError(403, "forbidden", `This needs the ${permission} permission.`);
export const unauthenticated = (detail = "Sign in or send an API key.") =>
  new HttpError(401, "unauthenticated", detail);
export const badRequest = (detail: string, issues?: { path: string; message: string }[]) =>
  new HttpError(400, issues ? "validation_failed" : "bad_request", detail, issues);
export const conflict = (detail: string) => new HttpError(409, "conflict", detail);
