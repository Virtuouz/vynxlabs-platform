import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import {
  followBranch,
  gitStatus,
  pull,
  push,
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
    }) => ({
      url: row.url,
      defaultBranch: row.default_branch,
      folder: row.folder,
      paused: row.paused,
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
          .select(["url", "default_branch", "folder", "paused"])
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
        return push(kernel, ctx.actor, ctx.workspace as WorkspaceRef, { message: body.message });
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
