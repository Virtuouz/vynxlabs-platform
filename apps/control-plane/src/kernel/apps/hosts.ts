import type { FastifyRequest } from "fastify";
import type { Config } from "../../config.js";
import type { Db } from "../audit.js";

export interface AppDomain {
  id: string;
  tenantId: string;
  workspaceId: string;
  /** Empty for a hostname that serves the portal and every app of the workspace. */
  appPath: string;
  hostname: string;
}

/**
 * Which of the instance's addresses a request arrived at. It decides what the
 * request may reach:
 *
 * - `main`, the instance's own address: the console, the API and, unless a second
 *   address is configured for them, apps by path.
 * - `apps`, the second address: apps by path and the API. No console, and a
 *   member's console sign-in is not accepted here.
 * - `domain`, a hostname a tenant registered for one app: that app at the root,
 *   and the API for that tenant only. Registered with an empty app path, the
 *   hostname serves the portal at the root and every app of its workspace by path.
 */
export type Place = { kind: "main" } | { kind: "apps" } | { kind: "domain"; domain: AppDomain };

/** How long a hostname's answer is remembered. A change takes effect within this time everywhere. */
const REMEMBER_MS = 30_000;

/** The hostname without its port, lower case. */
export function hostnameOf(host: string): string {
  const lower = host.trim().toLowerCase();
  if (lower.startsWith("[")) return lower.slice(0, lower.indexOf("]") + 1);
  return lower.split(":")[0] as string;
}

export class Hosts {
  readonly #db: Db;
  readonly #main: URL;
  readonly #apps: URL | undefined;
  readonly #domains = new Map<string, { domain: AppDomain | null; at: number }>();

  constructor(db: Db, config: Pick<Config, "publicUrl" | "appsUrl">) {
    this.#db = db;
    this.#main = new URL(config.publicUrl);
    this.#apps = config.appsUrl ? new URL(config.appsUrl) : undefined;
  }

  /** The address apps are served at by path: the second address when there is one. */
  get appsOrigin(): string {
    return (this.#apps ?? this.#main).origin;
  }

  get mainOrigin(): string {
    return this.#main.origin;
  }

  get hasAppsAddress(): boolean {
    return this.#apps !== undefined;
  }

  /** Whether a hostname is one of the instance's own, which no tenant may register. */
  isOwn(hostname: string): boolean {
    return hostname === this.#main.hostname || hostname === this.#apps?.hostname;
  }

  async place(request: FastifyRequest): Promise<Place> {
    const host = request.host.toLowerCase();
    if (this.#apps && host === this.#apps.host) return { kind: "apps" };
    if (host === this.#main.host) return { kind: "main" };
    const domain = await this.domain(hostnameOf(host));
    // Any other name is the instance by another name: an IP address, or a proxy's own.
    return domain ? { kind: "domain", domain } : { kind: "main" };
  }

  /** The enabled registration of a hostname, or null. */
  async domain(hostname: string): Promise<AppDomain | null> {
    const known = this.#domains.get(hostname);
    if (known && Date.now() - known.at < REMEMBER_MS) return known.domain;
    const row = await this.#db
      .selectFrom("app_domain")
      .select(["id", "tenant_id", "workspace_id", "app_path", "hostname"])
      .where("hostname", "=", hostname)
      .where("enabled", "=", true)
      .executeTakeFirst();
    const domain = row
      ? {
          id: row.id,
          tenantId: row.tenant_id,
          workspaceId: row.workspace_id,
          appPath: row.app_path,
          hostname: row.hostname,
        }
      : null;
    this.#domains.set(hostname, { domain, at: Date.now() });
    if (this.#domains.size > 2000)
      this.#domains.delete(this.#domains.keys().next().value as string);
    return domain;
  }

  /** Call after a registration changes, so this process answers afresh at once. */
  forget(hostname: string): void {
    this.#domains.delete(hostname);
  }

  /** The origin a request arrived at, as a browser names it. */
  originOf(request: FastifyRequest): string {
    return `${request.protocol}://${request.host}`;
  }
}
