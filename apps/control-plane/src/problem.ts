import { STATUS_CODES } from "node:http";
import { isPoolTimeout } from "@volvel/db";
import type { ErrorCode } from "@volvel/manifest";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { type Static, Type } from "typebox";
import { EgressRefused } from "./kernel/egress.js";
import { busy, HttpError, readOnly } from "./kernel/errors.js";

/** RFC 9457 problem details, plus a stable code and the request ID. */
export const Problem = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer(),
    detail: Type.Optional(Type.String()),
    instance: Type.Optional(Type.String()),
    code: Type.String({ description: "Stable machine-readable error code." }),
    requestId: Type.String(),
    errors: Type.Optional(
      Type.Array(Type.Object({ path: Type.String(), message: Type.String() }), {
        description: "Present on validation errors.",
      }),
    ),
  },
  { $id: "Problem", title: "Problem" },
);
export type Problem = Static<typeof Problem>;

const CODES: Record<number, ErrorCode> = {
  400: "bad_request",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  413: "payload_too_large",
  415: "unsupported_media_type",
  429: "rate_limited",
  500: "internal_error",
  503: "unavailable",
};

/** Addresses whose last part is a credential: whoever has it may act. */
const SECRET_PATHS = /\/(hooks|member-password-links|approval-links)\/[^/?]+/g;

/**
 * A request's path as it may be said back or written down. Some addresses hold a secret
 * (a webhook's token, a link's token), and neither an error body, a trace nor a log line
 * may carry it.
 */
export function publicPath(request: { url: string }): string {
  return (request.url.split("?")[0] as string).replace(SECRET_PATHS, "/$1/:token");
}

export function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  fields: Partial<Pick<Problem, "detail" | "errors">> & {
    code?: ErrorCode;
    /**
     * A code that is not the platform's own, passed on as it was given: the
     * sign-in library's, for a sign-in that failed. The only one there is.
     */
    passedOn?: string;
  } = {},
) {
  const problem: Problem = {
    type: "about:blank",
    title: STATUS_CODES[status] ?? "Error",
    status,
    code:
      fields.code ??
      fields.passedOn ??
      CODES[status] ??
      (status >= 500 ? "internal_error" : "bad_request"),
    ...(fields.detail ? { detail: fields.detail } : {}),
    instance: publicPath(request),
    requestId: request.id,
    ...(fields.errors ? { errors: fields.errors } : {}),
  };
  return reply.code(status).type("application/problem+json").send(JSON.stringify(problem));
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return sendProblem(request, reply, 404, {
    detail: `No route matches ${request.method} ${publicPath(request)}.`,
  });
}

/** Postgres error codes that are the caller's doing, not ours. */
const DATABASE_ERRORS: Record<string, [number, ErrorCode, string]> = {
  "23505": [409, "conflict", "That already exists."],
  "23503": [
    409,
    "conflict",
    "It refers to something that does not exist, or is still referred to.",
  ],
  "23514": [400, "bad_request", "A value is not allowed."],
  "22P02": [400, "bad_request", "A value is malformed."],
};

export function errorHandler(
  error: FastifyError | HttpError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // A destination a tenant gave that the egress guard refused: the tenant's to change.
  if (error instanceof EgressRefused) {
    return sendProblem(request, reply, 400, { code: "egress_refused", detail: error.message });
  }
  // The database too busy to hand out a connection, or taking no writes: said as such,
  // with when to try again, never as the server's own failure.
  if (isPoolTimeout(error)) return errorHandler(busy(), request, reply);
  if ((error as { code?: unknown }).code === "25006") {
    return errorHandler(readOnly(), request, reply);
  }
  if ((error as { code?: unknown }).code === "57014") {
    return errorHandler(busy(5), request, reply);
  }
  if (error instanceof HttpError) {
    if (error.headers) reply.headers(error.headers);
    return sendProblem(request, reply, error.statusCode, {
      code: error.problemCode,
      detail: error.message,
      ...(error.issues ? { errors: error.issues } : {}),
    });
  }
  if (error.validation) {
    const where = error.validationContext ?? "body";
    return sendProblem(request, reply, 400, {
      code: "validation_failed",
      detail: `The request ${where} is not valid.`,
      errors: error.validation.map((issue) => ({
        path: `/${where}${issue.instancePath}`,
        message: issue.message ?? "is invalid",
      })),
    });
  }
  const database = typeof error.code === "string" ? DATABASE_ERRORS[error.code] : undefined;
  if (database) {
    return sendProblem(request, reply, database[0], { code: database[1], detail: database[2] });
  }
  const status = error.statusCode ?? 500;
  if (status >= 500) {
    request.log.error({ err: error }, "request failed");
    // Internal details stay in the log.
    return sendProblem(request, reply, 500);
  }
  return sendProblem(request, reply, status, { detail: error.message });
}
