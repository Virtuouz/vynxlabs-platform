import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { CredentialSet, credentialSetters } from "../kernel/credentials.js";
import {
  checkRepository,
  compareWithBranch,
  followBranch,
  gitStatus,
  pull,
  push,
  pushRelease,
  removeRepository,
  saveRepository,
  unfollowBranch,
} from "../kernel/git.js";
import { access, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { requireStanding } from "../kernel/pages/standing.js";
import { AnyObject, Id, iso, NullableId, TenantParams, Time, WorkspaceParams } from "./shared.js";

const NullableString = Type.Union([Type.String(), Type.Null()]);
const Repository = Type.Object({
  url: Type.String(),
  defaultBranch: Type.String(),
  folder: Type.String({
    description:
      "Where resources made in the console are written. A resource file kept anywhere else is written back where it is; nothing that is not a resource's file is touched.",
  }),
  folderInForce: Type.String({
    description:
      "The folder resources made in the console are written to now: the `resources` that `volvel.yaml` names on the last branch read, else `folder`.",
  }),
  folderFrom: Type.Union([Type.Literal("setting"), Type.Literal("volvel.yaml")], {
    description:
      "Where `folderInForce` comes from. `volvel.yaml` wins over the setting (D65), and the setting is then not used.",
  }),
  fileReadAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()], {
    description:
      "When a branch's `volvel.yaml` was last read, by a sync or a check. Null: not yet, so `folderFrom` is only the setting.",
  }),
  paused: Type.Boolean({
    description:
      "True on a tenant imported from another instance, until the repository is saved again.",
  }),
  verifiedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()], {
    description: "When the stored token last reached the repository.",
  }),
  credentialKind: Type.String({
    description:
      "The kind of token, from its shape: github-fine-grained, github-classic, github-app, " +
      "gitlab-deploy-token, gitlab-access-token, bitbucket-token, or token. A classic GitHub " +
      "token belongs to a person, and stops working when they leave.",
  }),
  releaseBranch: Type.Union([Type.String(), Type.Null()], {
    description:
      "Each promotion commits what production runs to `<releaseBranch>/<workspace>`. Null: off.",
  }),
  tenantBranch: Type.Union([Type.String(), Type.Null()], {
    description:
      "Each access change commits it to this branch, under `tenant/`. Never the default branch: a developer merges it. Null: off.",
  }),
  ...CredentialSet,
});
const State = Type.Union(
  [
    Type.Literal("never"),
    Type.Literal("synced"),
    Type.Literal("ahead"),
    Type.Literal("behind"),
    Type.Literal("conflict"),
    Type.Literal("error"),
  ],
  {
    description:
      "`ahead`: the workspace has deployed something the branch does not have. `behind`: the " +
      "resource's file changed on the branch. `conflict`: a pull found a resource changed on both sides.",
  },
);
const Status = Type.Object({
  repository: Type.Union([Repository, Type.Null()]),
  branch: NullableString,
  state: Type.Union([State, Type.Null()]),
  syncedCommit: NullableString,
  lastError: NullableString,
  updatedAt: Type.Union([Time, Type.Null()]),
});

/** A tenant's repository, and the branch each dev workspace follows. */
export function gitRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";
    const toRepository = (row: {
      url: string;
      default_branch: string;
      folder: string;
      paused: boolean;
      verified_at?: Date | null;
      credential_kind?: string;
      release_branch?: string | null;
      tenant_branch?: string | null;
      file_folder?: string | null;
      file_read_at?: Date | null;
    }) => ({
      url: row.url,
      defaultBranch: row.default_branch,
      folder: row.folder,
      folderInForce: row.file_folder ?? row.folder,
      folderFrom: row.file_folder ? ("volvel.yaml" as const) : ("setting" as const),
      fileReadAt: row.file_read_at ? iso(row.file_read_at) : null,
      paused: row.paused,
      verifiedAt: row.verified_at ? iso(row.verified_at) : null,
      credentialKind: row.credential_kind ?? "token",
      releaseBranch: row.release_branch ?? null,
      tenantBranch: row.tenant_branch ?? null,
    });
    /** The repository as the API shows it, with when and by whom its token was set. */
    const repositoryOf = async (tenantId: string, row: Parameters<typeof toRepository>[0]) => {
      const stamp = await db
        .selectFrom("git_repository")
        .select(["credential_set_at", "credential_set_by_type", "credential_set_by_id"])
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      return { ...toRepository(row), ...(await credentialSetters(db, [stamp]))(stamp) };
    };
    const status = async (workspace: WorkspaceRef) => {
      const { repository, link } = await gitStatus(kernel, workspace);
      return {
        repository: repository ? await repositoryOf(workspace.tenantId, repository) : null,
        branch: link?.branch ?? null,
        state: link?.state ?? null,
        syncedCommit: link?.synced_commit ?? null,
        lastError: link?.last_error ?? null,
        updatedAt: link ? iso(link.updated_at) : null,
      };
    };

    app.get(
      "/tenants/:t/git-repository",
      {
        config: { access: access.tenant("git:read") },
        schema: {
          summary: "The tenant's repository",
          description: "The access token is never returned.",
          tags: ["git"],
          params: TenantParams,
          response: { 200: Type.Object({ repository: Type.Union([Repository, Type.Null()]) }) },
        },
      },
      async ({ params }) => {
        const row = await db
          .selectFrom("git_repository")
          .select([
            "url",
            "default_branch",
            "folder",
            "paused",
            "verified_at",
            "credential_kind",
            "release_branch",
            "tenant_branch",
            "file_folder",
            "file_read_at",
          ])
          .where("tenant_id", "=", params.t)
          .executeTakeFirst();
        return { repository: row ? await repositoryOf(params.t, row) : null };
      },
    );

    app.put(
      "/tenants/:t/git-repository",
      {
        config: { access: access.tenant("git:write") },
        schema: {
          summary: "Connect the tenant's repository, or change it",
          description:
            "The repository is reached with the token before anything is saved, so a wrong " +
            "address or token is said now. The address is HTTPS. The token needs to read and " +
            "write the repository's contents: a fine-grained personal access token on GitHub, " +
            "a project access token on GitLab, a repository access token on Bitbucket. Leave " +
            "the token out to keep the stored one. Saving turns a paused sync back on.",
          tags: ["git"],
          params: TenantParams,
          body: Type.Object({
            url: Type.String({ maxLength: 500 }),
            defaultBranch: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
            folder: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
            username: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
            token: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
            releaseBranch: Type.Optional(
              Type.Union([Type.String({ minLength: 1, maxLength: 150 }), Type.Null()]),
            ),
            tenantBranch: Type.Optional(
              Type.Union([Type.String({ minLength: 1, maxLength: 150 }), Type.Null()]),
            ),
          }),
          response: { 200: Repository },
        },
      },
      async ({ ctx, params, body }) => {
        ctx.mutated = true;
        return repositoryOf(params.t, await saveRepository(kernel, ctx.actor, params.t, body));
      },
    );

    app.delete(
      "/tenants/:t/git-repository",
      {
        config: { access: access.tenant("git:write") },
        schema: {
          summary: "Disconnect the tenant's repository",
          description: "Nothing in the repository is changed. Workspaces stop following branches.",
          tags: ["git"],
          params: TenantParams,
          response: { 204: Type.Null() },
        },
      },
      async ({ ctx, params }, reply) => {
        ctx.mutated = true;
        await removeRepository(kernel, ctx.actor, params.t);
        return reply.code(204).send(null);
      },
    );

    app.get(
      `${base}/git`,
      {
        config: { access: access.workspace("git:read") },
        schema: {
          summary: "How a workspace stands against its branch",
          description:
            "What the workspace is connected to, and how it differs from the repository.",
          tags: ["git"],
          params: WorkspaceParams,
          response: { 200: Status },
        },
      },
      async ({ ctx }) => status(ctx.workspace as WorkspaceRef),
    );

    app.put(
      `${base}/git`,
      {
        config: { access: access.workspace("git:write") },
        schema: {
          summary: "Make a dev workspace follow a branch",
          description:
            "The first push creates the branch from the default branch. A workspace cannot " +
            "follow the default branch itself.",
          tags: ["git"],
          params: WorkspaceParams,
          body: Type.Object({ branch: Type.String({ minLength: 1, maxLength: 200 }) }),
          response: { 200: Status },
        },
      },
      async ({ ctx, body }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        ctx.mutated = true;
        await followBranch(kernel, ctx.actor, workspace, body.branch);
        return status(workspace);
      },
    );

    app.delete(
      `${base}/git`,
      {
        config: { access: access.workspace("git:write") },
        schema: {
          summary: "Make a dev workspace follow no branch",
          description:
            "The workspace stops syncing with its branch. The branch and what is on it are left " +
            "as they are, and the workspace can follow it again, or another, with `PUT`. A " +
            "workspace that follows nothing is refused with `no_branch`.",
          tags: ["git"],
          params: WorkspaceParams,
          response: { 200: Status },
        },
      },
      async ({ ctx }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        ctx.mutated = true;
        await unfollowBranch(kernel, ctx.actor, workspace);
        return status(workspace);
      },
    );

    const Outcome = {
      status: Type.Union([
        Type.Literal("done"),
        Type.Literal("nothing"),
        Type.Literal("refused"),
        Type.Literal("failed"),
      ]),
      state: State,
      commit: NullableString,
      problem: Type.Optional(Type.String()),
    };

    app.post(
      `${base}/git/push`,
      {
        config: { access: access.workspace("git:write") },
        schema: {
          summary: "Commit what the workspace has deployed to its branch",
          description:
            "One commit, authored by whoever asks, of each resource's file where the repository " +
            "keeps it. `refused` means a resource's file changed on the branch since the last " +
            "sync: pull first. Nothing that is not a resource's file is touched.",
          tags: ["git"],
          params: WorkspaceParams,
          body: Type.Object({
            message: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
            drafts: Type.Optional(
              Type.Boolean({
                description:
                  "Commit the drafts too, saved and not deployed, so a developer can pick them up.",
              }),
            ),
          }),
          response: {
            200: Type.Object({
              ...Outcome,
              changedOnBranch: Type.Array(Type.String(), {
                description: "For `refused`: the files that changed on the branch.",
              }),
            }),
          },
        },
      },
      async ({ ctx, body }) => {
        ctx.mutated = true;
        return push(kernel, ctx.actor, ctx.workspace as WorkspaceRef, {
          message: body.message,
          drafts: body.drafts,
        });
      },
    );

    app.get(
      `${base}/git/compare`,
      {
        config: { access: access.workspace("git:read") },
        schema: {
          summary: "The workspace beside its branch, file by file",
          description:
            "What each side changed since they last agreed, read from the branch now, with " +
            "both versions of a file changed on both. Nothing is changed. With `drafts`, the " +
            "workspace's side includes what is saved and not deployed.",
          tags: ["git"],
          params: WorkspaceParams,
          querystring: Type.Object({ drafts: Type.Optional(Type.Boolean()) }),
          response: {
            200: Type.Object({
              branch: Type.String(),
              exists: Type.Boolean(),
              head: Type.Union([
                Type.Object({
                  commit: Type.String(),
                  message: Type.String(),
                  author: Type.String(),
                  at: Time,
                }),
                Type.Null(),
              ]),
              syncedCommit: NullableString,
              ahead: Type.Integer(),
              behind: Type.Integer(),
              conflicts: Type.Integer(),
              files: Type.Array(
                Type.Object({
                  path: Type.String({ description: "From the repository's root." }),
                  resource: Type.String({
                    description:
                      "The resource the file belongs to, as a pull names it in `conflicts` and " +
                      "takes it in `resolutions`: its file on the branch, without the extension.",
                  }),
                  here: Type.Boolean(),
                  branch: Type.Boolean(),
                  conflict: Type.Boolean(),
                  change: Type.Union(
                    [
                      Type.Literal("new_here"),
                      Type.Literal("removed_here"),
                      Type.Literal("new_there"),
                      Type.Literal("removed_there"),
                      Type.Literal("changed"),
                    ],
                    {
                      description:
                        "What the difference is. `new_here` is a file only the workspace has: a " +
                        "resource made in the console, or one taken over from the repository's " +
                        "code, which had no file until then.",
                    },
                  ),
                  mine: Type.Optional(NullableString),
                  theirs: Type.Optional(NullableString),
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, query }) =>
        compareWithBranch(kernel, ctx.workspace as WorkspaceRef, { drafts: query.drafts === true }),
    );

    app.post(
      `${base}/git/release`,
      {
        config: { access: access.workspace("promotion:write") },
        schema: {
          summary: "Commit what this production workspace runs to its release branch again",
          description: "What a promotion does by itself. For trying again after that push failed.",
          tags: ["git"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              status: Type.String(),
              branch: NullableString,
              problem: Type.Optional(Type.String()),
            }),
          },
        },
      },
      async ({ ctx }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const active = await db
          .selectFrom("workspace")
          .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
          .select(["bundle.version", "workspace.type"])
          .where("workspace.id", "=", workspace.id)
          .executeTakeFirst();
        if (!active) return { status: "nothing", branch: null };
        ctx.mutated = true;
        return pushRelease(kernel, ctx.actor, workspace, { version: active.version });
      },
    );

    app.get(
      "/tenants/:t/git-branches",
      {
        config: { access: access.tenant("git:read") },
        schema: {
          summary: "Every branch the tenant's workspaces use",
          description:
            "The branch each dev workspace follows, with how it stands, and the release " +
            "branch each production workspace's promotions are committed to.",
          tags: ["git"],
          params: TenantParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  workspaceId: Id,
                  workspace: Type.String(),
                  type: Type.String(),
                  branch: NullableString,
                  mode: Type.String({
                    description: "`follows` for dev, `release` for production.",
                  }),
                  state: NullableString,
                  lastError: NullableString,
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const repository = await db
          .selectFrom("git_repository")
          .select("release_branch")
          .where("tenant_id", "=", params.t)
          .executeTakeFirst();
        const rows = await db
          .selectFrom("workspace")
          .leftJoin("workspace_git", "workspace_git.workspace_id", "workspace.id")
          .select([
            "workspace.id",
            "workspace.name",
            "workspace.slug",
            "workspace.type",
            "workspace_git.branch",
            "workspace_git.state",
            "workspace_git.last_error",
          ])
          .where("workspace.tenant_id", "=", params.t)
          .orderBy("workspace.name")
          .execute();
        return {
          items: rows.map((row) => ({
            workspaceId: row.id,
            workspace: row.name,
            type: row.type,
            branch:
              row.type === "production"
                ? repository?.release_branch
                  ? `${repository.release_branch}/${row.slug}`
                  : null
                : (row.branch ?? null),
            mode: row.type === "production" ? "release" : "follows",
            state: row.state ?? null,
            lastError: row.last_error ?? null,
          })),
        };
      },
    );

    app.post(
      "/tenants/:t/git-repository/check",
      {
        config: { access: access.tenant("git:write") },
        schema: {
          summary: "Reach the repository again with the stored token",
          description: "Keeps when it worked, so the console can say how long ago it was verified.",
          tags: ["git"],
          params: TenantParams,
          response: {
            200: Type.Object({
              ok: Type.Boolean(),
              problem: NullableString,
              repository: Repository,
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        ctx.mutated = true;
        const checked = await checkRepository(kernel, ctx.actor, params.t);
        return { ...checked, repository: await repositoryOf(params.t, checked.repository) };
      },
    );

    app.post(
      `${base}/git/pull`,
      {
        config: { access: access.workspace("deployment:write") },
        schema: {
          summary: "Deploy what changed in the resource files on the branch",
          description:
            "A resource changed on the branch and not here is taken. A resource changed on " +
            "both sides is a conflict: the answer lists them and deploys nothing. Ask again " +
            "with `resolutions`, giving each to `mine` or `theirs`. Pulling code also needs " +
            "`code:write`.",
          tags: ["git"],
          params: WorkspaceParams,
          body: Type.Object({
            resolutions: Type.Optional(
              Type.Record(
                Type.String({ maxLength: 400 }),
                Type.Union([Type.Literal("mine"), Type.Literal("theirs")]),
              ),
            ),
            allowDelete: Type.Optional(
              Type.Array(Type.String({ maxLength: 255 }), {
                maxItems: 200,
                description:
                  "Paths this may delete although it also creates something of the same kind. " +
                  "Without it, such a deletion is refused with `rename_suspected`.",
              }),
            ),
          }),
          response: {
            200: Type.Object({
              ...Outcome,
              conflicts: Type.Array(Type.String(), {
                description:
                  "Resources changed on both sides, as their file names without the extension.",
              }),
              applied: Type.Array(Type.String()),
              suspected: Type.Optional(
                Type.Array(Type.String(), {
                  description:
                    "Paths the pull would delete although it creates something of the same kind, " +
                    "so it stopped: ask again with `allowDelete` naming them, if they are not renames.",
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, body }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        // A pull can bring code from the repository into what workers run.
        await ctx.authorize("code:write", {
          tenantId: workspace.tenantId,
          workspaceId: workspace.id,
        });
        ctx.mutated = true;
        return pull(kernel, ctx.actor, workspace, {
          resolutions: body.resolutions,
          allowDelete: body.allowDelete,
          // Brought in, SQL and a data source's table are held to what a console deploy is.
          standing: (changes) =>
            requireStanding(kernel, ctx, workspace, changes, { deploying: true }),
        });
      },
    );

    app.get(
      `${base}/git/operations`,
      {
        config: { access: access.workspace("git:read") },
        schema: {
          summary: "The workspace's recent pushes and pulls",
          description: "Each push and pull, newest first, with how it ended.",
          tags: ["git"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  id: Id,
                  kind: Type.String(),
                  status: Type.String(),
                  commit: NullableString,
                  message: NullableString,
                  detail: AnyObject,
                  createdByType: Type.String(),
                  createdById: NullableId,
                  createdAt: Time,
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx }) => {
        const rows = await db
          .selectFrom("git_operation")
          .selectAll()
          .where("workspace_id", "=", (ctx.workspace as WorkspaceRef).id)
          .orderBy("id", "desc")
          .limit(50)
          .execute();
        return {
          items: rows.map((row) => ({
            id: row.id,
            // A commit to a release branch is a push in the table, and says which branch in its detail.
            kind: typeof row.detail?.release === "string" ? "release" : row.kind,
            status: row.status,
            commit: row.commit_id,
            message: row.message,
            detail: row.detail,
            createdByType: row.created_by_type,
            createdById: row.created_by_id,
            createdAt: iso(row.created_at),
          })),
        };
      },
    );
  };
}
