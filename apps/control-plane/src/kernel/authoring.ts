import { fileURLToPath } from "node:url";
import { ComposeError, composeBundle, SOURCE_KINDS, type UnsignedBundle } from "@volvel/compose";
import { newId, sql } from "@volvel/db";
import {
  type Bundle,
  type BundleManifest,
  CORE_PREFIX,
  entryFor,
  keyOf,
  movedFile,
  validateJson,
} from "@volvel/manifest";
import { CORE_RANGE, SDK_VERSION } from "@volvel/sdk";
import { type Audit, type Db, mutate, type Principal, type Trx } from "./audit.js";
import {
  dashboardsNaming,
  type PageBody,
  queryPathsOf,
  renamedQuery,
} from "./dashboard-queries.js";
import { badRequest, conflict, HttpError, notFound } from "./errors.js";
import { loadBundle, storeBundle } from "./execution/bundles.js";
import { deployBundle } from "./execution/deploy.js";
import { onTaskEnded, queueTask } from "./execution/tasks.js";
import type { WorkspaceRef } from "./http.js";
import type { Kernel } from "./kernel.js";

/**
 * Resources written in the console.
 *
 * A save is a draft, kept beside the workspace and changing nothing that
 * runs. Deploying composes the drafts with the workspace's bundle into a new
 * bundle and activates it through the same deploy the CLI uses. So what a
 * workspace runs is always one bundle, and rolling back, promoting, cloning
 * and exporting need to know nothing about drafts.
 */

/** The SDK that console-written code is compiled against: the control plane's own. */
const sdkEntry = fileURLToPath(import.meta.resolve("@volvel/sdk"));

/** Whether a kind's manifest carries source, and so needs the permission to write code. */
export const isCodeKind = (kind: string) => SOURCE_KINDS.includes(kind);

export interface DraftInput {
  path: string;
  kind: string;
  schemaVersion: number;
  body: Record<string, unknown>;
  /** A draft that removes the resource when deployed. */
  deleted?: boolean | undefined;
  /** The revision the draft was at when it was opened. A save from an older one is refused. */
  revision?: number | undefined;
  /**
   * The path the resource is to have once this is deployed, when that is not the path it
   * has: a rename. The draft is then at that path, and the resource keeps its key.
   */
  moveTo?: string | undefined;
  /** What people read. Null takes it away. Left as it is when not given. */
  title?: string | null | undefined;
  /**
   * With a rename of a query: also draft the console's dashboards that name its path, with the
   * new one. Left to a caller who may write any resource, since it drafts resources beyond the query.
   */
  renameDashboards?: boolean | undefined;
  /** A create: refused, as `path_taken`, when the path holds a draft or a deployed resource. */
  create?: boolean | undefined;
  /**
   * For the platform's own writes that replace a draft on purpose, and keep what it held in the
   * history: restoring an earlier version, and the dashboards a query rename drafts. Never given
   * by a route's caller.
   */
  replace?: boolean | undefined;
}

const PRODUCTION_REFUSAL =
  "Resources are edited in a dev workspace and reach production by promotion.";

/** Drafts are for dev workspaces: production changes by deploy and promotion only. */
async function devWorkspace(db: Db | Trx, workspace: WorkspaceRef) {
  const row = await db
    .selectFrom("workspace")
    .select(["type", "active_bundle_id"])
    .where("id", "=", workspace.id)
    .executeTakeFirstOrThrow();
  if (row.type !== "dev") {
    throw new HttpError(409, "production_workspace", PRODUCTION_REFUSAL);
  }
  return row;
}

/**
 * The guard for a direct write to a resource (`PUT` and `DELETE` on a path). A production
 * workspace changes by a deploy or a promotion, which write through the kernel and not through
 * this. A code-managed resource is kept in the repository, so no one writes or deletes it
 * directly, nor makes one. A console-managed one may be written directly by a person whose role
 * may promote to the workspace (`mayDeploy`, from `promotion:write`). The same rule as
 * `devWorkspace`, so they answer alike.
 */
export async function refuseDirectProductionWrite(
  db: Db | Trx,
  workspace: WorkspaceRef,
  write: {
    mayDeploy: () => Promise<boolean>;
    /** The paths the write touches: where it puts the resource, and where it moves it from. */
    paths: string[];
    /** The ownership the write gives. None for a delete. */
    ownership?: "code" | "ui" | undefined;
  },
) {
  const row = await db
    .selectFrom("workspace")
    .select("type")
    .where("id", "=", workspace.id)
    .executeTakeFirstOrThrow();
  if (row.type === "dev") return;
  const held = await db
    .selectFrom("resource")
    .select("ownership")
    .where("workspace_id", "=", workspace.id)
    .where("path", "in", write.paths)
    .execute();
  if (write.ownership === "code" || held.some((one) => one.ownership === "code")) {
    throw new HttpError(
      409,
      "production_workspace",
      "A code-managed resource is kept in the repository and changes in production by a deploy.",
    );
  }
  if (!(await write.mayDeploy()))
    throw new HttpError(409, "production_workspace", PRODUCTION_REFUSAL);
}

/** The bundle a workspace is running, or nothing for a workspace never deployed to. */
async function activeBundle(kernel: Kernel, db: Db | Trx, workspaceId: string) {
  const row = await db
    .selectFrom("workspace")
    .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
    .select(["bundle.id", "bundle.storage_key", "bundle.version"])
    .where("workspace.id", "=", workspaceId)
    .executeTakeFirst();
  return row ? { ...row, content: await loadBundle(kernel, row) } : undefined;
}

/** A base for a workspace with no bundle yet: no resources and no code. */
const emptyBase = (): UnsignedBundle => ({
  formatVersion: 1,
  sdkVersion: SDK_VERSION,
  core: CORE_RANGE,
  manifests: [],
  code: "",
});

/**
 * Takes the workspace row's key-share lock before any draft row is touched. A draft's history
 * row takes it anyway, through its foreign key; taken first, a draft write waits behind a deploy
 * that holds the workspace, instead of holding a draft row the deploy then waits for (a deadlock
 * found by the phase 22 walk: a discard while a deploy settled its drafts).
 */
async function holdWorkspace(trx: Trx, workspaceId: string) {
  await trx
    .selectFrom("workspace")
    .select("id")
    .where("id", "=", workspaceId)
    .forKeyShare()
    .execute();
}

export async function saveDraft(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  principal: Principal,
  input: DraftInput,
) {
  await holdWorkspace(trx, workspace.id);
  await devWorkspace(trx, workspace);
  if (input.path.startsWith(CORE_PREFIX)) {
    throw badRequest("The manifest is not valid.", [
      {
        path: "/path",
        message: `paths under ${CORE_PREFIX} are kept for the platform's own nodes. Choose another path`,
      },
    ]);
  }
  const resource = await trx
    .selectFrom("resource")
    .select(["kind", "ownership", "key"])
    .where("workspace_id", "=", workspace.id)
    .where("path", "=", input.path)
    .executeTakeFirst();
  const existing = await trx
    .selectFrom("resource_draft")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .where("path", "=", input.path)
    .forUpdate()
    .executeTakeFirst();
  // A create never overwrites: the path must hold neither a draft nor a deployed resource.
  if (input.create && (existing || resource)) {
    const kind = existing?.kind ?? resource?.kind ?? input.kind;
    throw new HttpError(
      409,
      "path_taken",
      `${input.path} is the path of ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind.replaceAll("_", " ")}. Choose another path, or open that one.`,
    );
  }
  // The draft is of the resource at its path, or of a new one that takes the path as its key.
  const key = existing?.key ?? resource?.key ?? input.path;
  // A rename: the draft moves to the path the resource is to have. Nothing else may be there.
  const path = input.moveTo ?? input.path;
  if (path !== input.path) {
    if (path.startsWith(CORE_PREFIX)) {
      throw badRequest("The manifest is not valid.", [
        {
          path: "/path",
          message: `paths under ${CORE_PREFIX} are kept for the platform's own nodes`,
        },
      ]);
    }
    const there =
      (await trx
        .selectFrom("resource")
        .select(["kind", "key"])
        .where("workspace_id", "=", workspace.id)
        .where("path", "=", path)
        .executeTakeFirst()) ??
      (await trx
        .selectFrom("resource_draft")
        .select(["kind", "key"])
        .where("workspace_id", "=", workspace.id)
        .where("path", "=", path)
        .executeTakeFirst());
    if (there && there.key !== key) {
      throw new HttpError(
        409,
        "path_taken",
        `${path} is the path of ${/^[aeiou]/.test(there.kind) ? "an" : "a"} ${there.kind.replaceAll("_", " ")}. Choose another, or rename that one first.`,
      );
    }
  }
  // Code is named in the bundle by the key, so that a rename leaves it as it is.
  const body = isCodeKind(input.kind)
    ? { ...input.body, entry: entryFor(input.kind, key) }
    : input.body;
  if (!input.deleted) {
    if (isCodeKind(input.kind) && !body.source) {
      throw badRequest("The manifest is not valid.", [
        { path: "/body/source", message: "is required for a resource written in the console" },
      ]);
    }
    const validation = kernel.kinds.validateManifest({
      kind: input.kind,
      schemaVersion: input.schemaVersion,
      path,
      workspace: workspace.slug,
      ownership: "ui",
      body,
    });
    // A page is built a step at a time: a draft holds an action that has no steps yet, as it holds
    // other unfinished things. The checks of the page say it, and publishing refuses it.
    const unfinished = (issue: { path: string; message: string }) =>
      /\/steps$/.test(issue.path) && issue.message === "must NOT have fewer than 1 items";
    // A flow is built a step at a time as well: one step with a field not yet chosen (the script
    // it runs, the event it waits for) is held in the draft, and a deploy refuses it. What is
    // refused here is a body that is not a flow at all, or a fault outside its steps.
    const unfinishedFlow = (issue: { path: string }) =>
      /^\/(body\/)?nodes\/[^/]+(\/|$)/.test(issue.path);
    if (
      !validation.ok &&
      !(
        ((input.kind === "interface" || input.kind === "dashboard") &&
          validation.issues.every(unfinished)) ||
        (input.kind === "flow" && isFlowShaped(body) && validation.issues.every(unfinishedFlow))
      )
    ) {
      throw badRequest("The manifest is not valid.", validation.issues);
    }
  }

  if (resource && resource.kind !== input.kind) {
    throw conflict(`${input.path} is a ${resource.kind}. A resource cannot change kind.`);
  }
  if (input.deleted && !resource) throw notFound(`The resource at ${input.path}`);
  if (input.deleted && resource?.ownership === "code") {
    throw conflict(
      `${input.path} is managed in the repository. Remove it there, or take it over first.`,
    );
  }

  // A draft is shared by everyone who may write the workspace. Whoever saves says which draft
  // they were looking at (its revision), or that they make a new one (`create`, or a first draft
  // over a deployed resource, which has none yet). A save that says nothing over a draft someone
  // has made since, or one that names a draft that is gone, is a conflict, never an overwrite.
  if (existing && input.revision === undefined && !input.replace) {
    throw new HttpError(
      409,
      "draft_changed",
      input.kind === "doc"
        ? "Someone else saved this page after you opened it. Reload it, then make your change again."
        : "Someone else saved this draft after you opened it. Reload it, then make your change again.",
    );
  }
  if (existing && input.revision !== undefined && input.revision !== existing.revision) {
    throw new HttpError(
      409,
      "draft_changed",
      "Someone else saved this draft after you opened it. Reload it, then make your change again.",
    );
  }
  if (!existing && input.revision !== undefined) {
    throw new HttpError(
      409,
      "draft_changed",
      "This draft was discarded or deployed after you opened it. Reload it, then make your change again.",
    );
  }
  const values = {
    kind: input.kind,
    schema_version: input.schemaVersion,
    path,
    // No title is kept as "", apart from a draft that does not speak of the title at all.
    ...(input.title !== undefined ? { title: input.title ?? "" } : {}),
    body: JSON.stringify(body),
    deleted: input.deleted === true,
    updated_by_type: principal.type,
    updated_by_id: principal.id,
    updated_at: new Date(),
  };
  // What this save replaces is kept, so that no earlier text is lost.
  if (existing) await keepInHistory(trx, existing, "replaced");
  const row = existing
    ? await trx
        .updateTable("resource_draft")
        .set({ ...values, revision: sql`revision + 1` })
        .where("workspace_id", "=", workspace.id)
        .where("path", "=", input.path)
        .returningAll()
        .executeTakeFirstOrThrow()
    : await trx
        .insertInto("resource_draft")
        .values({
          tenant_id: workspace.tenantId,
          workspace_id: workspace.id,
          key,
          ...values,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
  await audit({
    action: "resource.draft_saved",
    targetType: "resource",
    targetId: input.path,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    // The source is not copied into the audit log: the draft and then the bundle hold it.
    details: {
      kind: input.kind,
      revision: row.revision,
      deleted: row.deleted,
      ...(path !== input.path ? { renamedFrom: input.path } : {}),
    },
  });
  // A query renamed: the dashboards made in the console that name its path are drafted with the
  // new one, in this same transaction. A dashboard from the repository is changed there.
  if (input.renameDashboards && input.kind === "query" && !input.deleted && path !== input.path) {
    for (const dashboard of await dashboardsNaming(trx, workspace.id, input.path)) {
      if (dashboard.ownership === "code") continue;
      await saveDraft(kernel, trx, audit, workspace, principal, {
        replace: true,
        path: dashboard.path,
        kind: dashboard.kind,
        schemaVersion: dashboard.schemaVersion,
        body: renamedQuery(dashboard.kind, dashboard.body, input.path, path) as unknown as Record<
          string,
          unknown
        >,
      });
    }
  }
  return { draft: row, takesOver: resource?.ownership === "code" };
}

/** A body that is a flow's graph: steps by name, and the edges between them. */
function isFlowShaped(body: Record<string, unknown>) {
  const nodes = body.nodes;
  return (
    typeof nodes === "object" &&
    nodes !== null &&
    !Array.isArray(nodes) &&
    Array.isArray(body.edges)
  );
}

/** How many earlier versions are kept of one draft. */
const DRAFT_HISTORY_KEPT = 30;

type DraftRow = {
  tenant_id: string;
  workspace_id: string;
  key: string;
  path: string;
  kind: string;
  schema_version: number;
  body: Record<string, unknown>;
  deleted: boolean;
  revision: number;
  updated_by_type: string;
  updated_by_id: string | null;
  updated_at: Date;
};

/** Keeps a draft as it stands in its history, and lets the oldest go beyond the limit. */
async function keepInHistory(trx: Trx, draft: DraftRow, reason: "replaced" | "set_aside") {
  await trx
    .insertInto("resource_draft_history")
    .values({
      id: newId(),
      tenant_id: draft.tenant_id,
      workspace_id: draft.workspace_id,
      key: draft.key,
      path: draft.path,
      kind: draft.kind,
      schema_version: draft.schema_version,
      body: JSON.stringify(draft.body),
      deleted: draft.deleted,
      revision: draft.revision,
      reason,
      saved_by_type: draft.updated_by_type,
      saved_by_id: draft.updated_by_id,
      saved_at: draft.updated_at,
    })
    .execute();
  await sql`
    delete from resource_draft_history where id in (
      select id from resource_draft_history
      where workspace_id = ${draft.workspace_id} and key = ${draft.key}
      order by kept_at desc offset ${DRAFT_HISTORY_KEPT}
    )
  `.execute(trx);
}

/** Sets a draft aside: it stops being a draft, and is kept whole in its history. */
export async function discardDraft(trx: Trx, audit: Audit, workspace: WorkspaceRef, path: string) {
  await holdWorkspace(trx, workspace.id);
  const removed = await setAside(trx, audit, workspace, path);
  // The draft that renamed a query drafted the console's dashboards that name it. They are
  // set aside with it: a dashboard naming the new path whose deployed one names the old path
  // is one the rename drafted, and is not left naming a path that is no longer there.
  if (removed.kind !== "query") return;
  const was = await trx
    .selectFrom("resource")
    .select("path")
    .where("workspace_id", "=", workspace.id)
    .where("key", "=", removed.key)
    .executeTakeFirst();
  if (!was || was.path === removed.path) return;
  for (const dashboard of await dashboardsNaming(trx, workspace.id, removed.path)) {
    if (!dashboard.drafted) continue;
    const deployed = await trx
      .selectFrom("resource")
      .select("body")
      .where("workspace_id", "=", workspace.id)
      .where("key", "=", dashboard.key)
      .executeTakeFirst();
    const before = deployed
      ? queryPathsOf(dashboard.kind, deployed.body as unknown as PageBody)
      : undefined;
    if (!deployed || !before || !dashboard.widgets.some((id) => before.get(id) === was.path))
      continue;
    // Only the draft the rename wrote, as it wrote it: one changed since is someone's work, and
    // is kept (it then names a path that is gone, and runs by the key recorded for it).
    const written = renamedQuery(
      dashboard.kind,
      deployed.body as unknown as PageBody,
      was.path,
      removed.path,
    );
    if (JSON.stringify(dashboard.body) !== JSON.stringify(written)) continue;
    await setAside(trx, audit, workspace, dashboard.path);
  }
}

async function setAside(trx: Trx, audit: Audit, workspace: WorkspaceRef, path: string) {
  const removed = await trx
    .deleteFrom("resource_draft")
    .where("workspace_id", "=", workspace.id)
    .where("path", "=", path)
    .returningAll()
    .executeTakeFirst();
  if (!removed) throw notFound(`A draft at ${path}`);
  await keepInHistory(trx, removed as unknown as DraftRow, "set_aside");
  await audit({
    action: "resource.draft_discarded",
    targetType: "resource",
    targetId: path,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    details: { kind: removed.kind },
  });
  return removed;
}

/** Every string in a value, however deep. */
function stringsOf(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const one of value) stringsOf(one, into);
  else if (value && typeof value === "object") {
    for (const one of Object.values(value)) stringsOf(one, into);
  }
  return into;
}

/**
 * The drafts a test of one draft needs: itself, and every draft it names, however far
 * (a flow's scripts and flows, the connectors and variables a script says it uses, a
 * name written in a script's code). Another person's draft that nothing here names is
 * not among them, so its fault does not stop this test. [] when the test is of
 * something that has no draft, which then runs as it is deployed.
 */
export async function draftsUsedBy(
  db: Db | Trx,
  workspace: WorkspaceRef,
  path: string,
): Promise<string[]> {
  const drafts = await db
    .selectFrom("resource_draft")
    .select(["path", "key", "body"])
    .where("workspace_id", "=", workspace.id)
    .execute();
  const start = drafts.find((draft) => draft.path === path);
  if (!start) return [];
  const used = new Set<string>([start.path]);
  const queue = [start];
  while (queue.length > 0) {
    const strings = stringsOf(queue.pop()?.body);
    for (const other of drafts) {
      if (used.has(other.path)) continue;
      const named = strings.some(
        (text) =>
          text === other.path ||
          text === other.key ||
          (text.length > other.path.length &&
            (text.includes(`"${other.path}"`) ||
              text.includes(`'${other.path}'`) ||
              text.includes(`\`${other.path}\``))),
      );
      if (named) {
        used.add(other.path);
        queue.push(other);
      }
    }
  }
  return [...used];
}

/**
 * The bundle the workspace would run if the drafts were deployed: its active
 * bundle's repository-managed part, and its console-managed resources with
 * the drafts laid over them. `paths` deploys only some of the drafts.
 */
export async function composeDrafts(
  kernel: Kernel,
  db: Db | Trx,
  workspace: WorkspaceRef,
  paths?: readonly string[],
): Promise<{ bundle: Bundle; applied: string[] }> {
  const active = await activeBundle(kernel, db, workspace.id);
  const { digest: _digest, ...base } = active?.content ?? { ...emptyBase(), digest: "" };
  // By key: a draft that renames a resource is still a draft of that resource.
  const managed = new Map<string, BundleManifest>(
    base.manifests
      .filter((manifest) => manifest.ownership === "ui")
      .map((manifest) => [keyOf(manifest), manifest]),
  );
  let drafts = await db
    .selectFrom("resource_draft")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .orderBy("path")
    .execute();
  if (paths) {
    const missing = paths.filter((path) => !drafts.some((draft) => draft.path === path));
    if (missing.length > 0) throw notFound(`A draft at ${missing[0]}`);
    drafts = drafts.filter((draft) => paths.includes(draft.path));
  }
  if (drafts.length === 0) {
    throw new HttpError(409, "nothing_to_deploy", "There are no drafts to deploy.");
  }
  for (const draft of drafts) {
    if (draft.deleted) managed.delete(draft.key);
    else {
      // What the draft does not speak of is kept as the resource has it: the name of its tool.
      const was = managed.get(draft.key);
      const title = draft.title ?? was?.title;
      managed.set(draft.key, {
        kind: draft.kind,
        schemaVersion: draft.schema_version,
        path: draft.path,
        ...(draft.key !== draft.path ? { key: draft.key } : {}),
        ...(title ? { title } : {}),
        ...(was?.mcp ? { mcp: was.mcp } : {}),
        // Its file stays where the repository keeps it, and moves with a rename if it is named for the path.
        ...(was?.source
          ? {
              source: {
                ...was.source,
                file: movedFile(was.source.file, draft.kind, was.path, draft.path),
              },
            }
          : {}),
        ownership: "ui",
        body: draft.body,
      });
    }
  }
  try {
    const bundle = await composeBundle(base, [...managed.values()], { sdkEntry });
    return { bundle, applied: drafts.map((draft) => draft.path) };
  } catch (error) {
    if (!(error instanceof ComposeError)) throw error;
    throw badRequest(
      "The code written in the console does not build.",
      error.problems.map((problem) => {
        const [where, ...rest] = problem.split(": ");
        return { path: where ?? "", message: rest.join(": ") };
      }),
    );
  }
}

/** The console-managed resources a workspace is running, as its active bundle carries them. */
export async function activeConsoleManaged(
  kernel: Kernel,
  db: Db | Trx,
  workspaceId: string,
): Promise<BundleManifest[]> {
  const active = await activeBundle(kernel, db, workspaceId);
  return active?.content.manifests.filter((manifest) => manifest.ownership === "ui") ?? [];
}

/**
 * Deploys a whole set of console-managed resources in place of the one the
 * workspace has: what a pull from the repository does. The repository-managed
 * part of the workspace's bundle is kept as it is.
 */
export async function deployConsoleManaged(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  principal: Principal,
  manifests: readonly BundleManifest[],
  message: string,
  allowDelete: readonly string[] = [],
) {
  await devWorkspace(trx, workspace);
  const active = await activeBundle(kernel, trx, workspace.id);
  const { digest: _digest, ...base } = active?.content ?? { ...emptyBase(), digest: "" };
  let bundle: Bundle;
  try {
    bundle = await composeBundle(base, manifests, { sdkEntry });
  } catch (error) {
    if (!(error instanceof ComposeError)) throw error;
    throw badRequest(
      "The code does not build.",
      error.problems.map((problem) => {
        const [where, ...rest] = problem.split(": ");
        return { path: where ?? "", message: rest.join(": ") };
      }),
    );
  }
  const stored = await storeBundle(kernel, trx, audit, workspace, principal, bundle, "compose");
  return deployBundle(kernel, trx, audit, workspace, principal, stored.bundle.id, {
    message,
    allowDelete,
  });
}

/** Composes the drafts into a bundle, activates it, and clears the drafts it carried. */
export async function deployDrafts(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  principal: Principal,
  options: { paths?: readonly string[] | undefined; message?: string | undefined } = {},
) {
  await devWorkspace(trx, workspace);
  const { bundle, applied } = await composeDrafts(kernel, trx, workspace, options.paths);
  const stored = await storeBundle(kernel, trx, audit, workspace, principal, bundle, "compose");
  const result = await deployBundle(kernel, trx, audit, workspace, principal, stored.bundle.id, {
    ...(options.message ? { message: options.message } : {}),
    // What a deploy of drafts removes was each deleted by name in the console.
    allowDelete: "all",
  });
  await trx
    .deleteFrom("resource_draft")
    .where("workspace_id", "=", workspace.id)
    .where("path", "in", applied)
    .execute();
  return { ...result, applied };
}

/**
 * A bundle uploaded in format 1 or 2 says nothing about console-managed
 * resources: it was built by a CLI that does not know them, or from a
 * repository without their folder. Deployed as it is, it would remove them.
 * So the workspace's console-managed resources are composed onto it first,
 * and the composite is what is deployed.
 *
 * The same holds for a bundle that is format 3 only because its flows use
 * core nodes, which the build adds: the nodes are the platform's, and say
 * nothing of what the workspace made in the console.
 */
export async function keepConsoleManaged(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  principal: Principal,
  bundleId: string,
  /** A preview stays a preview with the console's resources on it. */
  origin: "compose" | "preview" = "compose",
): Promise<string> {
  const row = await trx
    .selectFrom("bundle")
    .select(["id", "storage_key"])
    .where("id", "=", bundleId)
    .where("workspace_id", "=", workspace.id)
    .executeTakeFirst();
  if (!row) return bundleId;
  const { digest: _digest, ...uploaded } = await loadBundle(kernel, row);
  const saysWhatIsManaged = uploaded.manifests.some(
    (manifest) => manifest.ownership === "ui" && !manifest.path.startsWith(CORE_PREFIX),
  );
  if (uploaded.formatVersion >= 3 && saysWhatIsManaged) return bundleId;
  const active = await activeBundle(kernel, trx, workspace.id);
  const managed =
    active?.content.manifests.filter(
      (manifest) => manifest.ownership === "ui" && !manifest.path.startsWith(CORE_PREFIX),
    ) ?? [];
  if (managed.length === 0) return bundleId;
  // What the repository now defines itself is the repository's again.
  const defined = new Set(uploaded.manifests.map((manifest) => manifest.path));
  const kept = managed.filter((manifest) => !defined.has(manifest.path));
  if (kept.length === 0) return bundleId;
  const composite = await composeBundle(uploaded, kept, { sdkEntry });
  return (await storeBundle(kernel, trx, audit, workspace, principal, composite, origin)).bundle.id;
}

/** The largest schema read from code that a draft keeps. */
const MAX_DERIVED_SCHEMA_BYTES = 64 * 1024;

/**
 * Has one of the workspace's workers read what a script draft declares as its
 * `input` and `output`. The control plane never loads the code itself
 * (decision 0001): it composes a preview bundle of the draft, and the worker
 * runs that bundle's `__vx_describe` in a process of its own. Code that does
 * not build is not described; saving it says nothing more.
 */
export async function deriveSchemas(
  kernel: Kernel,
  workspace: WorkspaceRef,
  principal: Principal,
  draft: { path: string; revision: number },
): Promise<string | undefined> {
  // A draft that does not build, or names what the workspace does not have yet, is
  // saved all the same. It is read once it is whole.
  try {
    const { bundle } = await composeDrafts(kernel, kernel.db, workspace, [draft.path]);
    return await describeIn(kernel, workspace, principal, draft, bundle);
  } catch (error) {
    if (error instanceof HttpError) return undefined;
    throw error;
  }
}

async function describeIn(
  kernel: Kernel,
  workspace: WorkspaceRef,
  principal: Principal,
  draft: { path: string; revision: number },
  bundle: Bundle,
): Promise<string> {
  return mutate(kernel.db, { principal }, async (trx, audit) => {
    const stored = await storeBundle(kernel, trx, audit, workspace, principal, bundle, "preview");
    const task = await queueTask(trx, {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      kind: "describe",
      subject: `${draft.revision}:${draft.path}`,
      request: {
        bundle: { id: stored.bundle.id, digest: stored.bundle.digest },
        entry: entryFor("script", draft.path),
      },
    });
    return task.id;
  });
}

/** A schema a worker read from code, if it is one a draft may keep. */
function acceptable(schema: unknown): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  if (Buffer.byteLength(JSON.stringify(schema)) > MAX_DERIVED_SCHEMA_BYTES) return undefined;
  try {
    // Compiling it is the check: one that is not a JSON Schema throws.
    validateJson(schema, {});
  } catch {
    return undefined;
  }
  return schema as Record<string, unknown>;
}

/**
 * What a worker read is written onto the draft, if the draft is still at the
 * revision it was read from: a newer save has a newer task of its own. The
 * revision does not move, since nobody changed what was written.
 */
onTaskEnded("describe", async (kernel, task, outcome) => {
  if (!("result" in outcome)) return;
  const at = (task.subject ?? "").indexOf(":");
  const revision = Number((task.subject ?? "").slice(0, at));
  const path = (task.subject ?? "").slice(at + 1);
  const found = (outcome.result ?? {}) as { input?: unknown; output?: unknown };
  const input = acceptable(found.input);
  const output = acceptable(found.output);
  const draft = await kernel.db
    .selectFrom("resource_draft")
    .select(["body"])
    .where("workspace_id", "=", task.workspace_id)
    .where("path", "=", path)
    .where("revision", "=", revision)
    .where("kind", "=", "script")
    .where("deleted", "=", false)
    .executeTakeFirst();
  if (!draft) return;
  const body = { ...(draft.body as Record<string, unknown>) };
  if (input || output) {
    if (input) body.input = input;
    if (output) body.output = output;
    body.schemaSource = "code";
  } else if (body.schemaSource === "code") {
    // The code no longer declares them: what it said last stays, to be edited by hand.
    delete body.schemaSource;
  } else {
    return;
  }
  await kernel.db
    .updateTable("resource_draft")
    .set({ body: JSON.stringify(body) })
    .where("workspace_id", "=", task.workspace_id)
    .where("path", "=", path)
    .where("revision", "=", revision)
    .execute();
});
