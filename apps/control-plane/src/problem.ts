import { STATUS_CODES } from "node:http";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { type Static, Type } from "typebox";

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

const CODES: Record<number, string> = {
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

export function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  fields: Partial<Pick<Problem, "code" | "detail" | "errors">> = {},
) {
  const problem: Problem = {
    type: "about:blank",
    title: STATUS_CODES[status] ?? "Error",
    status,
    code: fields.code ?? CODES[status] ?? (status >= 500 ? "internal_error" : "bad_request"),
    ...(fields.detail ? { detail: fields.detail } : {}),
    instance: request.url.split("?")[0] as string,
    requestId: request.id,
    ...(fields.errors ? { errors: fields.errors } : {}),
  };
  return reply.code(status).type("application/problem+json").send(JSON.stringify(problem));
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return sendProblem(request, reply, 404, {
    detail: `No route matches ${request.method} ${request.url.split("?")[0]}.`,
  });
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
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
  const status = error.statusCode ?? 500;
  if (status >= 500) {
    request.log.error({ err: error }, "request failed");
    // Internal details stay in the log.
    return sendProblem(request, reply, 500);
  }
  return sendProblem(request, reply, status, { detail: error.message });
}
