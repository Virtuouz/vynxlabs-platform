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
import type { Kernel } from "./kernel.js";
import { resolvePrincipal } from "./principal.js";

type Scope = "instance" | "tenant" | "tenant-or-instance" | "workspace";

/** How a route decides who may call it. Every route must declare one. */
export type Access =
  | { kind: "public" }
  | { kind: "signed-in" }
  /** The handler calls `ctx.authorize` itself, because the target depends on the request body. */
  | { kind: "custom" }
  | { kind: "permission"; permission: string; scope: Scope };

export const access = {
  public: { kind: "public" } as Access,
  signedIn: { kind: "signed-in" } as Access,
  custom: { kind: "custom" } as Access,
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

declare module "fastify" {
  interface FastifyContextConfig {
    access?: Access;
  }
  interface FastifyRequest {
    ctx: RequestContext;
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
    if (this.principal.type !== "member" || !this.principal.id) {
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

  app.addHook("preHandler", async (request) => {
    const declared = request.routeOptions.config.access;
    if (!declared) {
      throw new Error(`Route ${request.routeOptions.url} declares no access rule.`);
    }
    const principal =
      declared.kind === "public" ? ANONYMOUS : await resolvePrincipal(kernel, request);
    const ctx = new RequestContext(kernel, principal, request);
    request.ctx = ctx;

    if (declared.kind === "public" || declared.kind === "custom") return;
    if (declared.kind === "signed-in") {
      if (principal.type === "anonymous") throw unauthenticated();
      return;
    }

    const params = request.params as { t?: string; w?: string };
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
