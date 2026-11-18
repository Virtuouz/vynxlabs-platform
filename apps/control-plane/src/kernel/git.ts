import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, sql } from "@vynxlabs/db";
import {
  type BundleManifest,
  fileOf,
  ignoredFolder,
  isResourceFile,
  keyOf,
  movedFile,
  ontoWritten,
  parseRepositoryConfig,
  parseRepositoryFiles,
  platformKinds,
  REPOSITORY_CONFIG,
  type RepositoryConfig,
  type ResourceFile,
  renderRepositoryFiles,
  renderTenantFiles,
  TENANT_FOLDER,
} from "@vynxlabs/manifest";
import type { HttpClient } from "isomorphic-git";
import git from "isomorphic-git";
import type { Actor, Db } from "./audit.js";
import { mutate } from "./audit.js";
import { activeConsoleManaged, deployConsoleManaged } from "./authoring.js";
import { guardedFetch } from "./egress.js";
import { conflict, HttpError, notFound } from "./errors.js";
import { decryptFor, encryptFor } from "./execution/bindings.js";
import type { WorkspaceRef } from "./http.js";
import type { Kernel } from "./kernel.js";
import { currentAccess } from "./tenant/releases.js";

/**
 * isomorphic-git's HTTP client, through the egress guard: a repository is an
 * address a tenant gave, so the instance reaches it as it reaches any other.
 */
const http: HttpClient = {
  async request({ url, method = "GET", headers = {}, body }) {
    let payload: Buffer | undefined;
    if (body) {
      const parts: Uint8Array[] = [];
      for await (const part of body) parts.push(part);
      payload = Buffer.concat(parts);
    }
    const response = await guardedFetch(url, {
      method,
      headers,
      ...(payload ? { body: payload } : {}),
      timeoutMs: 60_000,
    });
    const reader = response.body;
    return {
      url: response.url,
      method,
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: Object.fromEntries(response.headers),
      body: (async function* () {
        if (reader) for await (const chunk of reader) yield chunk as Uint8Array;
      })(),
    };
  },
};

/**
 * Keeping a dev workspace's console-managed resources in a git repository.
 *
 * The repository is the tenant's. The server writes its resource files, on one
 * branch per dev workspace, and never the default branch: changes reach that
 * by a pull request, like any other. A resource's file is wherever the
 * repository keeps it, and is written back there; one made in the console goes
 * in the console's folder. A push writes what the workspace has deployed. A
 * pull reads what developers changed in those files and deploys it. Nothing
 * that is not a resource's file is read or written.
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
  /** Where promotions are mirrored, one branch per production workspace beneath it. Null turns it off. */
  releaseBranch?: string | null | undefined;
  /** The branch the tenant's access is committed to after each release. Null turns it off. */
  tenantBranch?: string | null | undefined;
}

/**
 * What kind of token this is, from its shape alone. The token is never shown;
 * this says whether it belongs to the repository or to a person, who may leave.
 */
export function credentialKind(token: string): string {
  if (token.startsWith("github_pat_")) return "github-fine-grained";
  if (token.startsWith("ghp_")) return "github-classic";
  if (token.startsWith("ghs_") || token.startsWith("ghu_")) return "github-app";
  if (token.startsWith("gldt-")) return "gitlab-deploy-token";
  if (token.startsWith("glpat-")) return "gitlab-access-token";
  if (token.startsWith("ATCTT") || token.startsWith("ATBB")) return "bitbucket-token";
  return "token";
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
 * The most a pull takes in. A workspace's resources are small text files: far
 * more than this is a mistake, and reading it all would hold a request open
 * for nothing. Tests lower these.
 */
export const PULL_LIMITS = { bytes: 8 * 1024 * 1024, files: 2000 };

/** The branch holds more than a pull takes in. */
class TooLarge extends Error {}

/** The kinds a workspace's resources have. A file named for another kind is not one of them. */
const WORKSPACE_KINDS: ReadonlySet<string> = new Set(platformKinds.map((kind) => kind.kind));

/** A repository at a commit: its resource files, and what it says about where they are. */
interface Repository {
  /** Every file named for a kind, in any folder that is the repository's own, by its path from the root. */
  files: ResourceFile[];
  config: RepositoryConfig;
  /** What is wrong with `vynxlabs.yaml`, if anything. */
  problems: string[];
}

/**
 * Reads a repository's resource files at a commit, wherever it keeps them, as
 * the CLI's build finds them. With `limited`, up to the limits of a pull.
 */
async function readRepository(
  gitdir: string,
  commit: string,
  limited = false,
): Promise<Repository> {
  const files: ResourceFile[] = [];
  let bytes = 0;
  const text = async (oid: string) =>
    Buffer.from((await git.readBlob({ fs, gitdir, oid })).blob).toString("utf8");
  const { tree: root } = await git.readTree({ fs, gitdir, oid: commit });
  const said = root.find((entry) => entry.path === REPOSITORY_CONFIG && entry.type === "blob");
  const { config, problems } = parseRepositoryConfig(said ? await text(said.oid) : undefined);
  const walk = async (tree: typeof root, prefix: string) => {
    for (const entry of tree) {
      const path = prefix ? `${prefix}/${entry.path}` : entry.path;
      if (entry.type === "tree") {
        if (ignoredFolder(path, config)) continue;
        await walk((await git.readTree({ fs, gitdir, oid: entry.oid })).tree, path);
      } else if (entry.type === "blob" && isResourceFile(path, WORKSPACE_KINDS)) {
        const content = await text(entry.oid);
        bytes += Buffer.byteLength(content);
        if (limited && (bytes > PULL_LIMITS.bytes || files.length >= PULL_LIMITS.files)) {
          throw new TooLarge(
            `The branch holds more than a pull takes in: ${PULL_LIMITS.files} resource files, or ${Math.round(PULL_LIMITS.bytes / 1024 / 1024)} MB in all. Leave out what is not the workspace's with ignore: in ${REPOSITORY_CONFIG}.`,
          );
        }
        files.push({ path, content });
      }
    }
  };
  await walk(root, "");
  return { files: files.sort((a, b) => (a.path < b.path ? -1 : 1)), config, problems };
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

/**
 * The tree at `oid` with some files written and some removed, each by its path
 * from the tree's root. Everything else is left exactly as it is: a folder is
 * rewritten only on the way down to a file that changed.
 */
async function patchTree(
  gitdir: string,
  oid: string | undefined,
  changes: readonly { segments: string[]; content: string | null }[],
): Promise<string | null> {
  const tree: Entry[] = oid ? (await git.readTree({ fs, gitdir, oid })).tree : [];
  const next = new Map(tree.map((entry) => [entry.path, entry]));
  const below = new Map<string, { segments: string[]; content: string | null }[]>();
  for (const change of changes) {
    const [first = "", ...rest] = change.segments;
    if (rest.length > 0) {
      below.set(first, [...(below.get(first) ?? []), { segments: rest, content: change.content }]);
    } else if (change.content === null) {
      next.delete(first);
    } else {
      const blob = await git.writeBlob({ fs, gitdir, blob: Buffer.from(change.content, "utf8") });
      const was = next.get(first);
      // A file keeps the mode it had.
      const mode = was?.type === "blob" ? was.mode : "100644";
      next.set(first, { mode, path: first, oid: blob, type: "blob" });
    }
  }
  for (const [name, inner] of below) {
    const was = next.get(name);
    const subtree = await patchTree(gitdir, was?.type === "tree" ? was.oid : undefined, inner);
    if (subtree) next.set(name, { mode: "040000", path: name, oid: subtree, type: "tree" });
    else next.delete(name);
  }
  if (next.size === 0) return null;
  return git.writeTree({ fs, gitdir, tree: [...next.values()] });
}

/** Commits a tree on top of a branch's tip and pushes it. Throws what the remote said. */
async function commitAndPush(
  remote: Remote,
  tip: Tip,
  branch: string,
  tree: string | null,
  author: { name: string; email: string },
  message: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
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
    ref: `refs/heads/${branch}`,
    value: commit,
    force: true,
  });
  await git.push({
    fs,
    http,
    gitdir: tip.gitdir,
    url: remote.url,
    ref: branch,
    remoteRef: `refs/heads/${branch}`,
    onAuth: remote.onAuth,
  });
  return commit;
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
  if (input.tenantBranch && !BRANCH.test(input.tenantBranch)) {
    throw new HttpError(
      400,
      "validation_failed",
      "The branch for the tenant's access is not a branch name git accepts.",
    );
  }
  if (input.releaseBranch && !BRANCH.test(input.releaseBranch)) {
    throw new HttpError(
      400,
      "validation_failed",
      "The release branch is not a branch name git accepts.",
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
      credential_kind: credentialKind(token),
      verified_at: new Date(),
      ...(input.releaseBranch !== undefined ? { release_branch: input.releaseBranch } : {}),
      ...(input.tenantBranch !== undefined ? { tenant_branch: input.tenantBranch } : {}),
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

/** The file's name without its last extension: a script is its YAML and its source together. */
const stemOf = (path: string) => path.replace(/\.(yaml|ts)$/, "");

/** The workspace beside its branch: both as files, compared resource by resource. */
interface Sides {
  remoteFiles: ResourceFile[];
  mineFiles: ResourceFile[];
  theirs: Record<string, string>;
  mine: Record<string, string>;
  /**
   * What the workspace's resources say, as checksums of the console's own rendering of
   * each file. `mine` is the bytes a push would write, which keep what the author of a
   * file wrote around a change; this is what tells whether the workspace changed anything.
   */
  said: Record<string, string>;
  /**
   * The resource a file belongs to, named by its file on the branch without the
   * extension, or by its file here when the branch has none. A resource renamed
   * on one side is still one resource: both its files belong to it.
   */
  resourceOf: (path: string) => string;
  /** Two of the workspace's resources that would be written to one file. */
  problems: string[];
}

/**
 * Sets what the workspace has beside what the branch has.
 *
 * A file is the workspace's own writing only where it says something else than
 * the branch's: where both say the same, the branch's bytes are the
 * workspace's too. So a file a developer wrote by hand, with comments and in
 * their own order, is left as they wrote it until what it says is changed here.
 */
/**
 * Whether the workspace changed a file since it last agreed with its branch: whether it
 * says something else now. A workspace that has not synced since that was kept is
 * compared by its bytes, as it always was.
 */
const changedHere =
  (
    sides: Sides,
    link: { synced_files: Record<string, string>; synced_said: Record<string, string> | null },
  ) =>
  (path: string): boolean =>
    link.synced_said
      ? sides.said[path] !== link.synced_said[path]
      : sides.mine[path] !== link.synced_files[path];

async function sidesOf(
  manifests: readonly BundleManifest[],
  repository: Repository,
  folder: string,
): Promise<Sides> {
  const options = { folder, roots: repository.config.roots };
  const remote = new Map(repository.files.map((file) => [file.path, file.content]));
  const parsed = parseRepositoryFiles(repository.files, { ...options, kinds: WORKSPACE_KINDS });
  const theirKey = new Map<string, string>();
  const named = new Map<string, string>();
  const there = new Map<string, BundleManifest>();
  for (const manifest of parsed.manifests) {
    const file = parsed.files.get(keyOf(manifest)) as string;
    there.set(keyOf(manifest), manifest);
    named.set(keyOf(manifest), stemOf(file));
    for (const path of [file, `${stemOf(file)}.ts`]) {
      if (remote.has(path)) theirKey.set(path, keyOf(manifest));
    }
  }
  const myKey = new Map<string, string>();
  const mineFiles: ResourceFile[] = [];
  const saidFiles: ResourceFile[] = [];
  const problems: string[] = [];
  for (const manifest of manifests) {
    if (manifest.path.startsWith("core/")) continue;
    let files = renderRepositoryFiles([manifest], platformKinds, options);
    saidFiles.push(...files);
    const theirs = there.get(keyOf(manifest));
    if (theirs) {
      const said = renderRepositoryFiles([theirs], platformKinds, options);
      if (JSON.stringify(said) === JSON.stringify(files)) {
        files = files.map((file) => ({
          path: file.path,
          content: remote.get(file.path) as string,
        }));
      } else {
        // It says something else here. That is written into the file as its author wrote
        // it, wherever the file is now: their comments and their order stay.
        const written = remote.get(parsed.files.get(keyOf(manifest)) as string);
        files = files.map((file) =>
          file.path.endsWith(".yaml") && written !== undefined
            ? { path: file.path, content: ontoWritten(written, file.content) }
            : file,
        );
      }
    }
    for (const file of files) {
      const other = myKey.get(file.path);
      if (other !== undefined) {
        problems.push(
          `${file.path} would be the file of two resources, ${other} and ${keyOf(manifest)}. Rename one of them, or move its file in the repository.`,
        );
        continue;
      }
      myKey.set(file.path, keyOf(manifest));
      mineFiles.push(file);
    }
    if (!named.has(keyOf(manifest))) named.set(keyOf(manifest), stemOf(fileOf(manifest, folder)));
  }
  mineFiles.sort((a, b) => (a.path < b.path ? -1 : 1));
  return {
    remoteFiles: repository.files,
    mineFiles,
    theirs: await checksums(repository.files),
    mine: await checksums(mineFiles),
    said: await checksums(saidFiles),
    resourceOf: (path) => {
      const key = theirKey.get(path) ?? myKey.get(path);
      return (key === undefined ? undefined : named.get(key)) ?? stemOf(path);
    },
    problems,
  };
}

/** What the repository says about itself that stops a sync, said once. */
const configProblem = (repository: Repository) =>
  repository.problems.length > 0 ? repository.problems.join(" ") : undefined;

/**
 * Commits what the workspace has deployed to its branch: each resource's file
 * where the repository keeps it, and nothing else. Refused, with nothing
 * written, when someone changed a resource's file on the branch since the last
 * sync: that is pulled first.
 */
export async function push(
  kernel: Kernel,
  actor: Actor,
  workspace: WorkspaceRef,
  options: { message?: string | undefined; drafts?: boolean | undefined } = {},
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
    // With drafts, what is saved and not yet deployed goes too, for a developer to pick up.
    const manifests = options.drafts
      ? await draftManifests(kernel, db, workspace)
      : await activeConsoleManaged(kernel, db, workspace.id);
    let tip: Tip;
    try {
      tip = await fetchTip(remote, link.branch);
    } catch (error) {
      return failed(db, workspace, actor, "push", remoteProblem(error));
    }
    try {
      const repository = await readRepository(tip.gitdir, tip.commit);
      const sides = await sidesOf(manifests, repository, remote.folder);
      const problem = configProblem(repository) ?? sides.problems[0];
      if (problem) return failed(db, workspace, actor, "push", problem);
      const { theirs, mine: local } = sides;
      const base = link.synced_files;
      const moved = [...new Set([...Object.keys(theirs), ...Object.keys(base)])]
        .filter((path) => theirs[path] !== base[path] && theirs[path] !== local[path])
        .sort();
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
      // A branch made by this push starts as the default branch. The console's folder there
      // becomes what the workspace has. A resource file kept anywhere else that the workspace
      // does not have is somebody's work, and is left for a pull to bring in.
      const mayRemove = (path: string) => tip.exists || path.startsWith(`${remote.folder}/`);
      const changes = [
        ...sides.mineFiles
          .filter((file) => theirs[file.path] !== local[file.path])
          .map((file) => ({ path: file.path, content: file.content as string | null })),
        ...Object.keys(theirs)
          .filter((path) => local[path] === undefined && mayRemove(path))
          .map((path) => ({ path, content: null })),
      ];
      const left = Object.keys(theirs).filter(
        (path) => local[path] === undefined && !mayRemove(path),
      );
      const state = left.length > 0 ? ("behind" as const) : ("synced" as const);
      if (changes.length === 0 && tip.exists) {
        await settle(db, workspace, tip.commit, local, sides.said);
        await record(db, workspace, actor, { kind: "push", status: "nothing", commit: tip.commit });
        return {
          status: "nothing" as const,
          state: "synced" as const,
          commit: tip.commit,
          changedOnBranch: [],
        };
      }
      // What the branch would then hold is read as a build would read it. A push never
      // leaves the repository in a state that does not build.
      const changed = new Set(changes.map((change) => change.path));
      const after = parseRepositoryFiles(
        [...sides.remoteFiles.filter((file) => !changed.has(file.path)), ...sides.mineFiles],
        { folder: remote.folder, roots: repository.config.roots, kinds: WORKSPACE_KINDS },
      );
      if (after.problems.length > 0) {
        return failed(
          db,
          workspace,
          actor,
          "push",
          `Nothing was written: the branch would not build afterwards. ${after.problems.join(" ")}`,
        );
      }
      const { tree: rootTree } = await git
        .readCommit({ fs, gitdir: tip.gitdir, oid: tip.commit })
        .then((read) => read.commit);
      const tree = await patchTree(
        tip.gitdir,
        rootTree,
        changes.map((change) => ({ segments: change.path.split("/"), content: change.content })),
      );
      const message = `${options.message ?? "Deploy from the console"}\n\nWorkspace: ${workspace.slug}\n`;
      let commit: string;
      try {
        commit = await commitAndPush(
          remote,
          tip,
          link.branch,
          tree,
          await authorOf(db, actor),
          message,
        );
      } catch (error) {
        return failed(db, workspace, actor, "push", remoteProblem(error));
      }
      await settle(db, workspace, commit, local, sides.said, state);
      await record(db, workspace, actor, {
        kind: "push",
        status: "done",
        commit,
        message: options.message ?? null,
        detail: {
          files: sides.mineFiles.length,
          written: changes.filter((change) => change.content !== null).length,
          removed: changes.filter((change) => change.content === null).length,
        },
      });
      return { status: "done" as const, state, commit, changedOnBranch: left.sort() };
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
  said: Record<string, string>,
  state: "synced" | "behind" = "synced",
) {
  await db
    .updateTable("workspace_git")
    .set({
      synced_commit: commit,
      synced_files: JSON.stringify(files),
      synced_said: JSON.stringify(said),
      state,
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

/**
 * Reads what changed in the repository's resource files on the branch and
 * deploys it. A resource changed on both sides is a conflict: nothing is
 * deployed until each one is given to "mine" (what the workspace has) or
 * "theirs" (what the branch has).
 */
export async function pull(
  kernel: Kernel,
  actor: Actor,
  workspace: WorkspaceRef,
  options: {
    resolutions?: Record<string, "mine" | "theirs"> | undefined;
    /** Paths the pull may delete although it looks like a rename done as a delete and a create. */
    allowDelete?: readonly string[] | undefined;
  } = {},
) {
  const db = kernel.db;
  const remote = await remoteOf(kernel, db, workspace.tenantId);
  await linkOf(db, workspace);
  return withLease(db, workspace.id, async () => {
    const link = await linkOf(db, workspace);
    const stopped = async (problem: string) => ({
      ...(await failed(db, workspace, actor, "pull", problem)),
      conflicts: [] as string[],
      applied: [] as string[],
    });
    let tip: Tip;
    try {
      tip = await fetchTip(remote, link.branch);
    } catch (error) {
      return stopped(remoteProblem(error));
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
      let repository: Repository;
      try {
        repository = await readRepository(tip.gitdir, tip.commit, true);
      } catch (error) {
        if (!(error instanceof TooLarge)) throw error;
        return stopped(error.message);
      }
      const active = await activeConsoleManaged(kernel, db, workspace.id);
      const sides = await sidesOf(active, repository, remote.folder);
      const wrong = configProblem(repository);
      if (wrong) return stopped(wrong);
      const { theirs, mine, remoteFiles, mineFiles, resourceOf } = sides;
      const base = link.synced_files;

      // Compare resource by resource: a script is its YAML and its source together, and a
      // resource renamed on one side is its old file and its new one.
      const groups = new Map<string, string[]>();
      for (const path of new Set([
        ...Object.keys(theirs),
        ...Object.keys(mine),
        ...Object.keys(base),
      ])) {
        const resource = resourceOf(path);
        groups.set(resource, [...(groups.get(resource) ?? []), path]);
      }
      const differs = (a: Record<string, string>, b: Record<string, string>, resource: string) =>
        (groups.get(resource) ?? []).some((path) => a[path] !== b[path]);
      // Before files were kept anywhere, a resource was named without the console's folder.
      const chosen = (resource: string) =>
        options.resolutions?.[resource] ??
        (resource.startsWith(`${remote.folder}/`)
          ? options.resolutions?.[resource.slice(remote.folder.length + 1)]
          : undefined);
      const take: string[] = [];
      const conflicts: string[] = [];
      const keep: string[] = [];
      for (const resource of [...groups.keys()].sort()) {
        if (!differs(theirs, mine, resource)) continue;
        const theyChanged = differs(theirs, base, resource);
        const iChanged = (groups.get(resource) ?? []).some(changedHere(sides, link));
        if (theyChanged && !iChanged) take.push(resource);
        else if (theyChanged && iChanged) {
          const resolution = chosen(resource);
          if (resolution === "theirs") take.push(resource);
          else if (resolution === "mine") keep.push(resource);
          else conflicts.push(resource);
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
        ...mineFiles.filter((file) => !taken.has(resourceOf(file.path))),
        ...remoteFiles.filter((file) => taken.has(resourceOf(file.path))),
      ];
      const parsed = parseRepositoryFiles(merged, {
        folder: remote.folder,
        roots: repository.config.roots,
        kinds: WORKSPACE_KINDS,
      });
      if (parsed.problems.length > 0) {
        return stopped(`The files on the branch are not valid: ${parsed.problems.join(" ")}`);
      }
      // What a file does not say is kept as the resource has it: the name of its tool.
      const had = new Map(active.map((manifest) => [keyOf(manifest), manifest]));
      const manifests = parsed.manifests.map((manifest) => {
        const mcp = had.get(keyOf(manifest))?.mcp;
        return mcp ? { ...manifest, mcp } : manifest;
      });
      if (take.length > 0) {
        try {
          await mutate(db, actor, (trx, audit) =>
            deployConsoleManaged(
              kernel,
              trx,
              audit,
              workspace,
              actor.principal,
              manifests,
              `Pulled ${tip.commit.slice(0, 7)} from ${link.branch}`,
              options.allowDelete ?? [],
            ),
          );
        } catch (error) {
          if (!(error instanceof HttpError) || error.statusCode >= 500) throw error;
          const detail = [
            error.message,
            ...(error.issues ?? []).map((issue) => `${issue.path} ${issue.message}`),
          ].join(" ");
          return stopped(`What is on the branch cannot be deployed. ${detail}`);
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
          // What the workspace says now, read as the next comparison will read it.
          synced_said: JSON.stringify(
            (
              await sidesOf(
                await activeConsoleManaged(kernel, db, workspace.id),
                repository,
                remote.folder,
              )
            ).said,
          ),
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

/** Reaches the repository again with the stored token, and keeps when that worked. */
export async function checkRepository(kernel: Kernel, actor: Actor, tenantId: string) {
  const remote = await remoteOf(kernel, kernel.db, tenantId);
  let problem: string | null = null;
  try {
    const tip = await fetchTip(remote, remote.defaultBranch);
    await rm(tip.gitdir, { recursive: true, force: true });
  } catch (error) {
    problem = remoteProblem(error);
  }
  return mutate(kernel.db, actor, async (trx, audit) => {
    const row = problem
      ? await trx
          .selectFrom("git_repository")
          .selectAll()
          .where("tenant_id", "=", tenantId)
          .executeTakeFirstOrThrow()
      : await trx
          .updateTable("git_repository")
          .set({ verified_at: new Date() })
          .where("tenant_id", "=", tenantId)
          .returningAll()
          .executeTakeFirstOrThrow();
    await audit({
      action: "git_repository.checked",
      targetType: "git_repository",
      targetId: tenantId,
      tenantId,
      details: { ok: problem === null, ...(problem ? { problem } : {}) },
    });
    return { ok: problem === null, problem, repository: row };
  });
}

export interface CompareFile {
  /** From the repository's root. */
  path: string;
  /** The resource the file belongs to, as a pull names it in `conflicts` and `resolutions`. */
  resource: string;
  /** Changed in the workspace since the last sync. */
  here: boolean;
  /** Changed on the branch since the last sync. */
  branch: boolean;
  /** Its resource was changed on both sides, differently: a pull would ask which to keep. */
  conflict: boolean;
  /** For a conflict, both versions, so they can be set side by side. */
  mine?: string | null;
  theirs?: string | null;
}

/**
 * The workspace beside its branch, file by file, without changing either:
 * what each side changed since they last agreed, and both versions of a file
 * changed on both. With `drafts`, the workspace's side includes its drafts.
 */
export async function compareWithBranch(
  kernel: Kernel,
  workspace: WorkspaceRef,
  options: { drafts?: boolean } = {},
) {
  const db = kernel.db;
  const remote = await remoteOf(kernel, db, workspace.tenantId);
  const link = await linkOf(db, workspace);
  const tip = await fetchTip(remote, link.branch).catch((error) => {
    throw new HttpError(409, "repository_unreachable", remoteProblem(error));
  });
  try {
    const repository = tip.exists
      ? await readRepository(tip.gitdir, tip.commit)
      : { files: [], config: { roots: [], ignore: [] }, problems: [] };
    const sides = await sidesOf(
      options.drafts
        ? await draftManifests(kernel, db, workspace)
        : await activeConsoleManaged(kernel, db, workspace.id),
      repository,
      remote.folder,
    );
    const { theirs, mine, remoteFiles, mineFiles } = sides;
    const base = link.synced_files;
    const paths = [
      ...new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base)]),
    ].sort();
    // As a pull sees it: a resource changed on both sides is in conflict, whichever of its
    // files each side changed.
    const here = changedHere(sides, link);
    const resources = (which: (path: string) => boolean) =>
      new Set(paths.filter(which).map((path) => sides.resourceOf(path)));
    const [touchedHere, changedThere] = [
      resources(here),
      tip.exists ? resources((path) => theirs[path] !== base[path]) : new Set(),
    ];
    const files: CompareFile[] = [];
    for (const path of paths) {
      if (theirs[path] === mine[path]) continue;
      const resource = sides.resourceOf(path);
      const conflict = touchedHere.has(resource) && changedThere.has(resource);
      files.push({
        path,
        resource,
        here: here(path),
        branch: tip.exists && theirs[path] !== base[path],
        conflict,
        ...(conflict
          ? {
              mine: mineFiles.find((file) => file.path === path)?.content ?? null,
              theirs: remoteFiles.find((file) => file.path === path)?.content ?? null,
            }
          : {}),
      });
    }
    const head = tip.exists
      ? await git.readCommit({ fs, gitdir: tip.gitdir, oid: tip.commit }).then((read) => ({
          commit: tip.commit,
          message: read.commit.message.split("\n")[0] ?? "",
          author: read.commit.author.name,
          at: new Date(read.commit.author.timestamp * 1000).toISOString(),
        }))
      : null;
    return {
      branch: link.branch,
      exists: tip.exists,
      head,
      syncedCommit: link.synced_commit,
      ahead: files.filter((file) => file.here).length,
      behind: files.filter((file) => file.branch).length,
      conflicts: files.filter((file) => file.conflict).length,
      files,
    };
  } finally {
    await rm(tip.gitdir, { recursive: true, force: true });
  }
}

/** The workspace's console-managed resources with its drafts laid over them. */
export async function draftManifests(
  kernel: Kernel,
  db: Db,
  workspace: WorkspaceRef,
): Promise<BundleManifest[]> {
  const deployed = await activeConsoleManaged(kernel, db, workspace.id);
  const drafts = await db
    .selectFrom("resource_draft")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .execute();
  // By key: a draft that renames a resource replaces its file with one at the new path.
  const byKey = new Map(deployed.map((manifest) => [keyOf(manifest), manifest]));
  for (const draft of drafts) {
    if (draft.deleted) byKey.delete(draft.key);
    else {
      const was = byKey.get(draft.key);
      const title = draft.title ?? was?.title;
      byKey.set(draft.key, {
        kind: draft.kind,
        schemaVersion: draft.schema_version,
        path: draft.path,
        ...(draft.key !== draft.path ? { key: draft.key } : {}),
        ...(title ? { title } : {}),
        ...(was?.mcp ? { mcp: was.mcp } : {}),
        ...(was?.source
          ? {
              source: {
                ...was.source,
                file: movedFile(was.source.file, draft.kind, was.path, draft.path),
              },
            }
          : {}),
        ownership: "ui",
        body: draft.body as Record<string, unknown>,
      });
    }
  }
  return [...byKey.values()];
}

/**
 * Commits what a production workspace now runs to its release branch, after a
 * promotion. Written, never read. A failure is recorded against the workspace
 * and never undoes the promotion: it is shown with a way to try again.
 */
export async function pushRelease(
  kernel: Kernel,
  actor: Actor,
  workspace: WorkspaceRef,
  options: { version: number },
): Promise<{
  status: "done" | "nothing" | "failed" | "off";
  branch: string | null;
  problem?: string;
}> {
  const db = kernel.db;
  const repository = await db
    .selectFrom("git_repository")
    .select(["release_branch", "paused"])
    .where("tenant_id", "=", workspace.tenantId)
    .executeTakeFirst();
  if (!repository?.release_branch || repository.paused) return { status: "off", branch: null };
  const branch = `${repository.release_branch}/${workspace.slug}`;
  const remote = await remoteOf(kernel, db, workspace.tenantId);
  let tip: Tip;
  try {
    tip = await fetchTip(remote, branch);
  } catch (error) {
    const problem = remoteProblem(error);
    await record(db, workspace, actor, {
      kind: "push",
      status: "failed",
      message: problem,
      detail: { release: branch, version: options.version },
    });
    return { status: "failed", branch, problem };
  }
  try {
    // The branch is what production runs, and no more: a resource file there that
    // production does not have is removed, wherever it is kept.
    const repository = await readRepository(tip.gitdir, tip.commit);
    const sides = await sidesOf(
      await activeConsoleManaged(kernel, db, workspace.id),
      repository,
      remote.folder,
    );
    const files = sides.mineFiles;
    const changes = [
      ...files
        .filter((file) => sides.theirs[file.path] !== sides.mine[file.path])
        .map((file) => ({
          segments: file.path.split("/"),
          content: file.content as string | null,
        })),
      ...Object.keys(sides.theirs)
        .filter((path) => sides.mine[path] === undefined)
        .map((path) => ({ segments: path.split("/"), content: null })),
    ];
    if (tip.exists && changes.length === 0) {
      await record(db, workspace, actor, {
        kind: "push",
        status: "nothing",
        commit: tip.commit,
        detail: { release: branch, version: options.version },
      });
      return { status: "nothing", branch };
    }
    const { tree: rootTree } = await git
      .readCommit({ fs, gitdir: tip.gitdir, oid: tip.commit })
      .then((read) => read.commit);
    let commit: string;
    try {
      commit = await commitAndPush(
        remote,
        tip,
        branch,
        await patchTree(tip.gitdir, rootTree, changes),
        await authorOf(db, actor),
        `Promoted version ${options.version} to ${workspace.slug}\n\nWorkspace: ${workspace.slug}\n`,
      );
    } catch (error) {
      const problem = remoteProblem(error);
      await record(db, workspace, actor, {
        kind: "push",
        status: "failed",
        message: problem,
        detail: { release: branch, version: options.version },
      });
      return { status: "failed", branch, problem };
    }
    await record(db, workspace, actor, {
      kind: "push",
      status: "done",
      commit,
      detail: { release: branch, version: options.version, files: files.length },
    });
    return { status: "done", branch };
  } finally {
    await rm(tip.gitdir, { recursive: true, force: true });
  }
}

/**
 * Commits the tenant's access, as it now is, to the tenant's branch: one file
 * for each group, service account, role and binding, under `tenant/`. Like
 * every commit the platform makes, it is never to the default branch: a
 * developer merges it. A release has applied by the time this runs, and a
 * failure here leaves it applied: the next release commits the difference.
 */
export async function pushTenantAccess(
  kernel: Kernel,
  actor: Actor,
  tenantId: string,
  release: { number: number; message?: string | null },
): Promise<{
  status: "done" | "nothing" | "failed" | "off";
  branch: string | null;
  problem?: string;
}> {
  const db = kernel.db;
  const repository = await db
    .selectFrom("git_repository")
    .select(["tenant_branch", "paused"])
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!repository?.tenant_branch || repository.paused) return { status: "off", branch: null };
  const branch = repository.tenant_branch;
  const remote = await remoteOf(kernel, db, tenantId);
  let tip: Tip;
  try {
    tip = await fetchTip(remote, branch);
  } catch (error) {
    return { status: "failed", branch, problem: remoteProblem(error) };
  }
  try {
    const files = renderTenantFiles(await currentAccess(db, tenantId));
    const { tree: rootTree } = await git
      .readCommit({ fs, gitdir: tip.gitdir, oid: tip.commit })
      .then((read) => read.commit);
    const tree = await replaceAt(
      tip.gitdir,
      rootTree,
      [TENANT_FOLDER],
      await writeFiles(tip.gitdir, files),
    );
    if (tip.exists && tree === rootTree) return { status: "nothing", branch };
    const author = await authorOf(db, actor);
    const now = Math.floor(Date.now() / 1000);
    const commit = await git.writeCommit({
      fs,
      gitdir: tip.gitdir,
      commit: {
        tree: tree ?? (await git.writeTree({ fs, gitdir: tip.gitdir, tree: [] })),
        parent: [tip.commit],
        message: `${release.message?.trim() || `Access release ${release.number}`}\n\nAccess release: ${release.number}\n`,
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
      ref: `refs/heads/${branch}`,
      value: commit,
      force: true,
    });
    try {
      await git.push({
        fs,
        http,
        gitdir: tip.gitdir,
        url: remote.url,
        ref: branch,
        remoteRef: `refs/heads/${branch}`,
        onAuth: remote.onAuth,
      });
    } catch (error) {
      return { status: "failed", branch, problem: remoteProblem(error) };
    }
    return { status: "done", branch };
  } finally {
    await rm(tip.gitdir, { recursive: true, force: true });
  }
}
