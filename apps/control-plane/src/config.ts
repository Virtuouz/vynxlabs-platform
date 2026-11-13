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
  /** Creates the first operator admin when the instance has no members. */
  bootstrapAdmin: { email: string; password: string } | undefined;
  /** Whether the control plane starts worker processes itself, one per tenant with work. */
  managedWorkers: boolean;
  /** Directory holding the built console. Undefined when the console is not served. */
  consoleDir: string | undefined;
  /** Where the built app that draws interfaces is. Without it, generated apps are not served. */
  screensDir: string | undefined;
  /**
   * A second address for apps. When set, apps are served there and not on the
   * instance's own address, so that an app never runs where the console's sign-in is.
   */
  appsUrl: string | undefined;
  /** Where mail goes out, for invitations and password resets. Undefined when no mail is sent. */
  mail: { url: string; from: string } | undefined;
}

export const MIN_PASSWORD_LENGTH = 12;

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
    problems.push(
      "APPS_URL must be a different host from PUBLIC_URL. Leave it unset to serve apps on PUBLIC_URL.",
    );
  }

  const smtpUrl = value("SMTP_URL");
  url("SMTP_URL", smtpUrl, ["smtp:", "smtps:"]);
  const mailFrom = value("MAIL_FROM");
  if ((smtpUrl === undefined) !== (mailFrom === undefined)) {
    problems.push("SMTP_URL and MAIL_FROM must be set together.");
  }

  const managed = value("MANAGED_WORKERS") ?? "true";
  if (managed !== "true" && managed !== "false") {
    problems.push("MANAGED_WORKERS must be true or false.");
  }

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
    bootstrapAdmin:
      bootstrapEmail !== undefined && bootstrapPassword !== undefined
        ? { email: bootstrapEmail.toLowerCase(), password: bootstrapPassword }
        : undefined,
    managedWorkers: managed === "true",
    consoleDir: value("CONSOLE_DIR"),
    screensDir: value("SCREENS_DIR"),
    appsUrl: appsUrl?.replace(/\/+$/, ""),
    mail:
      smtpUrl !== undefined && mailFrom !== undefined
        ? { url: smtpUrl, from: mailFrom }
        : undefined,
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}
