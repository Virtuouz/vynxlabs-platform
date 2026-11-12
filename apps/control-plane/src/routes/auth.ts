import type { FastifyPluginAsync } from "fastify";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { sendProblem } from "../problem.js";

/**
 * Sign-in, sign-out, session and password routes, served by the
 * authentication library. Its responses pass through, except errors, which are
 * rewritten as problem details like every other route's.
 */
export function authRoutes(kernel: Kernel): FastifyPluginAsync {
  return async (app) => {
    app.route({
      method: ["GET", "POST"],
      url: "/auth/*",
      config: { access: access.public },
      // Described by merging the library's own description into /openapi.json.
      schema: { hide: true },
      handler: async (request, reply) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (value !== undefined)
            headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const hasBody = request.method === "POST" && request.body !== undefined;
        const response = await kernel.auth.handler(
          new Request(new URL(request.url, kernel.config.publicUrl), {
            method: request.method,
            headers,
            ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
          }),
        );

        for (const cookie of response.headers.getSetCookie()) {
          reply.header("set-cookie", cookie);
        }
        const text = await response.text();
        if (response.status >= 400) {
          let parsed: { code?: string; message?: string } = {};
          try {
            parsed = JSON.parse(text);
          } catch {
            // Not JSON. The status code alone describes the problem.
          }
          return sendProblem(request, reply, response.status, {
            ...(parsed.code ? { code: parsed.code.toLowerCase() } : {}),
            ...(parsed.message ? { detail: parsed.message } : {}),
          });
        }
        response.headers.forEach((value, name) => {
          if (name !== "set-cookie" && name !== "content-length") reply.header(name, value);
        });
        return reply.code(response.status).send(text === "" ? null : text);
      },
    });
  };
}
