import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { deployedWidgets } from "../kernel/widgets.js";
import { AnyObject, Id } from "./shared.js";

/** `DeployedWidget` of `@volvel/widgets`, as the API says it. */
export const DeployedWidgetWire = Type.Object({
  type: Type.String(),
  current: Type.String(),
  versions: Type.Array(Type.Object({ version: Type.String(), definition: AnyObject })),
});

/**
 * The widgets of the workspace's own (`x/...`) that are deployed, with the versions kept: what
 * the console's "Add to page" offers beside the platform's packs, what its inspector is drawn
 * from, and what a served app draws a placed widget with. The answer is `WorkspaceWidgets`
 * of `@volvel/widgets`.
 */
export function workspaceWidgetRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/tenants/:t/workspaces/:w/widgets",
      {
        config: {
          access: access.custom(
            "Needs `resource:read` in the workspace, or `interface:read` alone.",
          ),
        },
        schema: {
          summary: "The widgets a workspace has deployed",
          description:
            'Each widget of the workspace\'s own pack (`x/<name>`), with every version deployed and the definition each had: the title, category and icon "Add to page" lists it by, and the configuration schema with the hints its inspector is drawn from. `current` is the newest version.',
          tags: ["apps", "dashboards"],
          params: Type.Object({ t: Id, w: Id }),
          response: {
            200: Type.Object({
              widgets: Type.Array(DeployedWidgetWire),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const at = { tenantId: params.t, workspaceId: params.w };
        if (!(await ctx.allowed("resource:read", at))) await ctx.authorize("interface:read", at);
        return { widgets: await deployedWidgets(kernel, params.w) };
      },
    );
  };
}
