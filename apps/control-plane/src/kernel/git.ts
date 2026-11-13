import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, sql } from "@vynxlabs/db";
import {
  parseResourceFiles,
  platformKinds,
  type ResourceFile,
  renderResourceFiles,
} from "@vynxlabs/manifest";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type { Actor, Db } from "./audit.js";
import { mutate } from "./audit.js";
import { activeConsoleManaged, deployConsoleManaged } from "./authoring.js";
import { conflict, HttpError, notFound } from "./errors.js";
import { decryptFor, encryptFor } from "./execution/bindings.js";
import type { WorkspaceRef } from "./http.js";
import type { Kernel } from "./kernel.js";

/**
 * Keeping a dev workspace's console-managed resources in a git repository.
 *
 * The repository is the tenant's. The server writes one folder of it, on one
 * branch per dev workspace, and never the default branch: changes reach that
 * by a pull request, like any other. A push writes what the workspace has
 * deployed. A pull reads what developers changed in the folder and deploys it.
 *
 * Nothing here keeps a clone. Each operation fetches the branch's tip into a
 * scratch directory, works on git's objects directly, and throws the
 * directory away, so any replica can serve any operation. No database
 * connection is held while the remote is being talked to.
 */

/** How long one operation may hold a workspace's lease. A crashed one frees it by this. */
const LEASE_SECONDS = 120;
const CREDENTIAL_NAME = "git:repository";

export interface RepositoryInput {
  url: string;
  defaultBranch?: string | undefined;
  folder?: string | undefined;
  username?: string | undefined;
  /** An access token. Leave it out to keep the stored one. */
  token?: string | undefined;
}

const FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const BRANCH = /^(?!\/|.*(?:\/\/|\.\.|@\{|\\))[A-Za-z0-9._/-]{1,200}(?<!\/|\.lock|\.)$/;

/** Git's own checksum of a file's content, which is how files are compared without a clone. */
async function checksum(content: string): Promise<string> {
  return (await git.hashBlob({ object: content })).oid;
}

async function checksums(files: readonly ResourceFile[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    files.map(async (file) => [file.path, await checksum(file.content)] as const),
  );
  return Object.fromEntries(entries);
}

interface Remote {
  url: string;
  folder: string;
  defaultBranch: string;
  onAuth: () => { username: string; password: string };
}

async function remoteOf(
  kernel: Kernel,
  db: Db,
  tenantId: string,
): Promise<Remote & { paused: boolean }> {
  const row = await db
    .selectFrom("git_repository")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!row) {
    throw new HttpError(409, "no_repository", "This tenant has no repository connected.");
  }
  const token = await decryptFor(kernel, db, tenantId, tenantId, CREDENTIAL_NAME, row.credential);
  return {
    url: row.url,
    folder: row.folder,
    defaultBranch: row.default_branch,
    paused: row.paused,
    onAuth: () => ({ username: row.username, password: token }),
  };
}

/** What went wrong with the remote, said for a person, with no token in it. */
function remoteProblem(error: unknown): string {
  const failure = error as { code?: string; data?: { statusCode?: number }; message?: string };
  if (failure.code === "HttpError" && failure.data?.statusCode === 401) {
    return "The repository refused the access token. Check that it is still valid.";
  }
  if (failure.code === "HttpError" && failure.data?.statusCode === 403) {
    return "The access token may not do that. It needs to read and write the repository's contents.";
  }
  if (failure.code === "HttpError" && failure.data?.statusCode === 404) {
    return "The repository was not found at that address, or the access token cannot see it.";
  }
  if (failure.code === "NotFoundError") return "The branch was not found in the repository.";
  if (failure.code === "PushRejectedError") {
    return "The repository refused the push. The branch may be protected, or it moved.";
  }
  return `The repository could not be reached: ${(failure.message ?? "unknown error").split("\n")[0]}`;
}

interface Tip {
  gitdir: string;
  /** The commit the branch is at, or the default branch's when the branch does not exist yet. */
  commit: string;
  /** Whether the workspace's branch exists in the repository. */
  exists: boolean;
}

/** Fetches the tip of a branch into a scratch directory, with no checkout and no history. */
async function fetchTip(remote: Remote, branch: string): Promise<Tip> {
  const gitdir = await mkdtemp(join(tmpdir(), "vx-git-"));
  try {
    await git.init({ fs, gitdir, bare: true });
    await git.addRemote({ fs, gitdir, remote: "origin", url: remote.url });
    const fetch = (ref: string) =>
      git.fetch({
        fs,
        http,
        gitdir,
        url: remote.url,
        ref,
        remoteRef: ref,
        depth: 1,
        singleBranch: true,
        tags: false,
        onAuth: remote.onAuth,
      });
    try {
      const fetched = await fetch(branch);
      if (fetched.fetchHead) return { gitdir, commit: fetched.fetchHead, exists: true };
    } catch (error) {
      if ((error as { code?: string }).code !== "NotFoundError") throw error;
    }
    const fallback = await fetch(remote.defaultBranch);
    if (!fallback.fetchHead) throw Object.assign(new Error("empty"), { code: "NotFoundError" });
    return { gitdir, commit: fallback.fetchHead, exists: false };
  } catch (error) {
    await rm(gitdir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * The most a pull takes in from the folder. A workspace's resources are small
 * text files: far more than this is a mistake, or something pointed at the
 * wrong folder, and reading it all would hold a request open for nothing.
 * Tests lower these.
 */
export const PULL_LIMITS = { bytes: 8 * 1024 * 1024, files: 2000 };

/** The folder on the branch holds more than a pull takes in. */
class FolderTooLarge extends Error {}

/** The YAML and TypeScript files under the folder at a commit. With `limited`, up to the limits of a pull. */
async function readFolder(
  gitdir: string,
  commit: string,
  folder: string,
  limited = false,
): Promise<ResourceFile[]> {
  const files: ResourceFile[] = [];
  let bytes = 0;
  const { tree: root } = await git.readTree({ fs, gitdir, oid: commit });
  let entries = root;
  for (const segment of folder.split("/")) {
    const next = entries.find((entry) => entry.path === segment && entry.type === "tree");
    if (!next) return [];
    entries = (await git.readTree({ fs, gitdir, oid: next.oid })).tree;
  }
  const walk = async (tree: typeof entries, prefix: string) => {
    for (const entry of tree) {
      const path = prefix ? `${prefix}/${entry.path}` : entry.path;
      if (entry.type === "tree") {
        await walk((await git.readTree({ fs, gitdir, oid: entry.oid })).tree, path);
      } else if (entry.type === "blob" && /\.(yaml|ts)$/.test(entry.path)) {
        const { blob } = await git.readBlob({ fs, gitdir, oid: entry.oid });
        bytes += blob.byteLength;
        if (limited && (bytes > PULL_LIMITS.bytes || files.length >= PULL_LIMITS.files)) {
          throw new FolderTooLarge(
            `The folder ${folder} on the branch holds more than a pull takes in: ${PULL_LIMITS.files} files, or ${Math.round(PULL_LIMITS.bytes / 1024 / 1024)} MB in all. Check that the repository's folder is the right one.`,
          );
        }
        files.push({ path, content: Buffer.from(blob).toString("utf8") });
      }
    }
  };
  await walk(entries, "");
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}

type Entry = { mode: string; path: string; oid: string; type: "blob" | "tree" | "commit" };

/** A tree of the given files, nested by their paths. Nothing for no files. */
async function writeFiles(gitdir: string, files: readonly ResourceFile[]): Promise<string | null> {
  if (files.length === 0) return null;
  const here: Entry[] = [];
  const below = new Map<string, ResourceFile[]>();
  for (const file of files) {
    const [first = "", ...rest] = file.path.split("/");
    if (rest.length === 0) {
      const oid = await git.writeBlob({ fs, gitdir, blob: Buffer.from(file.content, "utf8") });
      here.push({ mode: "100644", path: first, oid, type: "blob" });
    } else {
      below.set(first, [
        ...(below.get(first) ?? []),
        { path: rest.join("/"), content: file.content },
      ]);
    }
  }
  for (const [name, inner] of below) {
    const oid = (await writeFiles(gitdir, inner)) as string;
    here.push({ mode: "040000", path: name, oid, type: "tree" });
  }
  return git.writeTree({ fs, gitdir, tree: here });
}

/** The tree at `oid` with what is at `segments` replaced by `subtree`, or removed for null. */
async function replaceAt(
  gitdir: string,
  oid: string | undefined,
  segments: string[],
  subtree: string | null,
): Promise<string | null> {
  const tree: Entry[] = oid ? (await git.readTree({ fs, gitdir, oid })).tree : [];
  const [first = "", ...rest] = segments;
  const others = tree.filter((entry) => entry.path !== first);
  const inner =
    rest.length === 0
      ? subtree
      : await replaceAt(
          gitdir,
          tree.find((entry) => entry.path === first && entry.type === "tree")?.oid,
          rest,
          subtree,
        );
  const next = inner
    ? [...others, { mode: "040000", path: first, oid: inner, type: "tree" as const }]
    : others;
  if (next.length === 0) return null;
  return git.writeTree({ fs, gitdir, tree: next });
}

/** Takes the workspace's lease for one operation, and gives it back afterwards. */
async function withLease<T>(db: Db, workspaceId: string, work: () => Promise<T>): Promise<T> {
  const taken = await db
    .updateTable("workspace_git")
    .set({ lease_until: sql`now() + make_interval(secs => ${LEASE_SECONDS})` })
    .where("workspace_id", "=", workspaceId)
    .where((eb) => eb.or([eb("lease_until", "is", null), eb("lease_until", "<", sql<Date>`now()`)]))
    .returning("workspace_id")
    .executeTakeFirst();
  if (!taken) {
    throw new HttpError(
      409,
      "git_busy",
      "Another push or pull of this workspace is in progress. Try again in a moment.",
    );
  }
  try {
    return await work();
  } finally {
    await db
      .updateTable("workspace_git")
      .set({ lease_until: null })
      .where("workspace_id", "=", workspaceId)
      .execute();
  }
}

async function linkOf(db: Db, workspace: WorkspaceRef) {
  const row = await db
    .selectFrom("workspace_git")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .executeTakeFirst();
  if (!row) {
    throw new HttpError(
      409,
      "no_branch",
      "This workspace does not follow a branch yet. Choose one under Workspace settings.",
    );
  }
  return row;
}

async function record(
  db: Db,
  workspace: WorkspaceRef,
  actor: Actor,
  operation: {
    kind: "push" | "pull";
    status: "done" | "nothing" | "refused" | "failed";
    commit?: string | null;
    message?: string | null;
    detail?: Record<string, unknown>;
  },
) {
  // Every push and pull is in the audit log, whether or not it wrote anything.
  await mutate(db, actor, async (trx, audit) => {
    await trx
      .insertInto("git_operation")
      .values({
        id: newId(),
        tenant_id: workspace.tenantId,
        workspace_id: workspace.id,
        kind: operation.kind,
        status: operation.status,
        commit_id: operation.commit ?? null,
        message: operation.message ?? null,
        detail: JSON.stringify(operation.detail ?? {}),
        created_by_type: actor.principal.type,
        created_by_id: actor.principal.id,
      })
      .execute();
    await audit({
      action: operation.kind === "push" ? "workspace_git.pushed" : "workspace_git.pulled",
      targetType: "workspace",
      targetId: workspace.id,
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      details: { status: operation.status, commit: operation.commit ?? null, ...operation.detail },
    });
  });
}

/** Connects, or changes, a tenant's repository after checking that it can be reached. */
export async function saveRepository(
  kernel: Kernel,
  actor: Actor,
  tenantId: string,
  input: RepositoryInput,
) {
  if (
    !/^https:\/\/[^\s/@]+\/\S+$/.test(input.url) &&
    !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(input.url)
  ) {
    throw new HttpError(
      400,
      "validation_failed",
      "The repository's address must start with https:// and carry no user name or token.",
    );
  }
  const folder = input.folder ?? "platform";
  if (!FOLDER.test(folder) || folder.split("/").includes("..")) {
    throw new HttpError(
      400,
      "validation_failed",
      "The folder is a path inside the repository, such as platform.",
    );
  }
  const existing = await kernel.db
    .selectFrom("git_repository")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!existing && !input.token) {
    throw new HttpError(
      400,
      "validation_failed",
      "An access token is needed to connect a repository.",
    );
  }
  const token =
    input.token ??
    (await decryptFor(
      kernel,
      kernel.db,
      tenantId,
      tenantId,
      CREDENTIAL_NAME,
      (existing as { credential: Buffer }).credential,
    ));
  const username = input.username ?? existing?.username ?? "x-access-token";
  const defaultBranch = input.defaultBranch ?? existing?.default_branch ?? "main";
  // Reach it before saving it: a wrong address or token is said now, not at the first push.
  const probe: Remote = {
    url: input.url,
    folder,
    defaultBranch,
    onAuth: () => ({ username, password: token }),
  };
  try {
    const tip = await fetchTip(probe, defaultBranch);
    await rm(tip.gitdir, { recursive: true, force: true });
  } catch (error) {
    throw new HttpError(409, "repository_unreachable", remoteProblem(error));
  }
  return mutate(kernel.db, actor, async (trx, audit) => {
    const credential = await encryptFor(kernel, trx, tenantId, tenantId, CREDENTIAL_NAME, token);
    const values = {
      url: input.url,
      default_branch: defaultBranch,
      folder,
      username,
      credential,
      updated_at: new Date(),
    };
    const row = existing
      ? await trx
          .updateTable("git_repository")
          .set({ ...values, paused: false })
          .where("tenant_id", "=", tenantId)
          .returningAll()
          .executeTakeFirstOrThrow()
      : await trx
          .insertInto("git_repository")
          .values({ tenant_id: tenantId, ...values })
          .returningAll()
          .executeTakeFirstOrThrow();
    await audit({
      action: existing ? "git_repository.updated" : "git_repository.created",
      targetType: "git_repository",
      targetId: tenantId,
      tenantId,
      // Never the token.
      details: { url: input.url, defaultBranch, folder, tokenChanged: input.token !== undefined },
    });
    return row;
  });
}

/** Makes a dev workspace follow a branch. The branch is created by the first push. */
export async function followBranch(
  kernel: Kernel,
  actor: Actor,
  workspace: WorkspaceRef,
  branch: string,
) {
  if (!BRANCH.test(branch)) {
    throw new HttpError(400, "validation_failed", "That is not a branch name git accepts.");
  }
  const [type, repository] = await Promise.all([
    kernel.db
      .selectFrom("workspace")
      .select("type")
      .where("id", "=", workspace.id)
      .executeTakeFirstOrThrow(),
    kernel.db
      .selectFrom("git_repository")
      .select(["default_branch"])
      .where("tenant_id", "=", workspace.tenantId)
      .executeTakeFirst(),
  ]);
  if (!repository)
    throw new HttpError(409, "no_repository", "Connect the tenant's repository first.");
  if (type.type !== "dev") {
    throw new HttpError(
      409,
      "production_workspace",
      "Only a dev workspace follows a branch. Production changes by promotion, or by a deploy from the default branch.",
    );
  }
  if (branch === repository.default_branch) {
    throw conflict(
      "A workspace cannot follow the default branch. Changes reach it by a pull request.",
    );
  }
  return mutate(kernel.db, actor, async (trx, audit) => {
    const row = await trx
      .insertInto("workspace_git")
      .values({ workspace_id: workspace.id, tenant_id: workspace.tenantId, branch })
      .onConflict((oc) =>
        oc.column("workspace_id").doUpdateSet({
          branch,
          synced_commit: null,
          synced_files: JSON.stringify({}),
          state: "never",
          last_error: null,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit({
      action: "workspace_git.set",
      targetType: "workspace",
      targetId: workspace.id,
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      details: { branch },
    });
    return row;
  });
}

/** The files the workspace's deployed console-managed resources make. */
async function localFiles(
  kernel: Kernel,
  db: Db,
  workspace: WorkspaceRef,
): Promise<ResourceFile[]> {
  return renderResourceFiles(await activeConsoleManaged(kernel, db, workspace.id), platformKinds);
}

/**
 * Commits what the workspace has deployed to its branch. Refused, with nothing
 * written, when someone changed the folder on the branch since the last sync:
 * that is pulled first.
 */
export async function push(
  kernel: Kernel,
  actor: Actor,
  workspace: WorkspaceRef,
  options: { message?: string | undefined } = {},
) {
  const db = kernel.db;
  const remote = await remoteOf(kernel, db, workspace.tenantId);
  if (remote.paused) {
    throw new HttpError(
      409,
      "git_paused",
      "Sync is paused for this tenant. It was imported from another instance: check the repository's settings, then turn sync on.",
    );
  }
  await linkOf(db, workspace);
  return withLease(db, workspace.id, async () => {
    const link = await linkOf(db, workspace);
    const files = await localFiles(kernel, db, workspace);
    const local = await checksums(files);
    let tip: Tip;
    try {
      tip = await fetchTip(remote, link.branch);
    } catch (error) {
      return failed(db, workspace, actor, "push", remoteProblem(error));
    }
    try {
      const theirs = await checksums(await readFolder(tip.gitdir, tip.commit, remote.folder));
      const base = link.synced_files;
      const moved = [...new Set([...Object.keys(theirs), ...Object.keys(base)])].filter(
        (path) => theirs[path] !== base[path] && theirs[path] !== local[path],
      );
      if (tip.exists && moved.length > 0) {
        await db
          .updateTable("workspace_git")
          .set({ state: "behind", last_error: null, updated_at: new Date() })
          .where("workspace_id", "=", workspace.id)
          .execute();
        await record(db, workspace, actor, {
          kind: "push",
          status: "refused",
          detail: { changedOnBranch: moved },
        });
        return {
          status: "refused" as const,
          state: "behind" as const,
          commit: null,
          changedOnBranch: moved,
        };
      }
      const same = Object.keys({ ...theirs, ...local }).every(
        (path) => theirs[path] === local[path],
      );
      if (same && tip.exists) {
        await settle(db, workspace, tip.commit, local);
        await record(db, workspace, actor, { kind: "push", status: "nothing", commit: tip.commit });
        return {
          status: "nothing" as const,
          state: "synced" as const,
          commit: tip.commit,
          changedOnBranch: [],
        };
      }
      const { tree: rootTree } = await git
        .readCommit({ fs, gitdir: tip.gitdir, oid: tip.commit })
        .then((read) => read.commit);
      const tree = await replaceAt(
        tip.gitdir,
        rootTree,
        remote.folder.split("/"),
        await writeFiles(tip.gitdir, files),
      );
      const author = await authorOf(db, actor);
      const now = Math.floor(Date.now() / 1000);
      const message = `${options.message ?? "Deploy from the console"}\n\nWorkspace: ${workspace.slug}\n`;
      const commit = await git.writeCommit({
        fs,
        gitdir: tip.gitdir,
        commit: {
          tree: tree ?? (await git.writeTree({ fs, gitdir: tip.gitdir, tree: [] })),
          parent: [tip.commit],
          message,
          author: { ...author, timestamp: now, timezoneOffset: 0 },
          committer: {
            name: "Platform",
            email: "platform@localhost",
            timestamp: now,
            timezoneOffset: 0,
          },
        },
      });
      await git.writeRef({
        fs,
        gitdir: tip.gitdir,
        ref: `refs/heads/${link.branch}`,
        value: commit,
        force: true,
      });
      try {
        await git.push({
          fs,
          http,
          gitdir: tip.gitdir,
          url: remote.url,
          ref: link.branch,
          remoteRef: `refs/heads/${link.branch}`,
          onAuth: remote.onAuth,
        });
      } catch (error) {
        return failed(db, workspace, actor, "push", remoteProblem(error));
      }
      await settle(db, workspace, commit, local);
      await record(db, workspace, actor, {
        kind: "push",
        status: "done",
        commit,
        message: options.message ?? null,
        detail: { files: files.length },
      });
      return { status: "done" as const, state: "synced" as const, commit, changedOnBranch: [] };
    } finally {
      await rm(tip.gitdir, { recursive: true, force: true });
    }
  });
}

async function settle(
  db: Db,
  workspace: WorkspaceRef,
  commit: string,
  files: Record<string, string>,
) {
  await db
    .updateTable("workspace_git")
    .set({
      synced_commit: commit,
      synced_files: JSON.stringify(files),
      state: "synced",
      last_error: null,
      updated_at: new Date(),
    })
    .where("workspace_id", "=", workspace.id)
    .execute();
}

async function failed(
  db: Db,
  workspace: WorkspaceRef,
  actor: Actor,
  kind: "push" | "pull",
  problem: string,
) {
  await db
    .updateTable("workspace_git")
    .set({ state: "error", last_error: problem, updated_at: new Date() })
    .where("workspace_id", "=", workspace.id)
    .execute();
  await record(db, workspace, actor, { kind, status: "failed", detail: { problem } });
  return {
    status: "failed" as const,
    state: "error" as const,
    commit: null,
    changedOnBranch: [] as string[],
    problem,
  };
}

async function authorOf(db: Db, actor: Actor): Promise<{ name: string; email: string }> {
  if (actor.principal.type === "member" && actor.principal.id) {
    const member = await db
      .selectFrom("member")
      .select(["name", "email"])
      .where("id", "=", actor.principal.id)
      .executeTakeFirst();
    if (member) return { name: member.name, email: member.email };
  }
  return { name: "Platform", email: "platform@localhost" };
}

/** The resource a file belongs to: its name without the last extension. */
const stemOf = (path: string) => path.replace(/\.(yaml|ts)$/, "");

/**
 * Reads what changed in the folder on the branch and deploys it. A resource
 * changed on both sides is a conflict: nothing is deployed until each one is
 * given to "mine" (what the workspace has) or "theirs" (what the branch has).
 */
export async function pull(
  kernel: Kernel,
  actor: Actor,
  workspace: WorkspaceRef,
  options: { resolutions?: Record<string, "mine" | "theirs"> | undefined } = {},
) {
  const db = kernel.db;
  const remote = await remoteOf(kernel, db, workspace.tenantId);
  await linkOf(db, workspace);
  return withLease(db, workspace.id, async () => {
    const link = await linkOf(db, workspace);
    let tip: Tip;
    try {
      tip = await fetchTip(remote, link.branch);
    } catch (error) {
      return {
        ...(await failed(db, workspace, actor, "pull", remoteProblem(error))),
        conflicts: [] as string[],
        applied: [] as string[],
      };
    }
    try {
      if (!tip.exists) {
        await record(db, workspace, actor, { kind: "pull", status: "nothing" });
        return {
          status: "nothing" as const,
          state: link.state,
          commit: null,
          conflicts: [],
          applied: [],
        };
      }
      let remoteFiles: ResourceFile[];
      try {
        remoteFiles = await readFolder(tip.gitdir, tip.commit, remote.folder, true);
      } catch (error) {
        if (!(error instanceof FolderTooLarge)) throw error;
        return {
          ...(await failed(db, workspace, actor, "pull", error.message)),
          conflicts: [],
          applied: [],
        };
      }
      const theirs = await checksums(remoteFiles);
      const mineFiles = await localFiles(kernel, db, workspace);
      const mine = await checksums(mineFiles);
      const base = link.synced_files;

      // Compare resource by resource: a script is its YAML and its source together.
      const stems = new Set(
        [...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base)].map(stemOf),
      );
      const differs = (a: Record<string, string>, b: Record<string, string>, stem: string) =>
        [`${stem}.yaml`, `${stem}.ts`].some((path) => a[path] !== b[path]);
      const take: string[] = [];
      const conflicts: string[] = [];
      const keep: string[] = [];
      for (const stem of [...stems].sort()) {
        if (!differs(theirs, mine, stem)) continue;
        const theyChanged = differs(theirs, base, stem);
        const iChanged = differs(mine, base, stem);
        if (theyChanged && !iChanged) take.push(stem);
        else if (theyChanged && iChanged) {
          const resolution = options.resolutions?.[stem];
          if (resolution === "theirs") take.push(stem);
          else if (resolution === "mine") keep.push(stem);
          else conflicts.push(stem);
        }
      }
      if (conflicts.length > 0) {
        await db
          .updateTable("workspace_git")
          .set({ state: "conflict", last_error: null, updated_at: new Date() })
          .where("workspace_id", "=", workspace.id)
          .execute();
        await record(db, workspace, actor, {
          kind: "pull",
          status: "refused",
          commit: tip.commit,
          detail: { conflicts },
        });
        return {
          status: "refused" as const,
          state: "conflict" as const,
          commit: tip.commit,
          conflicts,
          applied: [],
        };
      }

      // What the workspace would then hold: its own files, with the taken resources as the branch has them.
      const taken = new Set(take);
      const merged = [
        ...mineFiles.filter((file) => !taken.has(stemOf(file.path))),
        ...remoteFiles.filter((file) => taken.has(stemOf(file.path))),
      ];
      const parsed = parseResourceFiles(merged);
      if (parsed.problems.length > 0) {
        const problem = `The files on the branch are not valid: ${parsed.problems.join(" ")}`;
        return {
          ...(await failed(db, workspace, actor, "pull", problem)),
          conflicts: [],
          applied: [],
        };
      }
      if (take.length > 0) {
        try {
          await mutate(db, actor, (trx, audit) =>
            deployConsoleManaged(
              kernel,
              trx,
              audit,
              workspace,
              actor.principal,
              parsed.manifests,
              `Pulled ${tip.commit.slice(0, 7)} from ${link.branch}`,
            ),
          );
        } catch (error) {
          if (!(error instanceof HttpError) || error.statusCode >= 500) throw error;
          const detail = [
            error.message,
            ...(error.issues ?? []).map((issue) => `${issue.path} ${issue.message}`),
          ].join(" ");
          return {
            ...(await failed(
              db,
              workspace,
              actor,
              "pull",
              `What is on the branch cannot be deployed. ${detail}`,
            )),
            conflicts: [],
            applied: [],
          };
        }
      }
      // For a resource kept as "mine", the branch's version is now the base, so the next push replaces it.
      const after = await checksums(merged);
      const ahead = Object.keys({ ...after, ...theirs }).some(
        (path) => after[path] !== theirs[path],
      );
      await db
        .updateTable("workspace_git")
        .set({
          synced_commit: tip.commit,
          synced_files: JSON.stringify(theirs),
          state: ahead ? "ahead" : "synced",
          last_error: null,
          updated_at: new Date(),
        })
        .where("workspace_id", "=", workspace.id)
        .execute();
      await record(db, workspace, actor, {
        kind: "pull",
        status: take.length > 0 ? "done" : "nothing",
        commit: tip.commit,
        detail: { applied: take, kept: keep },
      });
      return {
        status: take.length > 0 ? ("done" as const) : ("nothing" as const),
        state: ahead ? ("ahead" as const) : ("synced" as const),
        commit: tip.commit,
        conflicts: [],
        applied: take,
      };
    } finally {
      await rm(tip.gitdir, { recursive: true, force: true });
    }
  });
}

/** Marks a workspace as holding something its branch does not, after a deploy. */
export async function markAhead(db: Db, workspaceId: string) {
  await db
    .updateTable("workspace_git")
    .set({ state: "ahead", updated_at: new Date() })
    .where("workspace_id", "=", workspaceId)
    .where("state", "in", ["synced", "never"])
    .execute();
}

export async function gitStatus(kernel: Kernel, workspace: WorkspaceRef) {
  const [repository, link] = await Promise.all([
    kernel.db
      .selectFrom("git_repository")
      .select(["url", "default_branch", "folder", "paused"])
      .where("tenant_id", "=", workspace.tenantId)
      .executeTakeFirst(),
    kernel.db
      .selectFrom("workspace_git")
      .selectAll()
      .where("workspace_id", "=", workspace.id)
      .executeTakeFirst(),
  ]);
  return { repository, link };
}

export async function removeRepository(kernel: Kernel, actor: Actor, tenantId: string) {
  return mutate(kernel.db, actor, async (trx, audit) => {
    await trx.deleteFrom("workspace_git").where("tenant_id", "=", tenantId).execute();
    const removed = await trx
      .deleteFrom("git_repository")
      .where("tenant_id", "=", tenantId)
      .returning("url")
      .executeTakeFirst();
    if (!removed) throw notFound("The repository");
    await audit({
      action: "git_repository.deleted",
      targetType: "git_repository",
      targetId: tenantId,
      tenantId,
      details: { url: removed.url },
    });
  });
}
