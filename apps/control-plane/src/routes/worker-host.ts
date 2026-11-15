import { setTimeout as sleep } from "node:timers/promises";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import {
  claimManagedSlot,
  endManagedSlot,
  tenantsNeedingWorkers,
} from "../kernel/execution/supervisor.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id, NoContent } from "./shared.js";

/** The longest a lease request is held open waiting for work. */
const MAX_WAIT_SECONDS = 25;
/** A worker a host starts exits after this long with nothing to do. */
const IDLE_EXIT_SECONDS = 60;

/**
 * The worker host (decision 0001): a container of its own, on a network that
 * reaches the control plane and the internet and nothing else of the
 * instance's, which starts each managed worker. It holds no tenant credential
 * until it is given a lease: one tenant with work, and a worker credential for
 * it, which it hands to the worker it starts and to nothing else.
 */
export function workerHostRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const config = { access: access.workerHost };

    app.post(
      "/worker-host/lease",
      {
        config,
        schema: {
          summary: "Ask for a tenant to start a worker for",
          description:
            "Held open until a tenant has work and no managed worker alive, or until " +
            "`waitSeconds` pass. Each lease is a new worker credential for one tenant: give it " +
            "to the worker started for it, and say when that worker has ended.",
          tags: ["worker host"],
          body: Type.Object({
            waitSeconds: Type.Optional(
              Type.Integer({ minimum: 0, maximum: MAX_WAIT_SECONDS, default: 20 }),
            ),
          }),
          response: {
            200: Type.Object({
              lease: Type.Union([
                Type.Object({
                  id: Id,
                  tenantId: Id,
                  token: Type.String(),
                  idleExitSeconds: Type.Integer(),
                }),
                Type.Null(),
              ]),
            }),
          },
        },
      },
      async ({ body, raw }) => {
        const deadline = Date.now() + (body.waitSeconds ?? 20) * 1000;
        const gone = () => raw.socket.destroyed;
        for (;;) {
          for (const { tenant_id: tenantId } of await tenantsNeedingWorkers(kernel)) {
            if (gone()) return { lease: null };
            const credential = await claimManagedSlot(kernel, tenantId);
            if (!credential) continue;
            kernel.log.info({ tenantId }, "leased a managed worker to the worker host");
            return {
              lease: {
                id: credential.row.id,
                tenantId,
                token: credential.token,
                idleExitSeconds: IDLE_EXIT_SECONDS,
              },
            };
          }
          if (gone() || Date.now() >= deadline) return { lease: null };
          await sleep(Math.min(1000, Math.max(0, deadline - Date.now())));
        }
      },
    );

    app.post(
      "/worker-host/leases/:id/ended",
      {
        config,
        schema: {
          summary: "Say that the worker started for a lease has ended",
          description: "Its credential is revoked. A worker that is not told so expires in a day.",
          tags: ["worker host"],
          params: Type.Object({ id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ params }, reply) => {
        await endManagedSlot(kernel, params.id);
        return reply.code(204).send(null);
      },
    );
  };
}
