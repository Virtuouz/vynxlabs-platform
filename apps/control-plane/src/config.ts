import { type EgressAllow, parseEgressAllow } from "./kernel/egress.js";
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
  /**
   * The user managed workers run as: their own, so that a script cannot read the
   * control plane's environment, or `same`, the control plane's, by the operator's choice.
   */
  managedWorkerUser: { uid: number; gid: number } | "same";
  /** How many days each kind of history is kept, unless a tenant says otherwise. */
  retention: RetentionDays;
  /** Internal networks and hosts the instance may reach for a tenant despite the egress guard. */
  egressAllow: EgressAllow;
  /** Directory holding the built console. Undefined when the console is not served. */
  consoleDir: string | undefined;
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
}

export const MIN_PASSWORD_LENGTH = 12;

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
  const value = (name: string) => {
    const raw = env[name]?.trim();
    return raw === "" ? undefined : raw;
  };
  const required = (name: string) => {
    const raw = value(name);
    if (raw === undefined) problems.push(`${name} is required.`);
    return raw ?? "";
  };
  const url = (name: string, raw: string | undefined, protocols: string[]) => {
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
  if (managed === "host" && (workerHostToken === undefined || workerHostToken.length < 32)) {
    problems.push("MANAGED_WORKERS=host needs WORKER_HOST_TOKEN, of at least 32 characters.");
  }
  const workerUser = value("MANAGED_WORKER_USER") ?? "own";
  if (workerUser !== "own" && workerUser !== "same") {
    problems.push("MANAGED_WORKER_USER must be own or same.");
  }
  const id = (name: string) => {
    const raw = value(name) ?? "10001";
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      problems.push(`${name} must be a positive whole number.`);
    }
    return parsed;
  };
  const days = (name: string, fallback: number, bounds: { min: number; max: number }) => {
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
    managedWorkerUser: workerUser === "same" ? "same" : { uid: workerUid, gid: workerGid },
    retention,
    egressAllow: typeof egress === "string" ? { networks: [], hosts: [] } : egress,
    consoleDir: value("CONSOLE_DIR"),
    screensDir: value("SCREENS_DIR"),
    appsUrl: appsUrl?.replace(/\/+$/, ""),
    appsOnConsoleAddress: appsOnConsole === "true",
    mailCaptureDir,
    mail:
      smtpUrl !== undefined && mailFrom !== undefined
        ? { url: smtpUrl, from: mailFrom }
        : undefined,
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}
