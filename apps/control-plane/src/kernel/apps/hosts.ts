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
  /** Read each time, so an operator's change of setting is seen at once. */
  readonly #config: Pick<Config, "appsOnConsoleAddress">;
  readonly #domains = new Map<string, { domain: AppDomain | null; at: number }>();

  constructor(db: Db, config: Pick<Config, "publicUrl" | "appsUrl" | "appsOnConsoleAddress">) {
    this.#db = db;
    this.#main = new URL(config.publicUrl);
    this.#apps = config.appsUrl ? new URL(config.appsUrl) : undefined;
    this.#config = config;
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

  /**
   * Whether an app written as code can run, now or once one is deployed, at the address a
   * request arrived at. ONE answer, used both to decide serving and to decide what an app's
   * sign-in may do, so that the two cannot drift:
   *
   * - `apps`, the shared apps address: every tenant's code apps. Yes.
   * - `domain`, a tenant's hostname: that tenant's code apps. Yes, whether or not one is
   *   deployed yet (a deploy later changes nothing, and nothing has to be asked of the database).
   * - `main`, the instance's own address (and any name it is reached by that is not registered):
   *   none, except when the operator knowingly set `APPS_ON_CONSOLE_ADDRESS` and there is no
   *   second address.
   *
   * Anything it is not sure of is a yes.
   */
  runsCodeApps(place: Place): boolean {
    if (place.kind === "main") return this.#apps === undefined && this.#config.appsOnConsoleAddress;
    return true;
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
