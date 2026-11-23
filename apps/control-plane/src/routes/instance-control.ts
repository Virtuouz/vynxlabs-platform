import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { forgetInstanceControl } from "../kernel/execution/control.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";

const Triggers = Type.Object({
  paused: Type.Boolean({ description: "Whether every trigger in every tenant is paused." }),
  reason: Type.Union([Type.String(), Type.Null()]),
  byEnvironment: Type.Boolean({
    description: "Paused by TRIGGERS_PAUSED, which the console cannot undo: unset it and restart.",
  }),
  updatedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});

/**
 * The operator's emergency stop. With triggers paused across the instance no
 * schedule, source, webhook, form or event starts anything, in any tenant: a
 * schedule keeps its due time and fires once on resuming, a webhook is answered
 * 503 as when its workspace is paused, and an event is kept but starts nothing.
 * Runs already queued or going carry on; cancel them per workspace if need be.
 */
export function instanceControlRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const read = async () => {
      const row = await db.selectFrom("instance_control").selectAll().executeTakeFirst();
      const byEnvironment = kernel.config.limits.triggersPaused;
      return {
        paused: byEnvironment || (row?.triggers_paused ?? false),
        reason: row?.reason ?? null,
        byEnvironment,
        updatedAt: row?.updated_at.toISOString() ?? null,
      };
    };

    app.get(
      "/instance/triggers",
      {
        config: { access: access.instance("instance:read") },
        schema: {
          summary: "Whether every trigger in the instance is paused",
          description:
            "The instance-wide pause for triggers. While it is on, no trigger starts a run.",
          tags: ["instance"],
          response: { 200: Triggers },
        },
      },
      async () => read(),
    );

    app.put(
      "/instance/triggers",
      {
        config: { access: access.instance("instance:write") },
        schema: {
          summary: "Pause or resume every trigger in the instance",
          description:
            "Paused, no schedule, source, webhook, form or event starts anything in any tenant. " +
            "Schedules keep their due times and fire once on resuming. Runs already queued or " +
            "going carry on.",
          tags: ["instance"],
          body: Type.Object({
            paused: Type.Boolean(),
            reason: Type.Optional(Type.String({ maxLength: 500 })),
          }),
          response: { 200: Triggers },
        },
      },
      async ({ ctx, body }) => {
        const reason = body.paused ? body.reason?.trim() || null : null;
        await ctx.mutate(async (trx, audit) => {
          await trx
            .insertInto("instance_control")
            .values({ id: true, triggers_paused: body.paused, reason })
            .onConflict((c) =>
              c
                .column("id")
                .doUpdateSet({ triggers_paused: body.paused, reason, updated_at: new Date() }),
            )
            .execute();
          await audit({
            action: body.paused ? "instance.triggers_paused" : "instance.triggers_resumed",
            targetType: "instance",
            targetId: null,
            details: reason ? { reason } : {},
          });
        });
        forgetInstanceControl(kernel);
        return read();
      },
    );
  };
}
