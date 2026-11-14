import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
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
} from "../kernel/git.js";
import { access, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { AnyObject, Id, iso, NullableId, TenantParams, Time, WorkspaceParams } from "./shared.js";

const NullableString = Type.Union([Type.String(), Type.Null()]);
const Repository = Type.Object({
  url: Type.String(),
  defaultBranch: Type.String(),
  folder: Type.String({
    description: "The folder the server writes. Nothing else in the repository is touched.",
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
      "folder changed on the branch. `conflict`: a pull found a resource changed on both sides.",
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
    }) => ({
      url: row.url,
      defaultBranch: row.default_branch,
      folder: row.folder,
      paused: row.paused,
      verifiedAt: row.verified_at ? iso(row.verified_at) : null,
      credentialKind: row.credential_kind ?? "token",
      releaseBranch: row.release_branch ?? null,
    });
    const status = async (workspace: WorkspaceRef) => {
      const { repository, link } = await gitStatus(kernel, workspace);
      return {
        repository: repository ? toRepository(repository) : null,
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
          ])
          .where("tenant_id", "=", params.t)
          .executeTakeFirst();
        return { repository: row ? toRepository(row) : null };
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
          }),
          response: { 200: Repository },
        },
      },
      async ({ ctx, params, body }) => {
        ctx.mutated = true;
        return toRepository(await saveRepository(kernel, ctx.actor, params.t, body));
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
            "One commit, authored by whoever asks. `refused` means the folder changed on the " +
            "branch since the last sync: pull first. Nothing outside the folder is touched.",
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
                  path: Type.String(),
                  here: Type.Boolean(),
                  branch: Type.Boolean(),
                  conflict: Type.Boolean(),
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
        return { ...checked, repository: toRepository(checked.repository) };
      },
    );

    app.post(
      `${base}/git/pull`,
      {
        config: { access: access.workspace("deployment:write") },
        schema: {
          summary: "Deploy what changed in the folder on the branch",
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
          }),
          response: {
            200: Type.Object({
              ...Outcome,
              conflicts: Type.Array(Type.String(), {
                description:
                  "Resources changed on both sides, as their file names without the extension.",
              }),
              applied: Type.Array(Type.String()),
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
        return pull(kernel, ctx.actor, workspace, { resolutions: body.resolutions });
      },
    );

    app.get(
      `${base}/git/operations`,
      {
        config: { access: access.workspace("git:read") },
        schema: {
          summary: "The workspace's recent pushes and pulls",
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
            kind: row.kind,
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
