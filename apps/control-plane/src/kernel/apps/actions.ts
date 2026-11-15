import { sql } from "@vynxlabs/db";
import type { FlowBody, InterfaceBody, WidgetAction } from "@vynxlabs/manifest";
import type { Db } from "../audit.js";
import { appFacing, grants } from "../authorize.js";

/** A target as an interface's actions name it: `script:<path>` or `flow:<path>`. */
export const targetKey = (target: WidgetAction["target"]) => `${target.kind}:${target.path}`;

/** Every action of an interface, on every page. */
export function actionsOf(body: InterfaceBody): WidgetAction[] {
  return body.pages.flatMap((page) =>
    page.widgets.flatMap((widget) => [
      ...(widget.action ? [widget.action] : []),
      ...(widget.actions ?? []),
    ]),
  );
}

/** What starting a target needs, and the resource it is checked at. */
export async function targetResource(db: Db, workspaceId: string, target: WidgetAction["target"]) {
  const found = await db
    .selectFrom("resource")
    .select(["id", "body"])
    .where("workspace_id", "=", workspaceId)
    .where("kind", "=", target.kind)
    .where("path", "=", target.path)
    .executeTakeFirst();
  if (!found) return undefined;
  const body = found.body as Record<string, unknown>;
  const permission = target.kind === "script" ? "run:write" : "flow_run:write";
  if (target.kind === "script") {
    return {
      id: found.id,
      permission,
      description: typeof body.description === "string" ? body.description : null,
      inputSchema: (body.input as Record<string, unknown> | undefined) ?? null,
      startable: true,
    };
  }
  const manual = Object.values((body as unknown as FlowBody).nodes ?? {}).find(
    (node) => node.type === "trigger" && node.trigger.type === "manual",
  );
  return {
    id: found.id,
    permission,
    description: typeof body.description === "string" ? body.description : null,
    inputSchema:
      manual?.type === "trigger" && manual.trigger.type === "manual"
        ? ((manual.trigger.input as Record<string, unknown> | undefined) ?? null)
        : null,
    // A flow starts by hand from its manual trigger, so one with none cannot be an action.
    startable: manual !== undefined,
  };
}

/** One audience an app is shared with: a group, every end user, or anyone. */
export interface Audience {
  type: "group" | "end_user_group" | "end_users" | "anonymous";
  id: string | null;
  name: string;
}

/** The audiences the apps that serve an interface are shared with, by name. */
export async function audiencesOf(
  db: Db,
  workspace: { id: string; tenantId: string },
  interfacePath: string,
): Promise<Audience[]> {
  const apps = (
    await db
      .selectFrom("resource")
      .select(["id", "body"])
      .where("workspace_id", "=", workspace.id)
      .where("kind", "=", "app")
      .execute()
  ).filter((app) => (app.body as { interface?: string }).interface === interfacePath);
  if (apps.length === 0) return [];
  const rows = await sql<{
    principal_type: Audience["type"];
    principal_id: string | null;
    name: string | null;
    permissions: string[];
  }>`
    select b.principal_type, b.principal_id, r.permissions,
      coalesce(g.name, eg.name) as name
    from binding b
    join role r on r.id = b.role_id
    left join principal_group g on b.principal_type = 'group' and g.id = b.principal_id
    left join end_user_group eg on b.principal_type = 'end_user_group' and eg.id = b.principal_id
    where b.tenant_id = ${workspace.tenantId}
      and b.principal_type in ('group', 'end_user_group', 'end_users', 'anonymous')
      and (
        (b.scope_type = 'resource' and b.resource_id in (${sql.join(apps.map((app) => app.id))}))
        or (b.scope_type = 'workspace' and b.workspace_id = ${workspace.id})
      )
  `.execute(db);
  const seen = new Map<string, Audience>();
  for (const row of rows.rows) {
    if (!grants(row.permissions, "app:read")) continue;
    const name =
      row.principal_type === "end_users"
        ? "every end user"
        : row.principal_type === "anonymous"
          ? "anyone"
          : (row.name ?? "a group");
    seen.set(`${row.principal_type}:${row.principal_id ?? ""}`, {
      type: row.principal_type,
      id: row.principal_id,
      name,
    });
  }
  return [...seen.values()];
}

/**
 * Whether everyone in an audience may start a target: a binding to the
 * audience itself, or to one wider that holds all of it, grants the permission
 * at the tenant, the workspace or the target. An end user holds only what apps
 * use, whatever role says.
 */
export async function audienceMay(
  db: Db,
  workspace: { id: string; tenantId: string },
  audience: Audience,
  permission: string,
  resourceId: string,
): Promise<boolean> {
  const endUsers = audience.type === "end_user_group" || audience.type === "end_users";
  if (endUsers && !appFacing(permission)) return false;
  const covering =
    audience.type === "group"
      ? sql`((b.principal_type = 'group' and b.principal_id = ${audience.id}) or b.principal_type = 'anonymous')`
      : audience.type === "end_user_group"
        ? sql`((b.principal_type = 'end_user_group' and b.principal_id = ${audience.id})
            or b.principal_type in ('end_users', 'anonymous'))`
        : audience.type === "end_users"
          ? sql`b.principal_type in ('end_users', 'anonymous')`
          : sql`b.principal_type = 'anonymous'`;
  const rows = await sql<{ permissions: string[] }>`
    select r.permissions from binding b join role r on r.id = b.role_id
    where b.tenant_id = ${workspace.tenantId} and ${covering}
      and (
        b.scope_type = 'tenant'
        or (b.scope_type = 'workspace' and b.workspace_id = ${workspace.id})
        or (b.scope_type = 'resource' and b.resource_id = ${resourceId})
      )
  `.execute(db);
  return rows.rows.some((row) => grants(row.permissions, permission));
}
