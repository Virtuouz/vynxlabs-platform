import { createHash, timingSafeEqual } from "node:crypto";
import { TenantNotFoundError } from "@volvel/db";
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
import {
  boundInside,
  check,
  checkMany,
  type Decision,
  type StandingMemo,
  type Target,
} from "./authorize.js";
import { forbidden, forbiddenBecause, notFound, unauthenticated } from "./errors.js";
import type { WorkerScope } from "./execution/runs.js";
import { resolveWorker } from "./execution/workers.js";
import type { Kernel } from "./kernel.js";
import { resolvePrincipal } from "./principal.js";
import { type AliasUse, aliasHeaders } from "./resolve.js";
import { resolveScimCaller, type ScimCaller } from "./sso/scim.js";

type Scope = "instance" | "tenant" | "tenant-or-instance" | "workspace";

/** How a route decides who may call it. Every route must declare one. */
export type Access =
  /** `says` is what a caller needs to bring, when it is not nothing: a token in the address, say. */
  | { kind: "public"; says?: string }
  /** A member's own account. A service account's key is refused, unless the route says `serviceAccounts`. */
  | { kind: "signed-in"; serviceAccounts?: boolean }
  /**
   * The handler calls `ctx.authorize` itself, because the target depends on the request body.
   * `says` is what the reference prints: what is decided, and by what.
   */
  | { kind: "custom"; says: string }
  /** Called by a worker with a worker credential, under the worker protocol. */
  | { kind: "worker" }
  /** Called by the instance's worker host with WORKER_HOST_TOKEN, to be given leases. */
  | { kind: "worker-host" }
  /** Called by an identity provider with a token made for it, under SCIM. */
  | { kind: "scim" }
  | {
      kind: "permission";
      permission: string;
      scope: Scope;
      /**
       * Also answered, with no more than the shell needs to draw, to someone whose only grants
       * are on resources inside (`boundInside`). The handler trims its answer by `ctx.insideOnly`.
       */
      inside?: boolean;
    };

export const access = {
  public: { kind: "public" } as Access,
  signedIn: { kind: "signed-in" } as Access,
  /** For a route that is not about a person, such as a batch of calls that are each checked alone. */
  signedInOrKey: { kind: "signed-in", serviceAccounts: true } as Access,
  /** A public route that asks for something, such as the token that is in its address. */
  publicWith: (says: string): Access => ({ kind: "public", says }),
  custom: (says: string): Access => ({ kind: "custom", says }),
  worker: { kind: "worker" } as Access,
  workerHost: { kind: "worker-host" } as Access,
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

/** Lets someone who holds a grant on one resource inside reach a route, for the shell alone. */
export const reachedFromInside = (declared: Access): Access =>
  declared.kind === "permission" ? { ...declared, inside: true } : declared;

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
    /**
     * The route keeps a person's own preference, such as where they were last.
     * It writes without an audit entry, so only the routes in
     * `PREFERENCE_ROUTES` may say so.
     */
    preference?: true;
    /**
     * `false`: the route is polled by machines (a probe, a scrape) and is not a trace. A route
     * names itself; the request hook does not guess from the end of a name.
     */
    traced?: false;
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
  /** Set when the route was reached by a grant on one resource inside, not by its own permission. */
  insideOnly = false;
  /** Set when the request named a resource by a path it no longer has. The answer says so. */
  moved: AliasUse | undefined;
  readonly #request: FastifyRequest;
  /**
   * What this request has read to decide on a place, kept only by a request that changes
   * nothing. A summary asked a dozen permissions at one workspace and read the same two
   * things a dozen times: fifty statements for one screen (STR-04 of phase 35).
   */
  readonly #standing: StandingMemo | undefined;
  /** The grants and tenants this request has already written an `operator.access` entry for. */
  readonly #noted = new Set<string>();

  constructor(kernel: Kernel, principal: Principal, request: FastifyRequest) {
    this.kernel = kernel;
    this.principal = principal;
    this.#request = request;
    this.#standing = request.method === "GET" || request.method === "HEAD" ? new Map() : undefined;
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
      throw forbiddenBecause("This is only for a member signed in to the workspace.");
    }
    return this.principal.id;
  }

  async allowed(permission: string, target: Target): Promise<boolean> {
    const decision = await check(this.db, this.principal, permission, target, this.#standing);
    await this.#noteOperatorAccess(decision, permission, target);
    return decision.allowed;
  }

  /**
   * `allowed` for many places, one permission, in a bounded number of statements: for a list
   * that says per row what the caller may do. The answers are `allowed`'s, place by place.
   */
  async allowedMany(permission: string, targets: readonly Target[]): Promise<boolean[]> {
    const decisions = await checkMany(this.db, this.principal, permission, targets);
    for (const [index, decision] of decisions.entries()) {
      await this.#noteOperatorAccess(decision, permission, targets[index] as Target);
    }
    return decisions.map((one) => one.allowed);
  }

  /**
   * The single authorization check. Throws 404 when the caller has no standing
   * in the tenant, so tenant IDs cannot be probed, and 403 or 401 otherwise.
   */
  async authorize(permission: string, target: Target): Promise<void> {
    const decision = await check(this.db, this.principal, permission, target, this.#standing);
    if (!decision.allowed) {
      if (this.principal.type === "anonymous") throw unauthenticated();
      if (!decision.related) throw notFound("The tenant");
      throw forbidden(permission);
    }
    await this.#noteOperatorAccess(decision, permission, target);
  }

  /**
   * Everything an operator does inside a tenant is recorded, reads included: once for each
   * tenant a request reaches, whichever of `authorize`, `allowed` or `allowedMany` let them in
   * (a list that decides row by row writes one entry, not one for each row).
   */
  async #noteOperatorAccess(decision: Decision, permission: string, target: Target) {
    if (!decision.allowed || !decision.accessGrantId) return;
    const tenantId = target.tenantId ?? null;
    const key = `${decision.accessGrantId}:${tenantId}`;
    if (this.#noted.has(key)) return;
    this.#noted.add(key);
    this.actor.accessGrantId = decision.accessGrantId;
    await writeAudit(this.db, this.actor, {
      action: "operator.access",
      targetType: "request",
      targetId: `${this.#request.method} ${this.#request.routeOptions.url}`,
      tenantId,
      workspaceId: target.workspaceId ?? null,
      details: { permission },
    });
  }

  /**
   * Keeps one of the caller's own preferences, without an audit entry. Only a
   * route in `PREFERENCE_ROUTES` may call it.
   */
  async keepPreference<T>(change: (db: Kernel["db"]) => Promise<T>): Promise<T> {
    if (!this.#request.routeOptions.config.preference) {
      throw new Error(
        `${this.#request.method} ${this.#request.routeOptions.url} is not a preference route.`,
      );
    }
    this.mutated = true;
    return change(this.db);
  }

  /** Runs a change through the one write path. */
  mutate<T>(change: (trx: Trx, audit: Audit) => Promise<T>): Promise<T> {
    this.mutated = true;
    return mutate(this.db, this.actor, change);
  }
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The only routes that write without an audit entry. Each keeps a member's own
 * preference, which changes nothing anyone else can see or do; auditing them
 * buried real changes under every move between workspaces.
 */
export const PREFERENCE_ROUTES: ReadonlySet<string> = new Set([
  "PUT /api/v1/me/recent",
  "PUT /api/v1/me/recent-items",
  "PUT /api/v1/me/preferences/:key",
  "DELETE /api/v1/me/preferences/:key",
  "POST /api/v1/me/views",
  "PATCH /api/v1/me/views/:id",
  "DELETE /api/v1/me/views/:id",
]);

/** Installs the hooks that resolve the caller and enforce each route's declared access. */
export function installAccessControl(app: FastifyInstance, kernel: Kernel) {
  app.decorateRequest("ctx", null as unknown as RequestContext);
  app.decorateRequest("worker", null as unknown as WorkerScope);
  app.decorateRequest("scim", null as unknown as ScimCaller);

  // A route that writes without auditing must be one of the few that may.
  app.addHook("onRoute", (route) => {
    if (!route.config?.preference) return;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (!PREFERENCE_ROUTES.has(`${method} ${route.url}`)) {
        throw new Error(`${method} ${route.url} may not write without an audit entry.`);
      }
    }
  });

  app.addHook("preHandler", async (request) => {
    const declared = request.routeOptions.config.access;
    if (!declared) {
      throw new Error(`Route ${request.routeOptions.url} declares no access rule.`);
    }
    if (declared.kind === "worker") {
      request.worker = await resolveWorker(kernel, request);
      return;
    }
    if (declared.kind === "worker-host") {
      checkWorkerHost(kernel, request);
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
        throw forbiddenBecause("This is only for a member signed in to the workspace.");
      }
      if (principal.type === "service_account" && !declared.serviceAccounts) {
        throw forbiddenBecause(
          "This is only for a person signed in, not for a service account's key.",
        );
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
    const target = {
      tenantId,
      workspaceId: declared.scope === "workspace" ? params.w : undefined,
      orInstance: declared.scope === "tenant-or-instance",
    };
    // A grant on one flow lets its holder reach the flow's workspace and tenant to draw the page,
    // by the same match `check` uses, and nothing the route would read beyond that.
    if (
      declared.inside &&
      !(await check(kernel.db, principal, declared.permission, target)).allowed &&
      (await boundInside(kernel.db, principal, tenantId, target.workspaceId))
    ) {
      ctx.insideOnly = true;
    } else {
      await ctx.authorize(declared.permission, target);
    }
    if (declared.scope === "workspace") {
      ctx.workspace = await findWorkspace(kernel, tenantId, params.w as string);
    }
  });

  // An answer reached through the path a resource used to have says so, and until when.
  app.addHook("onSend", async (request, reply) => {
    if (request.ctx?.moved) reply.headers(aliasHeaders(request.ctx.moved));
  });

  // A change that did not go through the write path has no audit entry. Refuse to report success.
  app.addHook("onSend", async (request, reply) => {
    const declared = request.routeOptions.config.access;
    if (
      declared &&
      declared.kind !== "public" &&
      declared.kind !== "worker" &&
      declared.kind !== "worker-host" &&
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

/**
 * The worker host presents the instance's WORKER_HOST_TOKEN. Without host mode
 * these routes do not exist, as far as a caller can tell.
 */
function checkWorkerHost(kernel: Kernel, request: FastifyRequest) {
  const expected = kernel.config.workerHostToken;
  if (kernel.config.managedWorkers !== "host" || !expected) throw notFound("This route");
  const given = /^Bearer (.+)$/.exec(request.headers.authorization ?? "")?.[1] ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(given), digest(expected))) {
    throw unauthenticated("Send the instance's worker host token.");
  }
}
