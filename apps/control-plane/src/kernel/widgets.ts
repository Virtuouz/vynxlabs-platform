import { createHash } from "node:crypto";
import type {
  Bundle,
  BundleAsset,
  DashboardBody,
  InterfaceBody,
  PageWidget,
} from "@volvel/manifest";
import { workspaceRegistry } from "@volvel/manifest";
import type { DeployedWidget, WidgetRegistry } from "@volvel/widgets";
import type { Db, Trx } from "./audit.js";
import { HttpError } from "./errors.js";

/** The files of one version of a widget, as the bundle that deployed it listed them. */
type Files = { path: string; sha256: string; size: number; contentType: string }[];

const digestOf = (files: Files) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        [...files]
          .sort((a, b) => (a.path < b.path ? -1 : 1))
          .map((file) => [file.path, file.sha256, file.size]),
      ),
    )
    .digest("hex");

const filesOf = (assets: BundleAsset[] | undefined, type: string): Files =>
  (assets ?? [])
    .filter((asset) => asset.app === type)
    .map(({ path, sha256, size, contentType }) => ({ path, sha256, size, contentType }));

/** A page of a workspace that places a widget, for naming it in what refuses. */
export interface WidgetUse {
  /** The interface or dashboard resource's path. */
  resource: string;
  kind: "interface" | "dashboard";
  /** The page of an interface; a dashboard has one. */
  page?: string;
  widget: string;
  version: string | undefined;
}

/** Every placement of a developer's widget in the widgets of one interface or dashboard body. */
export function widgetUses(
  resource: string,
  kind: "interface" | "dashboard",
  body: unknown,
): WidgetUse[] {
  const uses: WidgetUse[] = [];
  const add = (widgets: PageWidget[] | undefined, page?: string) => {
    for (const widget of widgets ?? []) {
      if (!widget.type.startsWith("x/")) continue;
      uses.push({
        resource,
        kind,
        ...(page !== undefined ? { page } : {}),
        widget: widget.type,
        version: widget.version,
      });
    }
  };
  const pages = (body as InterfaceBody).pages;
  if (Array.isArray(pages)) for (const page of pages) add(page.widgets, page.title);
  else add((body as DashboardBody).widgets);
  return uses;
}

/** The sentence that names where something is used: `the page "Sales" of the interface sales`. */
const where = (use: WidgetUse) =>
  use.page !== undefined
    ? `the page "${use.page}" of the interface ${use.resource}`
    : `the dashboard ${use.resource}`;

/**
 * Keeps the version of each widget a bundle carries, with its files. A version's files never
 * change: deploying a version again with other files is refused, in this workspace or in
 * another of the tenant, because the address that serves them names the version alone.
 */
export async function storeWidgetVersions(
  trx: Trx,
  tenantId: string,
  workspaceId: string,
  bundle: { id: string; content: Bundle },
) {
  for (const manifest of bundle.content.manifests) {
    if (manifest.kind !== "widget") continue;
    const { version } = manifest.body as { version: string };
    const files = filesOf(bundle.content.assets, manifest.path);
    const digest = digestOf(files);
    const other = await trx
      .selectFrom("widget_version")
      .select(["files_digest", "workspace_id"])
      .where("tenant_id", "=", tenantId)
      .where("type", "=", manifest.path)
      .where("version", "=", version)
      .where("files_digest", "!=", digest)
      .executeTakeFirst();
    if (other) {
      throw new HttpError(
        409,
        "widget_version_changed",
        `${manifest.path} ${version} is already deployed${other.workspace_id === workspaceId ? "" : " in another workspace of this tenant"} with other files. A version's files never change, because pages are placed with it: raise the widget's version.`,
        [
          {
            path: `/widgets/${manifest.path}/${version}`,
            message: "its files differ from the deployed ones",
          },
        ],
      );
    }
    await trx
      .insertInto("widget_version")
      .values({
        workspace_id: workspaceId,
        tenant_id: tenantId,
        type: manifest.path,
        version,
        definition: JSON.stringify(manifest.body),
        files: JSON.stringify(files),
        files_digest: digest,
        bundle_id: bundle.id,
      })
      .onConflict((conflict) =>
        conflict.columns(["workspace_id", "type", "version"]).doUpdateSet({
          definition: JSON.stringify(manifest.body),
        }),
      )
      .execute();
  }
}

/** The versions deployed in a workspace, by widget type. */
export async function deployedVersions(
  db: Db | Trx,
  workspaceId: string,
): Promise<Map<string, string[]>> {
  const rows = await db
    .selectFrom("widget_version")
    .select(["type", "version"])
    .where("workspace_id", "=", workspaceId)
    .orderBy("type")
    .orderBy("created_at")
    .execute();
  const found = new Map<string, string[]>();
  for (const row of rows) found.set(row.type, [...(found.get(row.type) ?? []), row.version]);
  return found;
}

/** Every placement of a developer's widget on the interfaces and dashboards a workspace has now. */
export async function widgetUsesIn(db: Db | Trx, workspaceId: string): Promise<WidgetUse[]> {
  const rows = await db
    .selectFrom("resource")
    .select(["kind", "path", "body"])
    .where("workspace_id", "=", workspaceId)
    .where("kind", "in", ["interface", "dashboard"])
    .execute();
  // A dashboard a member made for themselves places widgets as one of the workspace's does.
  const own = await db
    .selectFrom("member_dashboard")
    .select(["id", "title", "body"])
    .where("workspace_id", "=", workspaceId)
    .execute();
  return [
    ...rows.flatMap((row) => widgetUses(row.path, row.kind as "interface" | "dashboard", row.body)),
    ...own.flatMap((row) => widgetUses(`"${row.title}"`, "dashboard", row.body)),
  ];
}

/**
 * What is wrong with the versions a body's widgets say they were placed with: a developer's
 * widget placed with no version, or with one this workspace has not deployed. `at` is where the
 * body's widgets are, as a manifest path.
 */
export function versionProblems(
  body: InterfaceBody | DashboardBody,
  deployed: Map<string, string[]>,
): { path: string; message: string }[] {
  const problems: { path: string; message: string }[] = [];
  const check = (widgets: PageWidget[], at: string) =>
    widgets.forEach((widget, index) => {
      if (!widget.type.startsWith("x/")) return;
      const path = `${at}/widgets/${index}/version`;
      const have = deployed.get(widget.type) ?? [];
      if (widget.version === undefined) {
        problems.push({
          path,
          message: `says which version of ${widget.type} it was placed with${have.length > 0 ? ` (deployed: ${have.join(", ")})` : ""}`,
        });
      } else if (!have.includes(widget.version)) {
        problems.push({
          path,
          message:
            have.length === 0
              ? `${widget.type} is not deployed in this workspace`
              : `${widget.type} has no version ${widget.version} deployed here (deployed: ${have.join(", ")})`,
        });
      }
    });
  if ("pages" in body) {
    for (const [index, page] of body.pages.entries()) check(page.widgets, `/body/pages/${index}`);
  } else check(body.widgets, "/body");
  return problems;
}

/**
 * Refuses a removal of widgets (a whole type, or one version) while a page still places them,
 * naming each page. `version` left out means every version of the type.
 */
export async function refuseWidgetInUse(
  db: Db | Trx,
  workspaceId: string,
  removing: { type: string; version?: string }[],
) {
  if (removing.length === 0) return;
  const uses = (await widgetUsesIn(db, workspaceId)).filter((use) =>
    removing.some(
      (one) =>
        one.type === use.widget && (one.version === undefined || one.version === use.version),
    ),
  );
  if (uses.length === 0) return;
  throw new HttpError(
    409,
    "widget_in_use",
    `A page still places ${uses.length === 1 ? "this widget" : "these widgets"}. Move each to another version or take the widget off it, then remove it.`,
    uses.map((use) => ({
      path: `/${use.kind === "interface" ? "interfaces" : "dashboards"}/${use.resource}`,
      message: `${where(use)} places ${use.widget}${use.version ? ` ${use.version}` : ""}`,
    })),
  );
}

// ---------------------------------------------------------------------------
// The workspace's registry

/** A deployed widget as the API says it: `DeployedWidget` of `@volvel/widgets`, its definition loosely typed. */
export interface WireWidget {
  type: string;
  current: string | null;
  versions: {
    version: string;
    definition: Record<string, unknown>;
    current: boolean;
    deployedAt: string;
    placements: number;
  }[];
}

/**
 * The widgets a workspace has beside the platform's, every version of each: what its pages are
 * checked and read against, and what a served app draws a page with. The listing route says the
 * same, with each version's files.
 */
export async function deployedWidgets(db: Db | Trx, workspaceId: string): Promise<WireWidget[]> {
  const rows = await db
    .selectFrom("widget_version")
    .select(["type", "version", "definition", "created_at"])
    .where("workspace_id", "=", workspaceId)
    .orderBy("type")
    .orderBy("created_at")
    .execute();
  const defined = new Map(
    (
      await db
        .selectFrom("resource")
        .select(["path", "body"])
        .where("workspace_id", "=", workspaceId)
        .where("kind", "=", "widget")
        .execute()
    ).map((row) => [row.path, (row.body as { version: string }).version]),
  );
  const items = new Map<string, WireWidget>();
  for (const row of rows) {
    const widget = items.get(row.type) ?? {
      type: row.type,
      current: defined.get(row.type) ?? null,
      versions: [],
    };
    widget.versions.push({
      version: row.version,
      definition: row.definition as Record<string, unknown>,
      current: defined.get(row.type) === row.version,
      deployedAt: new Date(row.created_at).toISOString(),
      placements: 0,
    });
    items.set(row.type, widget);
  }
  return [...items.values()];
}

/** The platform's widgets and the workspace's own: what its pages are checked and read against. */
export async function workspaceWidgets(db: Db | Trx, workspaceId: string): Promise<WidgetRegistry> {
  return workspaceRegistry((await deployedWidgets(db, workspaceId)) as unknown as DeployedWidget[]);
}

/** The tenant widgets an interface's pages use, as a served app draws them. */
export async function widgetsUsed(
  db: Db | Trx,
  workspaceId: string,
  body: InterfaceBody,
): Promise<WireWidget[]> {
  const used = new Set(body.pages.flatMap((page) => page.widgets.map((widget) => widget.type)));
  return (await deployedWidgets(db, workspaceId)).filter((widget) => used.has(widget.type));
}
