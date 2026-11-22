import { sql } from "@volvel/db";
import {
  type DashboardBody,
  filtersOf,
  type InterfaceBody,
  PATH_PATTERN,
  type Page,
  type PageFilter,
  type PageWidget,
} from "@volvel/manifest";
import { badRequest, forbidden, notFound } from "../errors.js";
import { findWorkspace, type RequestContext } from "../http.js";
import type { Kernel } from "../kernel.js";

const pathPattern = new RegExp(PATH_PATTERN);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PageRequest {
  of: "interface" | "dashboard";
  path: string;
  page?: string | undefined;
  /** A boolean, or the query string's `1` / `true`. */
  draft?: boolean | string | undefined;
}

export interface LocatedPage {
  at: { tenantId: string; workspaceId: string };
  surface: "app" | "dashboard";
  /** The page an interface's widget is on; a dashboard has none. */
  page: Page | undefined;
  widgets: readonly PageWidget[];
  filters: readonly PageFilter[];
  /** For a record page, a sheet or a modal: the table of its record. */
  recordTable: string | undefined;
  /** What a recorded query follows: the deployed resource, and an interface's page. */
  follow: { pageId: string; page?: string } | undefined;
  /** The app that serves the interface, for saying where an action came from. */
  app: string | null;
  /** The path of the interface or the dashboard, or a member's dashboard's ID. */
  path: string;
}

/**
 * Finds the page a request names as the caller may read it: the deployed one, or the draft for
 * someone who may edit it in a dev workspace. The same rules as `widget-data` reads a page by,
 * so that an action is run only where its widget is shown.
 */
export async function locatePage(
  kernel: Kernel,
  ctx: RequestContext,
  params: { t: string; w: string },
  query: PageRequest,
): Promise<LocatedPage> {
  const { db } = kernel;
  const workspace = await findWorkspace(kernel, params.t, params.w);
  const at = { tenantId: params.t, workspaceId: params.w };
  const wantsDraft = query.draft === true || query.draft === "1" || query.draft === "true";

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
      throw forbidden("to edit this page, in a dev workspace, which a draft is read or run by");
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
    let app: string | null = null;
    if (found) {
      const apps = await db
        .selectFrom("resource")
        .select(["id", "path", "body"])
        .where("workspace_id", "=", workspace.id)
        .where("kind", "=", "app")
        .orderBy("path")
        .execute();
      for (const candidate of apps) {
        if ((candidate.body as { interface?: string }).interface !== query.path) continue;
        app ??= candidate.path;
        if (allowed) break;
        if (await ctx.allowed("app:read", { ...at, resourceId: candidate.id })) {
          allowed = true;
          app = candidate.path;
          break;
        }
      }
    }
    if (!found || !allowed) throw notFound("The interface");
    const body = found.body as unknown as InterfaceBody;
    const page = body.pages.find((one) => one.id === query.page);
    if (!page) throw notFound("The page");
    return {
      at,
      surface: "app",
      page,
      widgets: page.widgets,
      filters: filtersOf(page.widgets),
      recordTable: page.record?.table,
      follow: found.deployed && found.id ? { pageId: found.id, page: page.id } : undefined,
      app,
      path: query.path,
    };
  }

  await ctx.authorize("dashboard:read", at);
  const me = ctx.principal.type === "member" ? ctx.principal.id : null;
  let body: DashboardBody | undefined;
  let follow: LocatedPage["follow"];
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
      if (found.deployed && found.id) follow = { pageId: found.id };
    }
  }
  if (!body) throw notFound("The dashboard");
  return {
    at,
    surface: "dashboard",
    page: undefined,
    widgets: body.widgets,
    filters: filtersOf(body.widgets),
    recordTable: undefined,
    follow,
    app: null,
    path: query.path,
  };
}
