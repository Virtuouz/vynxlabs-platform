import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { describeChange } from "../kernel/describe.js";
import { conflict, notFound } from "../kernel/errors.js";
import { loadBundle } from "../kernel/execution/bundles.js";
import { sameJson } from "../kernel/execution/oauth.js";
import { access, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { AnyObject, Id, WorkspaceParams } from "./shared.js";

const State = Type.Union([
  Type.Literal("in_sync"),
  Type.Literal("changed"),
  Type.Literal("only_here"),
  Type.Literal("only_there"),
]);
type State = "in_sync" | "changed" | "only_here" | "only_there";

interface Stored {
  path: string;
  kind: string;
  schema_version: number;
  ownership: string;
  body: unknown;
}

/**
 * Drift: how a workspace's resources differ from those of the workspace it
 * promotes to, now, resource by resource. What a promotion would change is
 * the promotion preview; this is what differs, whatever made it differ.
 */
export function driftRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    /** This workspace and the one it promotes to, with each one's resources. */
    const sides = async (
      ctx: { authorize: (permission: string, target: object) => Promise<void> },
      workspace: WorkspaceRef,
    ) => {
      const here = await db
        .selectFrom("workspace as here")
        .leftJoin("workspace as there", "there.id", "here.linked_workspace_id")
        .leftJoin("bundle as here_bundle", "here_bundle.id", "here.active_bundle_id")
        .leftJoin("bundle as there_bundle", "there_bundle.id", "there.active_bundle_id")
        .select([
          "there.id as there_id",
          "there.name as there_name",
          "there.slug as there_slug",
          "there.type as there_type",
          "here_bundle.version as here_version",
          "there_bundle.version as there_version",
          "there_bundle.id as there_bundle_id",
          "there_bundle.storage_key as there_storage_key",
        ])
        .where("here.id", "=", workspace.id)
        .executeTakeFirstOrThrow();
      if (!here.there_id) {
        throw conflict(
          "This workspace is not linked to another one, so there is nothing to compare it with.",
        );
      }
      await ctx.authorize("deployment:read", {
        tenantId: workspace.tenantId,
        workspaceId: here.there_id,
      });
      const resources = (workspaceId: string) =>
        db
          .selectFrom("resource")
          .select(["path", "kind", "schema_version", "ownership", "body"])
          .where("workspace_id", "=", workspaceId)
          .execute() as Promise<Stored[]>;
      return { here, mine: await resources(workspace.id), theirs: await resources(here.there_id) };
    };

    const stateOf = (mine: Stored | undefined, theirs: Stored | undefined): State =>
      !theirs
        ? "only_here"
        : !mine
          ? "only_there"
          : mine.kind === theirs.kind &&
              mine.schema_version === theirs.schema_version &&
              mine.ownership === theirs.ownership &&
              sameJson(mine.body, theirs.body)
            ? "in_sync"
            : "changed";

    app.get(
      `${base}/drift`,
      {
        config: { access: access.workspace("deployment:read") },
        schema: {
          summary: "How this workspace's resources differ from the workspace it promotes to",
          description:
            "Every resource either has, by path: the same, changed here, only here (a promotion " +
            "creates it), or only there. One only there that was made in that workspace's " +
            "console and its bundle does not carry is left by a promotion: `staysOnPromote`.",
          tags: ["deploys"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              target: Type.Object({
                id: Id,
                name: Type.String(),
                slug: Type.String(),
                type: Type.String(),
              }),
              versions: Type.Object({
                here: Type.Union([Type.Integer(), Type.Null()]),
                there: Type.Union([Type.Integer(), Type.Null()]),
              }),
              counts: Type.Object({
                in_sync: Type.Integer(),
                changed: Type.Integer(),
                only_here: Type.Integer(),
                only_there: Type.Integer(),
              }),
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  kind: Type.String(),
                  state: State,
                  ownership: Type.String(),
                  about: Type.Array(Type.String()),
                  staysOnPromote: Type.Boolean(),
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const { here, mine, theirs } = await sides(ctx, workspace);
        // What the target's bundle carries of its console resources: a promotion replaces those.
        const carried = new Set<string>();
        if (here.there_bundle_id && here.there_storage_key) {
          const content = await loadBundle(kernel, {
            id: here.there_bundle_id,
            storage_key: here.there_storage_key,
          });
          for (const manifest of content.manifests) {
            if (manifest.ownership === "ui") carried.add(manifest.path);
          }
        }
        const byPath = (rows: Stored[]) => new Map(rows.map((row) => [row.path, row]));
        const ours = byPath(mine);
        const other = byPath(theirs);
        const paths = [...new Set([...ours.keys(), ...other.keys()])].sort();
        const counts = { in_sync: 0, changed: 0, only_here: 0, only_there: 0 };
        const items = paths.map((path) => {
          const a = ours.get(path);
          const b = other.get(path);
          const state = stateOf(a, b);
          counts[state] += 1;
          const kind = (a ?? b)?.kind as string;
          return {
            path,
            kind,
            state,
            ownership: (a ?? b)?.ownership as string,
            about:
              state === "in_sync"
                ? []
                : state === "only_there"
                  ? []
                  : describeChange(
                      kind,
                      b?.body as Record<string, unknown> | undefined,
                      a?.body as Record<string, unknown> | undefined,
                    ),
            staysOnPromote: state === "only_there" && b?.ownership === "ui" && !carried.has(path),
          };
        });
        return {
          target: {
            id: here.there_id as string,
            name: here.there_name as string,
            slug: here.there_slug as string,
            type: here.there_type as string,
          },
          versions: { here: here.here_version ?? null, there: here.there_version ?? null },
          counts,
          items,
        };
      },
    );

    app.get(
      `${base}/drift/*`,
      {
        config: { access: access.workspace("deployment:read") },
        schema: {
          summary: "One resource here and in the workspace this one promotes to",
          description: "Both bodies, for a diff. Null on the side that does not have it.",
          tags: ["deploys"],
          params: Type.Object({ t: Id, w: Id, "*": Type.String() }),
          response: {
            200: Type.Object({
              path: Type.String(),
              kind: Type.String(),
              state: State,
              here: Type.Union([AnyObject, Type.Null()]),
              there: Type.Union([AnyObject, Type.Null()]),
              about: Type.Array(Type.String()),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const path = params["*"];
        const { mine, theirs } = await sides(ctx, workspace);
        const a = mine.find((row) => row.path === path);
        const b = theirs.find((row) => row.path === path);
        if (!a && !b) throw notFound(`The resource ${path}`);
        const state = stateOf(a, b);
        const kind = (a ?? b)?.kind as string;
        return {
          path,
          kind,
          state,
          here: (a?.body as Record<string, unknown> | undefined) ?? null,
          there: (b?.body as Record<string, unknown> | undefined) ?? null,
          about:
            state === "in_sync"
              ? []
              : state === "only_there"
                ? []
                : describeChange(
                    kind,
                    b?.body as Record<string, unknown> | undefined,
                    a?.body as Record<string, unknown> | undefined,
                  ),
        };
      },
    );
  };
}
