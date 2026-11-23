import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { badRequest } from "../kernel/errors.js";
import { access, guestLimit, type RequestContext } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { runAction } from "../kernel/pages/act.js";
import { isTimeZone } from "../kernel/zones.js";
import { AnyObject, Id } from "./shared.js";

/**
 * Runs one action of a page (S9, decision 0004). A deployed action is its own grant: whoever may
 * open the app may run it, and it changes only what it names. The work is in `kernel/pages/act.ts`.
 */
export function pageActionRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.post(
      "/tenants/:t/workspaces/:w/page-actions",
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "Run an action of a page",
          description:
            "Runs the action a widget holds at `at`: `on/<event>`, `config/<property>` or " +
            "`config/<property>/<index>/action`. The records it works on are read as the caller " +
            "reads them, under each table's row policy. The `when` conditions are checked again " +
            "on the server (403 with the words if they no longer hold). Data steps run in one " +
            "transaction and change only the fields they name, as the action's own grant: the " +
            "caller needs `app:read` on an app that serves the page, not `data:write`. Flows and " +
            "scripts start after the commit, as the caller, marked with where they came from. " +
            "`inputs` holds what the confirmation asked, or what a form was given, by field " +
            "name; an input the action doesn't ask for is refused. A dashboard's actions run no " +
            "data step. An action that names groups in `runBy` is run only by their members (403 " +
            '"Only A and B can do this." otherwise). `records.events` (1 to 200 IDs) runs the ' +
            "action once per row, all in one transaction: if one row can't, none changes; " +
            '`changed` says how many. `at: "config/edit"` on a Record detail with `edit` on ' +
            "updates, from `inputs` by column, the columns it shows, on `records.this`. With `draft`, the draft is run, for someone who may edit it in a dev " +
            "workspace. Answers the steps the browser does next, with each record named by its ID.",
          tags: ["apps", "dashboards"],
          params: Type.Object({ t: Id, w: Id }),
          body: Type.Object(
            {
              of: Type.Union([Type.Literal("interface"), Type.Literal("dashboard")]),
              path: Type.String({ minLength: 1, maxLength: 255 }),
              page: Type.Optional(Type.String({ maxLength: 40 })),
              widget: Type.String({ minLength: 1, maxLength: 40 }),
              at: Type.String({ minLength: 1, maxLength: 120 }),
              records: Type.Optional(
                Type.Object(
                  {
                    this: Type.Optional(Type.String({ maxLength: 200 })),
                    event: Type.Optional(Type.String({ maxLength: 200 })),
                    events: Type.Optional(
                      Type.Array(Type.String({ maxLength: 200 }), { minItems: 1, maxItems: 200 }),
                    ),
                  },
                  { additionalProperties: false },
                ),
              ),
              inputs: Type.Optional(AnyObject),
              draft: Type.Optional(Type.Boolean()),
              zone: Type.Optional(
                Type.String({
                  maxLength: 64,
                  description:
                    "The reader's time zone, such as America/Los_Angeles: what a step's today and now are, and where a day begins for a time. UTC when left out.",
                }),
              ),
            },
            { additionalProperties: false },
          ),
          response: {
            200: Type.Object({
              client: Type.Array(AnyObject),
              made: Type.Optional(Type.Object({ table: Type.String(), id: Type.String() })),
              message: Type.Optional(Type.String()),
              changed: Type.Optional(Type.Integer()),
              started: Type.Optional(
                Type.Integer({ description: "How many scripts and flows it started." }),
              ),
              notStarted: Type.Optional(
                Type.Array(Type.Object({ do: Type.String(), path: Type.String() }), {
                  description: "What could not be started after the data was saved.",
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params, body }) => {
        if (body.zone !== undefined && !isTimeZone(body.zone)) {
          throw badRequest(`${body.zone} is not a time zone.`);
        }
        return runAction(kernel, ctx as RequestContext, params, body);
      },
    );
  };
}
