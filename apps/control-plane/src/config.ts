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
}

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
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}
