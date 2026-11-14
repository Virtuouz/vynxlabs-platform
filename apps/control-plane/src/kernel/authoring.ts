import { fileURLToPath } from "node:url";
import { ComposeError, composeBundle, SOURCE_KINDS, type UnsignedBundle } from "@vynxlabs/compose";
import { newId, sql } from "@vynxlabs/db";
import { type Bundle, type BundleManifest, CORE_PREFIX, entryFor } from "@vynxlabs/manifest";
import { CORE_RANGE, SDK_VERSION } from "@vynxlabs/sdk";
import type { Audit, Db, Principal, Trx } from "./audit.js";
import { badRequest, conflict, HttpError, notFound } from "./errors.js";
import { loadBundle, storeBundle } from "./execution/bundles.js";
import { deployBundle } from "./execution/deploy.js";
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
const sdkEntry = fileURLToPath(import.meta.resolve("@vynxlabs/sdk"));

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
}

/** Drafts are for dev workspaces: production changes by deploy and promotion only. */
async function devWorkspace(db: Db | Trx, workspace: WorkspaceRef) {
  const row = await db
    .selectFrom("workspace")
    .select(["type", "active_bundle_id"])
    .where("id", "=", workspace.id)
    .executeTakeFirstOrThrow();
  if (row.type !== "dev") {
    throw new HttpError(
      409,
      "production_workspace",
      "Resources are edited in a dev workspace and reach production by promotion.",
    );
  }
  return row;
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

export async function saveDraft(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  principal: Principal,
  input: DraftInput,
) {
  await devWorkspace(trx, workspace);
  if (input.path.startsWith(CORE_PREFIX)) {
    throw badRequest("The manifest is not valid.", [
      {
        path: "/path",
        message: `paths under ${CORE_PREFIX} are kept for the platform's own nodes. Choose another path`,
      },
    ]);
  }
  const body = isCodeKind(input.kind)
    ? { ...input.body, entry: entryFor(input.kind, input.path) }
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
      path: input.path,
      workspace: workspace.slug,
      ownership: "ui",
      body,
    });
    if (!validation.ok) throw badRequest("The manifest is not valid.", validation.issues);
  }

  const resource = await trx
    .selectFrom("resource")
    .select(["kind", "ownership"])
    .where("workspace_id", "=", workspace.id)
    .where("path", "=", input.path)
    .executeTakeFirst();
  if (resource && resource.kind !== input.kind) {
    throw conflict(`${input.path} is a ${resource.kind}. A resource cannot change kind.`);
  }
  if (input.deleted && !resource) throw notFound(`The resource at ${input.path}`);
  if (input.deleted && resource?.ownership === "code") {
    throw conflict(
      `${input.path} is managed in the repository. Remove it there, or take it over first.`,
    );
  }

  const existing = await trx
    .selectFrom("resource_draft")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .where("path", "=", input.path)
    .forUpdate()
    .executeTakeFirst();
  if (existing && input.revision !== undefined && input.revision !== existing.revision) {
    throw new HttpError(
      409,
      "draft_changed",
      "Someone else saved this draft after you opened it. Reload it, then make your change again.",
    );
  }
  const values = {
    kind: input.kind,
    schema_version: input.schemaVersion,
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
          path: input.path,
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
    details: { kind: input.kind, revision: row.revision, deleted: row.deleted },
  });
  return { draft: row, takesOver: resource?.ownership === "code" };
}

/** How many earlier versions are kept of one draft. */
const DRAFT_HISTORY_KEPT = 30;

type DraftRow = {
  tenant_id: string;
  workspace_id: string;
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
      where workspace_id = ${draft.workspace_id} and path = ${draft.path}
      order by kept_at desc offset ${DRAFT_HISTORY_KEPT}
    )
  `.execute(trx);
}

/** Sets a draft aside: it stops being a draft, and is kept whole in its history. */
export async function discardDraft(trx: Trx, audit: Audit, workspace: WorkspaceRef, path: string) {
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
  const managed = new Map<string, BundleManifest>(
    base.manifests
      .filter((manifest) => manifest.ownership === "ui")
      .map((manifest) => [manifest.path, manifest]),
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
    if (draft.deleted) managed.delete(draft.path);
    else {
      managed.set(draft.path, {
        kind: draft.kind,
        schemaVersion: draft.schema_version,
        path: draft.path,
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
  return deployBundle(kernel, trx, audit, workspace, principal, stored.bundle.id, { message });
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
  return (await storeBundle(kernel, trx, audit, workspace, principal, composite, "compose")).bundle
    .id;
}
