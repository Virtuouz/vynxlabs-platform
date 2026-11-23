import { type DocsApp, docsApps, type ResourceLike } from "@volvel/docs-engine";
import type { Db } from "../audit.js";

/** A page or a docs app as its writers see it: a draft laid over what is deployed. */
export interface WorkingResource extends ResourceLike {
  /** `changed` has a draft over what is deployed, `new` is only a draft, `removed` is a draft that removes it. */
  state: "deployed" | "changed" | "new" | "removed";
  /** For a page kept in a folder of the repository's own: its file. */
  file: string | null;
  /** The draft's revision, to send back with a save. Null while there is no draft. */
  revision: number | null;
  /** What is deployed under a draft. */
  deployed?: Record<string, unknown>;
}

export interface Working {
  resources: WorkingResource[];
  /** `deployed` is false for an app that is only a draft. `drafted` is true while a draft changes it. */
  apps: (DocsApp & { deployed: boolean; drafted: boolean })[];
  /** The deployed apps a draft removes: they are no part of what is built, and the next deploy removes them. */
  removedApps: string[];
}

/**
 * A workspace's pages and docs apps with its drafts laid over them: what
 * would be there if every draft of documentation were deployed now. For the
 * console's writers, and for a preview only they may open.
 */
export async function workingDocs(db: Db, workspaceId: string): Promise<Working> {
  const [live, drafts] = await Promise.all([
    db
      .selectFrom("resource")
      .select(["key", "kind", "path", "title", "body", "meta"])
      .where("workspace_id", "=", workspaceId)
      .where("kind", "in", ["doc", "app"])
      .execute(),
    db
      .selectFrom("resource_draft")
      .select(["key", "kind", "path", "title", "body", "deleted", "revision"])
      .where("workspace_id", "=", workspaceId)
      .where("kind", "in", ["doc", "app"])
      .execute(),
  ]);
  const drafted = new Map(drafts.map((draft) => [draft.key, draft]));
  const resources: WorkingResource[] = [];
  const deployedApps = new Set<string>();
  for (const one of live) {
    const draft = drafted.get(one.key);
    drafted.delete(one.key);
    if (one.kind === "app") deployedApps.add(one.path);
    resources.push({
      kind: one.kind,
      key: one.key,
      path: draft && !draft.deleted ? draft.path : one.path,
      title: (draft && !draft.deleted ? draft.title : one.title) ?? undefined,
      body: draft && !draft.deleted ? draft.body : one.body,
      state: draft ? (draft.deleted ? "removed" : "changed") : "deployed",
      file: one.meta.source && !one.meta.source.generated ? one.meta.source.file : null,
      revision: draft?.revision ?? null,
      ...(draft ? { deployed: one.body } : {}),
    });
  }
  for (const draft of drafted.values()) {
    if (draft.deleted) continue;
    resources.push({
      kind: draft.kind,
      key: draft.key,
      path: draft.path,
      title: draft.title ?? undefined,
      body: draft.body,
      state: "new",
      file: null,
      revision: draft.revision,
    });
  }
  // What a draft removes is still listed, as removed, and is no part of what is built.
  const kept = resources.filter((one) => one.state !== "removed");
  const draftedApps = new Set(
    kept.filter((one) => one.kind === "app" && one.state !== "deployed").map((one) => one.path),
  );
  return {
    resources,
    // Only a docs site's removal is the documentation's to deploy: another app's asks more.
    removedApps: docsApps(resources.filter((one) => one.state === "removed")).map(
      (one) => one.path,
    ),
    apps: docsApps(kept).map((one) => ({
      ...one,
      deployed: deployedApps.has(one.path),
      drafted: draftedApps.has(one.path),
    })),
  };
}
