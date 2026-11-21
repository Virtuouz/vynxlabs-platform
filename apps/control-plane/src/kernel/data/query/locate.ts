import { sql } from "@volvel/db";
import {
  type DashboardBody,
  type InterfaceBody,
  PATH_PATTERN,
  type PageFilter,
  type PageWidget,
} from "@volvel/manifest";
import { badRequest, forbidden, notFound } from "../../errors.js";
import { findWorkspace, type RequestContext } from "../../http.js";
import type { Kernel } from "../../kernel.js";

const pathPattern = new RegExp(PATH_PATTERN);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds the page a request names, as the caller may read it: its widgets, filters and where it
 * was deployed. Shared by the routes that read a page's data (`widget-data`, `filter-options`,
 * `widget-choices`), so that each is authorized the same way.
 */
export async function locatePage(
  kernel: Kernel,
  ctx: RequestContext,
  params: { t: string; w: string },
  query: {
    of: "interface" | "dashboard";
    path: string;
    page?: string | undefined;
    draft?: string | undefined;
  },
) {
  const { db } = kernel;
  const workspace = await findWorkspace(kernel, params.t, params.w);
  const at = { tenantId: params.t, workspaceId: params.w };
  const wantsDraft = query.draft === "1" || query.draft === "true";
  /** The page as it is stored: the draft, for someone who may edit it, else what is deployed. */
  const stored = async (
    kind: "interface" | "dashboard",
    path: string,
    mayEdit: () => Promise<boolean>,
  ) => {
    const live = await db
      .selectFrom("resource")
      .select(["id", "key", "body"])
      .where("workspace_id", "=", workspace.id)
      .where("kind", "=", kind)
      .where((eb) => (UUID.test(path) ? eb("id", "=", path) : eb("path", "=", path)))
      .executeTakeFirst();
    if (!wantsDraft) return live ? { id: live.id, body: live.body, deployed: true } : undefined;
    const where = await db
      .selectFrom("workspace")
      .select("type")
      .where("id", "=", workspace.id)
      .executeTakeFirstOrThrow();
    if (where.type !== "dev" || !(await mayEdit())) {
      throw forbidden("to edit this page, in a dev workspace, which a draft is read by");
    }
    const draft = await db
      .selectFrom("resource_draft")
      .select(["body", "deleted"])
      .where("workspace_id", "=", workspace.id)
      .where("kind", "=", kind)
      .where((eb) => (live ? eb("key", "=", live.key) : eb("path", "=", path)))
      .executeTakeFirst();
    if (draft?.deleted) return undefined;
    if (draft) return { id: live?.id, body: draft.body, deployed: false };
    return live ? { id: live.id, body: live.body, deployed: true } : undefined;
  };

  let widgets: readonly PageWidget[];
  let filters: readonly PageFilter[];
  let surface: "app" | "dashboard";
  let follow: { pageId: string; page?: string } | undefined;
  /** For a record page, a sheet or a modal: the table of its record. */
  let recordTable: string | undefined;

  if (query.of === "interface") {
    if (!pathPattern.test(query.path)) throw badRequest("The path is not valid.");
    if (query.page === undefined)
      throw badRequest("An interface's widget is on a page: say which with `page`.");
    const found = await stored("interface", query.path, async () => {
      return (
        (await ctx.allowed("resource:write", at)) || (await ctx.allowed("interface:write", at))
      );
    });
    // Someone who may open none of the apps that show it is told the same as when it is not there.
    let allowed =
      (await ctx.allowed("resource:read", at)) || (await ctx.allowed("interface:read", at));
    if (!allowed && found) {
      const apps = await db
        .selectFrom("resource")
        .select(["id", "body"])
        .where("workspace_id", "=", workspace.id)
        .where("kind", "=", "app")
        .execute();
      for (const candidate of apps) {
        if ((candidate.body as { interface?: string }).interface !== query.path) continue;
        if (await ctx.allowed("app:read", { ...at, resourceId: candidate.id })) {
          allowed = true;
          break;
        }
      }
    }
    if (!found || !allowed) throw notFound("The interface");
    const body = found.body as unknown as InterfaceBody;
    const page = body.pages.find((one) => one.id === query.page);
    if (!page) throw notFound("The page");
    widgets = page.widgets;
    filters = page.filters ?? [];
    recordTable = page.record?.table;
    surface = "app";
    if (found.deployed && found.id) follow = { pageId: found.id, page: page.id };
  } else {
    await ctx.authorize("dashboard:read", at);
    const me = ctx.principal.type === "member" ? ctx.principal.id : null;
    let body: DashboardBody | undefined;
    let kept: { id: string; deployed: boolean } | undefined;
    if (UUID.test(query.path) && me) {
      // A member's own dashboard: theirs, shared with everyone, or with a group of theirs.
      const mine = await db
        .selectFrom("member_dashboard")
        .select(["id", "member_id", "body"])
        .where("workspace_id", "=", workspace.id)
        .where("id", "=", query.path)
        .where(
          sql<boolean>`(
                  member_id = ${me}
                  or shared
                  or exists (
                    select 1 from dashboard_share s
                    join group_member g on g.group_id = s.group_id
                    where s.dashboard_id = member_dashboard.id and g.member_id = ${me}
                  )
                )`,
        )
        .executeTakeFirst();
      if (mine) {
        if (wantsDraft && mine.member_id !== me) {
          throw forbidden("to be the member whose dashboard this is");
        }
        body = mine.body as unknown as DashboardBody;
      }
    }
    if (!body) {
      const found = await stored("dashboard", query.path, () => ctx.allowed("resource:write", at));
      if (found) {
        body = found.body as unknown as DashboardBody;
        if (found.deployed && found.id) kept = { id: found.id, deployed: true };
      }
    }
    if (!body) throw notFound("The dashboard");
    widgets = body.widgets;
    filters = body.filters ?? [];
    surface = "dashboard";
    if (kept) follow = { pageId: kept.id };
  }
  return { at, surface, filters, widgets, follow, recordTable };
}
