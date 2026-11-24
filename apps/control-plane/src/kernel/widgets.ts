import { type InterfaceBody, type WidgetBody, workspaceRegistry } from "@volvel/manifest";
import type { DeployedWidget, WidgetRegistry } from "@volvel/widgets";
import type { Kernel } from "./kernel.js";

/** A deployed widget as the API says it: `DeployedWidget` of `@volvel/widgets`, its definition loosely typed. */
export interface WireWidget {
  type: string;
  current: string;
  versions: { version: string; definition: Record<string, unknown> }[];
}

/**
 * The widgets a workspace has beside the platform's: the `widget` resources it deployed
 * (decision 0005). Each is a version of a tenant's widget; the definition is the body, less
 * the path of the view's source, which the platform never reads.
 *
 * The one place that says what a workspace's widgets are: the route that lists them, the
 * page checks and the data route all read it, so they cannot disagree.
 */
export async function deployedWidgets(kernel: Kernel, workspaceId: string): Promise<WireWidget[]> {
  const rows = await kernel.db
    .selectFrom("resource")
    .select(["path", "body"])
    .where("workspace_id", "=", workspaceId)
    .where("kind", "=", "widget")
    .orderBy("path")
    .execute();
  return rows.map((row) => {
    const { entry: _entry, ...definition } = row.body as unknown as WidgetBody;
    return {
      type: row.path,
      current: definition.version,
      versions: [
        { version: definition.version, definition: definition as Record<string, unknown> },
      ],
    };
  });
}

/** The platform's widgets and the workspace's own: what its pages are checked and read against. */
export async function workspaceWidgets(
  kernel: Kernel,
  workspaceId: string,
): Promise<WidgetRegistry> {
  return workspaceRegistry(
    (await deployedWidgets(kernel, workspaceId)) as unknown as DeployedWidget[],
  );
}

/** The tenant widgets an interface's pages use, as a served app draws them. */
export async function widgetsUsed(
  kernel: Kernel,
  workspaceId: string,
  body: InterfaceBody,
): Promise<WireWidget[]> {
  const used = new Set(body.pages.flatMap((page) => page.widgets.map((widget) => widget.type)));
  return (await deployedWidgets(kernel, workspaceId)).filter((widget) => used.has(widget.type));
}
