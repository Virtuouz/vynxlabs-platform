import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { access, guestLimit, type RequestContext } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { decideFromPage } from "../kernel/pages/approvals.js";
import { Id } from "./shared.js";

/**
 * Decides an approval from an app's page (decision 0007). What an approvals widget shows is
 * read by `widget-data`, like every widget's data; this is its one write. The work, and the rules
 * that make it safe, are in `kernel/pages/approvals.ts`.
 */
export function pageApprovalRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.post(
      "/tenants/:t/workspaces/:w/page-approvals",
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "Approve or reject a waiting approval from an app's page",
          description:
            "Decides a step that the Approvals widget `widget` of the interface page shows. The " +
            "widget is found in the page as it is stored (the draft only for someone who may edit " +
            "it, in a dev workspace), and needs what opening the page needs. Only a member decides, " +
            "and as themselves: they must hold `approval:read` and `approval:write` of their own " +
            "here (an operator's access grant does not count, nor does a suspended or disabled " +
            "member) and be among the step's named approvers, if it names any. An end user, a " +
            "guest and a service account are refused. The step must wait, in this workspace, in a " +
            "flow the widget lists; someone having decided it first is a 409 that says who and " +
            "what. The comment is trimmed, at most 2000 characters, and needed as the widget's " +
            "`askWhy` says. At an address where an app written as code can run, a decision is " +
            "refused with 403 `decide_in_console`: it is made in the console. Recorded in the audit as `approval.approved` or `approval.rejected`, " +
            'with `via: "app"` and the app, page and widget named.',
          tags: ["apps", "flows"],
          params: Type.Object({ t: Id, w: Id }),
          body: Type.Object(
            {
              path: Type.String({ minLength: 1, maxLength: 255 }),
              page: Type.String({ minLength: 1, maxLength: 40 }),
              widget: Type.String({ minLength: 1, maxLength: 40 }),
              id: Type.String({ minLength: 3, maxLength: 300 }),
              decision: Type.Union([Type.Literal("approve"), Type.Literal("reject")]),
              comment: Type.Optional(Type.String({ maxLength: 4000 })),
              draft: Type.Optional(Type.Boolean()),
            },
            { additionalProperties: false },
          ),
          response: {
            200: Type.Object({
              decision: Type.Union([Type.Literal("approve"), Type.Literal("reject")]),
              title: Type.String(),
              flow: Type.Object({ path: Type.String(), title: Type.String() }),
              by: Type.String(),
            }),
          },
        },
      },
      async (request) => {
        const { ctx, params, body } = request;
        return decideFromPage(kernel, ctx as RequestContext, params, {
          of: "interface",
          ...body,
          elsewhere: kernel.hosts.runsCodeApps(await kernel.hosts.place(request)),
        });
      },
    );
  };
}
