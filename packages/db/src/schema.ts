import type { ColumnType, Generated } from "kysely";

/** Where a tenant's data lives. Every data access resolves through this. */
export type DataLocation = { kind: "shared" } | { kind: "dedicated"; ref: string };

export interface PlatformMigrationTable {
  version: number;
  name: string;
  checksum: string;
  applied_at: Generated<Date>;
}

export interface TenantTable {
  id: string;
  slug: string;
  data_location: ColumnType<DataLocation, string | undefined, string>;
  created_at: Generated<Date>;
}

/** Tables shared by every tenant in the platform database. */
export interface PlatformSchema {
  platform_migration: PlatformMigrationTable;
  tenant: TenantTable;
}
