export class DatabaseNewerThanCodeError extends Error {
  constructor(databaseVersion: number, codeVersion: number) {
    super(
      `The database is at migration ${databaseVersion} but this build only knows migrations up to ${codeVersion}. ` +
        "Run a newer image against this database.",
    );
    this.name = "DatabaseNewerThanCodeError";
  }
}

export class MigrationChecksumError extends Error {
  constructor(version: number, name: string) {
    super(
      `Migration ${version} (${name}) was applied with different contents than the file in this build. ` +
        "A shipped migration must never be edited.",
    );
    this.name = "MigrationChecksumError";
  }
}

export class MigrationFilesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationFilesError";
  }
}

export class MigrationFailedError extends Error {
  constructor(version: number, name: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Migration ${version} (${name}) failed and was rolled back: ${reason}`, { cause });
    this.name = "MigrationFailedError";
  }
}

export class TenantNotFoundError extends Error {
  readonly tenantId: string;
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} does not exist.`);
    this.name = "TenantNotFoundError";
    this.tenantId = tenantId;
  }
}

export class DedicatedLocationNotSupportedError extends Error {
  readonly tenantId: string;
  constructor(tenantId: string) {
    super(
      `Tenant ${tenantId} has a dedicated data location, which this version does not support yet.`,
    );
    this.name = "DedicatedLocationNotSupportedError";
    this.tenantId = tenantId;
  }
}
