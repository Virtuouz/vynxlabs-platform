import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

export interface ExternalPostgres {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string | undefined;
  /** Connect over TLS and check the server's certificate. */
  ssl?: boolean | undefined;
}

/**
 * Opens a small pool to a database that is not the platform's own: an
 * external data source a workspace has bound. Statements are cut off after
 * fifteen seconds, and a server that does not answer in five is given up on.
 */
// biome-ignore lint/suspicious/noExplicitAny: an external database has no schema known in advance
export function openExternalPostgres(config: ExternalPostgres): Kysely<any> {
  const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: true } : false,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    options: "-c statement_timeout=15000",
    application_name: "vynxlabs-platform",
  });
  // An idle connection the source closes must not take the control plane down.
  pool.on("error", () => {});
  return new Kysely({ dialect: new PostgresDialect({ pool }) });
}
