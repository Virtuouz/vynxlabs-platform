import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { HttpError, unauthenticated } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { MAX_OWN_STREAMS, MAX_STREAMS } from "../kernel/stream.js";
import { TenantParams } from "./shared.js";

/** A comment line now and then keeps proxies from closing a quiet stream. */
const HEARTBEAT_MS = 20_000;

/** The run event stream: what changes in a tenant's runs, as it happens. */
export function streamRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/tenants/:t/stream",
      {
        config: { access: access.custom },
        schema: {
          summary: "What changes in the tenant's runs, as server-sent events",
          description:
            "A `text/event-stream` that stays open. Each event names what changed and where, " +
            "never the data: `run`, `flow_run` and `step` when a status changes, `log` when a " +
            "run writes log lines (at most twice a second per run), and `snapshot` when " +
            "events may have been missed, after which everything shown should be read again. " +
            "Only what the caller may read is sent: script runs in workspaces where it holds " +
            "`run:read`, flow runs and steps where it holds `flow_run:read`. A caller with " +
            "neither anywhere in the tenant, such as an end user of an app, is sent the events " +
            "of the runs and flow runs it started itself, and at most two such streams. " +
            "Otherwise at most five streams per caller. Proxies in front must not buffer the " +
            "response.",
          tags: ["runs"],
          params: TenantParams,
          response: {
            200: Type.String({
              description:
                "`text/event-stream`. Each event's `data` is JSON: `{k, w, id, flow?, node?, s?, p?}`.",
            }),
          },
        },
      },
      async (request, reply) => {
        const { ctx, params } = request;
        if (ctx.principal.type === "anonymous") throw unauthenticated();
        // What the caller may read is decided once, now. A change of rights takes effect
        // when the browser connects again.
        const workspaces = await kernel.db
          .selectFrom("workspace")
          .select("id")
          .where("tenant_id", "=", params.t)
          .execute();
        const may = new Map<string, { scripts: boolean; flows: boolean }>();
        for (const { id } of workspaces) {
          const at = { tenantId: params.t, workspaceId: id };
          const [scripts, flows] = await Promise.all([
            ctx.allowed("run:read", at),
            ctx.allowed("flow_run:read", at),
          ]);
          if (scripts || flows) may.set(id, { scripts, flows });
        }
        // Someone who may read no runs here follows their own, as `GET runs/:id` lets them
        // read those. Someone with no standing in the tenant is told it is not there, as
        // everywhere else.
        // Whoever has an ID follows their own runs wherever they are, besides what they may
        // read: a member who reads runs in one workspace and starts one in another needs
        // its events too.
        const own: string | undefined =
          ctx.principal.id === null ? undefined : `${ctx.principal.type}:${ctx.principal.id}`;
        let ownOnly = false;
        if (may.size === 0) {
          try {
            await ctx.authorize("run:read", { tenantId: params.t });
          } catch (error) {
            const standing = error instanceof HttpError && error.statusCode === 403;
            if (!standing || ctx.principal.id === null) throw error;
            ownOnly = true;
          }
        }

        const raw = reply.raw;
        const send = (event: string, data: unknown) => {
          if (raw.writableEnded) return;
          raw.write(`id: ${Date.now()}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        const unsubscribe = await kernel.stream.subscribe({
          tenantId: params.t,
          may,
          principal: `${ctx.principal.type}:${ctx.principal.id}`,
          ...(own ? { own } : {}),
          ownOnly,
          send,
          close: () => raw.end(),
        });
        if (!unsubscribe) {
          throw new HttpError(
            429,
            "too_many_streams",
            `At most ${ownOnly ? MAX_OWN_STREAMS : MAX_STREAMS} streams may be open at once. Close one first.`,
          );
        }

        reply.hijack();
        raw.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
          "x-request-id": request.id,
        });
        raw.write("retry: 3000\n\n");
        // A browser that comes back after losing the stream may have missed events.
        send(request.headers["last-event-id"] ? "snapshot" : "ready", {});
        const heartbeat = setInterval(() => {
          if (!raw.writableEnded) raw.write(": ping\n\n");
        }, HEARTBEAT_MS);
        const end = () => {
          clearInterval(heartbeat);
          unsubscribe();
        };
        request.raw.once("close", end);
        raw.once("close", end);
      },
    );
  };
}
