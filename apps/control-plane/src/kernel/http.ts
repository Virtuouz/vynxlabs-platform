import { TenantNotFoundError } from "@vynxlabs/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  type Actor,
  ANONYMOUS,
  type Audit,
  mutate,
  type Principal,
  type Trx,
  writeAudit,
} from "./audit.js";
import { check, type Target } from "./authorize.js";
import { forbidden, notFound, unauthenticated } from "./errors.js";
import type { WorkerScope } from "./execution/runs.js";
import { resolveWorker } from "./execution/workers.js";
import type { Kernel } from "./kernel.js";
import { resolvePrincipal } from "./principal.js";
import { resolveScimCaller, type ScimCaller } from "./sso/scim.js";

type Scope = "instance" | "tenant" | "tenant-or-instance" | "workspace";

/** How a route decides who may call it. Every route must declare one. */
export type Access =
  | { kind: "public" }
  | { kind: "signed-in" }
  /** The handler calls `ctx.authorize` itself, because the target depends on the request body. */
  | { kind: "custom" }
  /** Called by a worker with a worker credential, under the worker protocol. */
  | { kind: "worker" }
  /** Called by an identity provider with a token made for it, under SCIM. */
  | { kind: "scim" }
  | { kind: "permission"; permission: string; scope: Scope };

export const access = {
  public: { kind: "public" } as Access,
  signedIn: { kind: "signed-in" } as Access,
  custom: { kind: "custom" } as Access,
  worker: { kind: "worker" } as Access,
  scim: { kind: "scim" } as Access,
  instance: (permission: string): Access => ({ kind: "permission", permission, scope: "instance" }),
  tenant: (permission: string): Access => ({ kind: "permission", permission, scope: "tenant" }),
  tenantOrInstance: (permission: string): Access => ({
    kind: "permission",
    permission,
    scope: "tenant-or-instance",
  }),
  workspace: (permission: string): Access => ({
    kind: "permission",
    permission,
    scope: "workspace",
  }),
};

/**
 * A limit for routes an app may call for someone who is not signed in. It counts
 * only those callers, by address: a public app must not let anyone who finds it
 * read the tenant's tables as fast as they like.
 */
export const guestLimit = {
  max: 120,
  timeWindow: "1 minute",
  hook: "preHandler" as const,
  allowList: (request: FastifyRequest) => request.ctx?.principal.type !== "anonymous",
};

declare module "fastify" {
  interface FastifyContextConfig {
    access?: Access;
  }
  interface FastifyRequest {
    ctx: RequestContext;
    /** Set on worker protocol routes. */
    worker: WorkerScope;
    /** Set on SCIM routes: the provider that is pushing. */
    scim: ScimCaller;
  }
}

export interface WorkspaceRef {
  id: string;
  tenantId: string;
  slug: string;
}

export class RequestContext {
  readonly kernel: Kernel;
  readonly principal: Principal;
  readonly actor: Actor;
  /** Set on workspace-scoped routes, after the workspace was found in the tenant. */
  workspace: WorkspaceRef | undefined;
  mutated = false;
  readonly #request: FastifyRequest;

  constructor(kernel: Kernel, principal: Principal, request: FastifyRequest) {
    this.kernel = kernel;
    this.principal = principal;
    this.#request = request;
    this.actor = {
      principal,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      requestId: request.id,
    };
  }

  get db() {
    return this.kernel.db;
  }

  /** The member calling, or a 403 for any other kind of principal. */
  get memberId(): string {
    if (
      this.principal.type !== "member" ||
      !this.principal.id ||
      this.principal.appTenantId !== undefined
    ) {
      throw forbidden("member-only");
    }
    return this.principal.id;
  }

  async allowed(permission: string, target: Target): Promise<boolean> {
    return (await check(this.db, this.principal, permission, target)).allowed;
  }

  /**
   * The single authorization check. Throws 404 when the caller has no standing
   * in the tenant, so tenant IDs cannot be probed, and 403 or 401 otherwise.
   */
  async authorize(permission: string, target: Target): Promise<void> {
    const decision = await check(this.db, this.principal, permission, target);
    if (!decision.allowed) {
      if (this.principal.type === "anonymous") throw unauthenticated();
      if (!decision.related) throw notFound("The tenant");
      throw forbidden(permission);
    }
    if (decision.accessGrantId && this.actor.accessGrantId !== decision.accessGrantId) {
      this.actor.accessGrantId = decision.accessGrantId;
      // Everything an operator does inside a tenant is recorded, reads included.
      await writeAudit(this.db, this.actor, {
        action: "operator.access",
        targetType: "request",
        targetId: `${this.#request.method} ${this.#request.routeOptions.url}`,
        tenantId: target.tenantId ?? null,
        workspaceId: target.workspaceId ?? null,
        details: { permission },
      });
    }
  }

  /** Runs a change through the one write path. */
  mutate<T>(change: (trx: Trx, audit: Audit) => Promise<T>): Promise<T> {
    this.mutated = true;
    return mutate(this.db, this.actor, change);
  }
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Installs the hooks that resolve the caller and enforce each route's declared access. */
export function installAccessControl(app: FastifyInstance, kernel: Kernel) {
  app.decorateRequest("ctx", null as unknown as RequestContext);
  app.decorateRequest("worker", null as unknown as WorkerScope);
  app.decorateRequest("scim", null as unknown as ScimCaller);

  app.addHook("preHandler", async (request) => {
    const declared = request.routeOptions.config.access;
    if (!declared) {
      throw new Error(`Route ${request.routeOptions.url} declares no access rule.`);
    }
    if (declared.kind === "worker") {
      request.worker = await resolveWorker(kernel, request);
      return;
    }
    if (declared.kind === "scim") {
      const { provider } = request.params as { provider: string };
      request.scim = await resolveScimCaller(kernel, request, provider);
      return;
    }
    const params = request.params as { t?: string; w?: string };
    // At a hostname a tenant registered, the API answers for that tenant and no other.
    const place = await kernel.hosts.place(request);
    if (place.kind === "domain" && params.t !== undefined && params.t !== place.domain.tenantId) {
      throw notFound("The tenant");
    }
    const principal =
      declared.kind === "public" ? ANONYMOUS : await resolvePrincipal(kernel, request, params.t);
    const ctx = new RequestContext(kernel, principal, request);
    request.ctx = ctx;

    if (declared.kind === "public" || declared.kind === "custom") return;
    if (declared.kind === "signed-in") {
      if (principal.type === "anonymous") throw unauthenticated();
      // These routes are a member's own account: its tenants, its API keys. A sign-in
      // to one tenant's apps is not a sign-in to that.
      if (principal.type === "end_user" || principal.appTenantId !== undefined) {
        throw forbidden("member-only");
      }
      return;
    }

    if (declared.scope === "instance") {
      await ctx.authorize(declared.permission, {});
      return;
    }
    const tenantId = params.t as string;
    try {
      // Every tenant-scoped request resolves the tenant through the routing layer.
      await kernel.router.forTenant(tenantId);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        throw principal.type === "anonymous" ? unauthenticated() : notFound("The tenant");
      }
      throw error;
    }
    await ctx.authorize(declared.permission, {
      tenantId,
      workspaceId: declared.scope === "workspace" ? params.w : undefined,
      orInstance: declared.scope === "tenant-or-instance",
    });
    if (declared.scope === "workspace") {
      ctx.workspace = await findWorkspace(kernel, tenantId, params.w as string);
    }
  });

  // A change that did not go through the write path has no audit entry. Refuse to report success.
  app.addHook("onSend", async (request, reply) => {
    const declared = request.routeOptions.config.access;
    if (
      declared &&
      declared.kind !== "public" &&
      declared.kind !== "worker" &&
      // A push that asks for what already holds changes nothing, and is still a success.
      declared.kind !== "scim" &&
      !READ_METHODS.has(request.method) &&
      reply.statusCode < 400 &&
      !request.ctx?.mutated
    ) {
      throw new Error(
        `${request.method} ${request.routeOptions.url} changed nothing through the write path.`,
      );
    }
  });
}

export async function findWorkspace(
  kernel: Kernel,
  tenantId: string,
  workspaceId: string,
): Promise<WorkspaceRef> {
  const workspace = await kernel.db
    .selectFrom("workspace")
    .select(["id", "tenant_id", "slug"])
    .where("id", "=", workspaceId)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!workspace) throw notFound("The workspace");
  return { id: workspace.id, tenantId: workspace.tenant_id, slug: workspace.slug };
}
