import type { Kysely } from "kysely";
import { TenantNotFoundError } from "./errors.js";
import { isId } from "./id.js";
import type { DataLocation, PlatformSchema } from "./schema.js";

/**
 * Database access for one tenant's platform records, and where its custom
 * tables live. Platform records are always in the platform database. Custom
 * tables are in the database `location` names, opened as a `DataStore`.
 */
export interface TenantHandle {
  readonly tenantId: string;
  readonly location: DataLocation;
  readonly db: Kysely<PlatformSchema>;
}

/**
 * The tenant routing layer. All data access goes through it: instance-level
 * tables through `platform()`, everything belonging to a tenant through
 * `forTenant()`.
 */
export class TenantRouter {
  readonly #platform: Kysely<PlatformSchema>;

  constructor(platform: Kysely<PlatformSchema>) {
    this.#platform = platform;
  }

  /** Instance-level tables: migrations and the tenant records themselves. */
  platform(): Kysely<PlatformSchema> {
    return this.#platform;
  }

  async forTenant(tenantId: string): Promise<TenantHandle> {
    if (!isId(tenantId)) {
      throw new TenantNotFoundError(tenantId);
    }
    const tenant = await this.#platform
      .selectFrom("tenant")
      .select("data_location")
      .where("id", "=", tenantId)
      .executeTakeFirst();
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }
    return { tenantId, location: tenant.data_location, db: this.#platform };
  }
}
