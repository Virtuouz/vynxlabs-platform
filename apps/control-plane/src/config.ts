import { isIP } from "node:net";
import type { ConfigVarName } from "./config-vars.js";
import { type EgressAllow, parseEgressAllow } from "./kernel/egress.js";
import { readHeaders, type TelemetryConfig } from "./kernel/telemetry.js";
export interface Config {
  databaseUrl: string;
  s3: {
    endpoint: string | undefined;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
  host: string;
  port: number;
  logLevel: LogLevel;
  /** The URL people use to reach the instance. No trailing slash. */
  publicUrl: string;
  authSecret: string;
  /** 32 bytes. Wraps each tenant's data key. */
  masterKey: Buffer;
  /**
   * A second key the instance opens with, and never seals with: the next key
   * before a rotation, the old one during it. See "Rotating the master key".
   */
  masterKeySecondary: Buffer | undefined;
  /** Creates the first operator admin when the instance has no members. */
  bootstrapAdmin: { email: string; password: string } | undefined;
  /**
   * Whether the instance starts workers itself, one per tenant with work, and where:
   * `host`, in a worker host container on a network of its own, which asks for leases;
   * `process`, beside the control plane, only for tenants whose code only the operator
   * writes (decision 0001); or not at all.
   */
  managedWorkers: "host" | "process" | false;
  /** What a worker host presents to ask for leases. Set in `host` mode. */
  workerHostToken: string | undefined;
  /** Whether metrics carry tenant and workspace labels. Off for an instance with very many. */
  metricsWorkspaceLabels: boolean;
  /** What a scraper presents to read the metrics, so that it needs no member. */
  metricsToken: string | undefined;
  /** Where traces and metrics are sent by OTLP, when anywhere. */
  telemetry: TelemetryConfig;
  /**
   * The user managed workers run as: their own, so that a script cannot read the
   * control plane's environment, or `same`, the control plane's, by the operator's choice.
   */
  managedWorkerUser: { uid: number; gid: number } | "same";
  /** How many days each kind of history is kept, unless a tenant says otherwise. */
  retention: RetentionDays;
  /** Internal networks and hosts the instance may reach for a tenant despite the egress guard. */
  egressAllow: EgressAllow;
  /**
   * Which peers' forwarding headers are believed: a number of proxies in front of the
   * instance (0 trusts none), or the networks they are on. Everything the instance
   * learns about a caller's address, for limits and the audit log, comes from this.
   */
  trustedProxies: number | string[];
  /** Whether the sign-in library counts attempts by address. Off only in tests. */
  authLimits: boolean;
  /** Directory holding the built console. Undefined when the console is not served. */
  consoleDir: string | undefined;
  /** Where the documentation is on the web, when the operator says. */
  docsUrl?: string | undefined;
  /** Where the built app that draws interfaces is. Without it, generated apps are not served. */
  screensDir: string | undefined;
  /**
   * A second address for apps. When set, apps are served there and not on the
   * instance's own address, so that an app never runs where the console's sign-in is.
   */
  appsUrl: string | undefined;
  /**
   * Serves apps written as code at the console's own address when there is no
   * APPS_URL. Off by default: an app's code would then run where the console's
   * sign-in is (decision 0001). Interfaces built in the console are served either way.
   */
  appsOnConsoleAddress: boolean;
  /** Where mail goes out, for invitations and password resets. Undefined when no mail is sent. */
  mail: { url: string; from: string } | undefined;
  /**
   * For development only: each message is written to a file here instead of
   * being sent. Never in production.
   */
  mailCaptureDir: string | undefined;
  /** What the instance takes on at once, so that load makes work wait rather than fail. */
  limits: Limits;
}

export interface Limits {
  /**
   * Scripts running at once on this machine, across the managed workers the
   * control plane starts beside itself. Undefined: worked out from its memory.
   */
  runSlots: number | undefined;
  /** Free memory, in MB, below which no managed worker here takes more work. */
  runMemoryFloorMb: number | undefined;
  /** Managed workers alive at once beside the control plane. Undefined: twice the run slots. */
  managedWorkersMax: number | undefined;
  /** Connections to Volvel's own database for the platform's own work. */
  databasePoolSize: number;
  /** Connections for every tenant's row requests on the platform database. */
  dataPoolSize: number;
  /**
   * Row requests one tenant may have open at once on the platform database, so a
   * few slow ones cannot hold every connection. Undefined: a third of the pool, at least 2.
   */
  dataTenantConnections: number | undefined;
  /** How long one data operation may take before it is stopped, in milliseconds. */
  dataStatementTimeoutMs: number;
  /** How long one query written in SQL may run before it is stopped. */
  sqlStatementTimeoutMs: number;
  /**
   * Starts with every trigger in every tenant paused, whatever the console says: the
   * operator's emergency stop, for an instance that cannot stay up long enough to pause them.
   */
  triggersPaused: boolean;
  /** Queued runs in a workspace past which its schedules skip their times. 0: no limit. */
  scheduleBacklogLimit: number;
  /** Tenant exports written at once on this instance. */
  exportsAtOnce: number;
  /** Tenant exports written at once for one tenant. */
  exportsPerTenant: number;
  /** Seconds an export's reader may take nothing before the export is ended. */
  exportStallSeconds: number;
  /** Minutes one export may take, however it is read. 0: no limit. */
  exportMaxMinutes: number;
}

export const MIN_PASSWORD_LENGTH = 12;

/** How long a member's console session lasts from sign-in. SECURITY.md says so (D51). */
export const CONSOLE_SESSION_DAYS = 7;

export interface RetentionDays {
  /** Script runs and flow runs, with their logs, steps and stored payloads, after they end. */
  runsDays: number;
  eventsDays: number;
  /** Refused webhook requests and SCIM pushes. */
  refusalsDays: number;
  auditDays: number;
}

/** The shortest and longest each kind may be kept, by an instance or a tenant. */
export const RETENTION_BOUNDS = {
  runsDays: { min: 1, max: 3650 },
  eventsDays: { min: 1, max: 3650 },
  refusalsDays: { min: 1, max: 3650 },
  auditDays: { min: 90, max: 3650 },
} as const;

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  ${problem}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/** Reads configuration from environment variables. Reports every problem at once. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const problems: string[] = [];
  const value = (name: ConfigVarName) => {
    const raw = env[name]?.trim();
    return raw === "" ? undefined : raw;
  };
  const required = (name: ConfigVarName) => {
    const raw = value(name);
    if (raw === undefined) problems.push(`${name} is required.`);
    return raw ?? "";
  };
  const url = (name: ConfigVarName, raw: string | undefined, protocols: string[]) => {
    if (raw === undefined) return;
    const parsed = URL.canParse(raw) ? new URL(raw) : null;
    if (!parsed || !protocols.includes(parsed.protocol)) {
      problems.push(`${name} must be a URL starting with ${protocols.join(" or ")}//.`);
    }
  };

  const databaseUrl = required("DATABASE_URL");
  url("DATABASE_URL", value("DATABASE_URL"), ["postgres:", "postgresql:"]);

  const endpoint = value("S3_ENDPOINT");
  url("S3_ENDPOINT", endpoint, ["http:", "https:"]);

  const pathStyle = value("S3_FORCE_PATH_STYLE") ?? "true";
  if (pathStyle !== "true" && pathStyle !== "false") {
    problems.push("S3_FORCE_PATH_STYLE must be true or false.");
  }

  const portText = value("PORT") ?? "8080";
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || port < 1 || port > 65535) {
    problems.push("PORT must be a number from 1 to 65535.");
  }

  const logLevel = value("LOG_LEVEL") ?? "info";
  if (!LOG_LEVELS.includes(logLevel as LogLevel)) {
    problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}.`);
  }

  const publicUrl = required("PUBLIC_URL");
  url("PUBLIC_URL", value("PUBLIC_URL"), ["http:", "https:"]);

  const authSecret = required("AUTH_SECRET");
  if (authSecret !== "" && authSecret.length < 32) {
    problems.push("AUTH_SECRET must be at least 32 characters.");
  }

  const masterKey = Buffer.from(required("MASTER_KEY"), "base64");
  if (value("MASTER_KEY") !== undefined && masterKey.length !== 32) {
    problems.push(
      "MASTER_KEY must be 32 bytes, base64 encoded. Generate one with: openssl rand -base64 32",
    );
  }

  const secondaryText = value("MASTER_KEY_SECONDARY");
  const masterKeySecondary =
    secondaryText === undefined ? undefined : Buffer.from(secondaryText, "base64");
  if (masterKeySecondary && masterKeySecondary.length !== 32) {
    problems.push("MASTER_KEY_SECONDARY must be 32 bytes, base64 encoded, as MASTER_KEY is.");
  } else if (masterKeySecondary?.equals(masterKey)) {
    problems.push(
      "MASTER_KEY_SECONDARY is the same as MASTER_KEY. Remove it, or set it to the other key of the rotation.",
    );
  }

  const bootstrapEmail = value("BOOTSTRAP_ADMIN_EMAIL");
  const bootstrapPassword = value("BOOTSTRAP_ADMIN_PASSWORD");
  if ((bootstrapEmail === undefined) !== (bootstrapPassword === undefined)) {
    problems.push("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together.");
  }
  if (bootstrapPassword !== undefined && bootstrapPassword.length < MIN_PASSWORD_LENGTH) {
    problems.push(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const appsUrl = value("APPS_URL");
  url("APPS_URL", appsUrl, ["http:", "https:"]);
  if (
    appsUrl !== undefined &&
    URL.canParse(appsUrl) &&
    URL.canParse(publicUrl) &&
    new URL(appsUrl).host === new URL(publicUrl).host
  ) {
    problems.push("APPS_URL must be a different host from PUBLIC_URL.");
  }
  const appsOnConsole = value("APPS_ON_CONSOLE_ADDRESS") ?? "false";
  if (appsOnConsole !== "true" && appsOnConsole !== "false") {
    problems.push("APPS_ON_CONSOLE_ADDRESS must be true or false.");
  }

  const smtpUrl = value("SMTP_URL");
  url("SMTP_URL", smtpUrl, ["smtp:", "smtps:"]);
  const mailFrom = value("MAIL_FROM");
  if ((smtpUrl === undefined) !== (mailFrom === undefined)) {
    problems.push("SMTP_URL and MAIL_FROM must be set together.");
  }
  // For development and tests: the instance says so loudly when it starts.
  const mailCaptureDir = value("MAIL_CAPTURE_DIR");

  // `true` is read as `process`, as it was before there was a worker host.
  const managedRaw = value("MANAGED_WORKERS") ?? "process";
  const managed = managedRaw === "true" ? "process" : managedRaw;
  if (managed !== "host" && managed !== "process" && managed !== "false") {
    problems.push("MANAGED_WORKERS must be host, process or false.");
  }
  const workerHostToken = value("WORKER_HOST_TOKEN");
  const metricsLabels = value("METRICS_WORKSPACE_LABELS") ?? "true";
  if (metricsLabels !== "true" && metricsLabels !== "false") {
    problems.push("METRICS_WORKSPACE_LABELS must be true or false.");
  }
  const metricsToken = value("METRICS_TOKEN");
  if (metricsToken !== undefined && metricsToken.length < 32) {
    problems.push("METRICS_TOKEN must be at least 32 characters.");
  }
  // The names OpenTelemetry gives its own settings, so what an operator already has works.
  const otlpEndpoint = value("OTEL_EXPORTER_OTLP_ENDPOINT")?.replace(/\/+$/, "");
  if (otlpEndpoint !== undefined && !/^https?:\/\//.test(otlpEndpoint)) {
    problems.push("OTEL_EXPORTER_OTLP_ENDPOINT must be an http or https address.");
  }
  const otlpProtocol = value("OTEL_EXPORTER_OTLP_PROTOCOL") ?? "http/json";
  if (otlpEndpoint !== undefined && otlpProtocol !== "http/json") {
    problems.push("OTEL_EXPORTER_OTLP_PROTOCOL must be http/json: the only one Volvel speaks.");
  }
  let otlpHeaders: Record<string, string> = {};
  try {
    otlpHeaders = readHeaders(value("OTEL_EXPORTER_OTLP_HEADERS"));
  } catch {
    problems.push(
      "OTEL_EXPORTER_OTLP_HEADERS must be pairs like name=value, with a value percent-encoded (write a literal % as %25).",
    );
  }
  const otlpInterval = Number(value("OTEL_METRIC_EXPORT_INTERVAL") ?? "60000");
  if (!Number.isFinite(otlpInterval) || otlpInterval < 1000) {
    problems.push("OTEL_METRIC_EXPORT_INTERVAL must be a number of milliseconds, 1000 or more.");
  }
  if (managed === "host" && (workerHostToken === undefined || workerHostToken.length < 32)) {
    problems.push("MANAGED_WORKERS=host needs WORKER_HOST_TOKEN, of at least 32 characters.");
  }
  const workerUser = value("MANAGED_WORKER_USER") ?? "own";
  if (workerUser !== "own" && workerUser !== "same") {
    problems.push("MANAGED_WORKER_USER must be own or same.");
  }
  const id = (name: ConfigVarName) => {
    const raw = value(name) ?? "10001";
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      problems.push(`${name} must be a positive whole number.`);
    }
    return parsed;
  };
  const days = (name: ConfigVarName, fallback: number, bounds: { min: number; max: number }) => {
    const raw = value(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
      problems.push(`${name} must be a whole number of days from ${bounds.min} to ${bounds.max}.`);
    }
    return parsed;
  };
  const retention = {
    runsDays: days("RETENTION_RUNS_DAYS", 30, RETENTION_BOUNDS.runsDays),
    eventsDays: days("RETENTION_EVENTS_DAYS", 30, RETENTION_BOUNDS.eventsDays),
    refusalsDays: days("RETENTION_REFUSALS_DAYS", 7, RETENTION_BOUNDS.refusalsDays),
    auditDays: days("RETENTION_AUDIT_DAYS", 400, RETENTION_BOUNDS.auditDays),
  };
  const egress = parseEgressAllow(value("EGRESS_ALLOW"));
  if (typeof egress === "string") problems.push(egress);
  const proxies = parseTrustedProxies(value("TRUSTED_PROXIES"));
  if (typeof proxies === "string") problems.push(proxies);
  const whole = (name: ConfigVarName, min: number, max: number) => {
    const raw = value(name);
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      problems.push(`${name} must be a whole number from ${min} to ${max}.`);
      return undefined;
    }
    return parsed;
  };
  // Read by the worker host and its firewall rules, which share the environment: said here
  // too, so that a wrong value is found when the instance starts and not when a worker does.
  whole("MANAGED_WORKER_USERS", 1, 60_000);
  const limits: Limits = {
    runSlots: whole("RUN_SLOTS", 1, 1000),
    runMemoryFloorMb: whole("RUN_MEMORY_FLOOR_MB", 0, 1_000_000),
    managedWorkersMax: whole("MANAGED_WORKERS_MAX", 1, 1000),
    databasePoolSize: whole("DATABASE_POOL_SIZE", 2, 500) ?? 10,
    dataPoolSize: whole("DATA_POOL_SIZE", 2, 500) ?? 10,
    dataTenantConnections: whole("DATA_TENANT_CONNECTIONS", 1, 500),
    dataStatementTimeoutMs: whole("DATA_STATEMENT_TIMEOUT_MS", 1000, 600_000) ?? 15_000,
    sqlStatementTimeoutMs: whole("SQL_STATEMENT_TIMEOUT_MS", 1000, 600_000) ?? 15_000,
    triggersPaused: (value("TRIGGERS_PAUSED") ?? "false") === "true",
    scheduleBacklogLimit: whole("SCHEDULE_BACKLOG_LIMIT", 0, 1_000_000) ?? 200,
    exportsAtOnce: whole("EXPORTS_AT_ONCE", 1, 100) ?? 3,
    exportsPerTenant: whole("EXPORTS_PER_TENANT", 1, 100) ?? 1,
    exportStallSeconds: whole("EXPORT_STALL_SECONDS", 1, 86_400) ?? 60,
    exportMaxMinutes: whole("EXPORT_MAX_MINUTES", 0, 10_080) ?? 30,
  };
  const docsUrl = value("DOCS_URL");
  url("DOCS_URL", docsUrl, ["http:", "https:"]);
  const pausedRaw = value("TRIGGERS_PAUSED");
  if (pausedRaw !== undefined && pausedRaw !== "true" && pausedRaw !== "false") {
    problems.push("TRIGGERS_PAUSED must be true or false.");
  }
  const workerUid = id("MANAGED_WORKER_UID");
  const workerGid = id("MANAGED_WORKER_GID");

  const config: Config = {
    databaseUrl,
    s3: {
      endpoint,
      region: value("S3_REGION") ?? "us-east-1",
      bucket: required("S3_BUCKET"),
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      forcePathStyle: pathStyle === "true",
    },
    host: value("HOST") ?? "0.0.0.0",
    port,
    logLevel: logLevel as LogLevel,
    publicUrl: publicUrl.replace(/\/+$/, ""),
    authSecret,
    masterKey,
    masterKeySecondary,
    bootstrapAdmin:
      bootstrapEmail !== undefined && bootstrapPassword !== undefined
        ? { email: bootstrapEmail.toLowerCase(), password: bootstrapPassword }
        : undefined,
    managedWorkers: managed === "host" || managed === "process" ? managed : false,
    workerHostToken: managed === "host" ? workerHostToken : undefined,
    metricsWorkspaceLabels: metricsLabels === "true",
    metricsToken,
    telemetry: {
      endpoint: otlpEndpoint,
      headers: otlpHeaders,
      serviceName: value("OTEL_SERVICE_NAME") ?? "volvel",
      traces: value("OTEL_TRACES_EXPORTER") !== "none",
      metrics: value("OTEL_METRICS_EXPORTER") !== "none",
      metricsIntervalMs: otlpInterval,
    },
    managedWorkerUser: workerUser === "same" ? "same" : { uid: workerUid, gid: workerGid },
    retention,
    egressAllow: typeof egress === "string" ? { networks: [], hosts: [] } : egress,
    trustedProxies: typeof proxies === "string" ? 1 : proxies,
    authLimits: true,
    consoleDir: value("CONSOLE_DIR"),
    docsUrl: docsUrl?.replace(/\/+$/, ""),
    screensDir: value("SCREENS_DIR"),
    appsUrl: appsUrl?.replace(/\/+$/, ""),
    appsOnConsoleAddress: appsOnConsole === "true",
    mailCaptureDir,
    mail:
      smtpUrl !== undefined && mailFrom !== undefined
        ? { url: smtpUrl, from: mailFrom }
        : undefined,
    limits,
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}

/**
 * Reads `TRUSTED_PROXIES`: a whole number of proxies in front of the instance, or the
 * networks they are on, with commas. Without it one proxy is trusted, which is what a
 * reverse proxy that adds the caller's address to the header needs.
 */
export function parseTrustedProxies(value: string | undefined): number | string[] | string {
  const text = (value ?? "").trim();
  if (text === "") return 1;
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    if (hops > 10)
      return "TRUSTED_PROXIES must be a number of proxies from 0 to 10, or a list of networks.";
    return hops;
  }
  const networks: string[] = [];
  for (const raw of text.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const [address, bits] = entry.split("/") as [string, string | undefined];
    const family = isIP(address);
    const prefix = bits === undefined ? undefined : Number(bits);
    if (
      family === 0 ||
      (prefix !== undefined && (!/^\d+$/.test(bits ?? "") || prefix > (family === 6 ? 128 : 32)))
    ) {
      return `TRUSTED_PROXIES has an entry that is not a network: ${entry}.`;
    }
    networks.push(entry);
  }
  return networks;
}
