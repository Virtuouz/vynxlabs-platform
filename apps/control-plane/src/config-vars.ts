/**
 * Every environment variable the control plane reads, declared once. The
 * loader can read only what is here, and the documentation's page of settings
 * is drawn from this list, so the two cannot differ.
 *
 * This file imports nothing, so that whatever draws the page need not load
 * the control plane to read it.
 */

export interface ConfigVar {
  /** What it is for, in a sentence or two. Markdown, as a page of documentation is. */
  description: string;
  /** What is used when it is not set, as the page shows it. */
  default?: string;
  /** The instance does not start without it. */
  required?: true;
  /** Its value must never be logged or shown. */
  secret?: true;
  group:
    | "Address"
    | "Database"
    | "Files"
    | "Secrets"
    | "First start"
    | "Apps"
    | "Workers"
    | "Limits"
    | "Mail"
    | "Retention"
    | "Telemetry"
    | "Network"
    | "Files of the image";
}

export const CONFIG_VARS = {
  PUBLIC_URL: {
    group: "Address",
    required: true,
    description:
      "The address people type to reach the console, such as `https://volvel.example.com`.",
  },
  HOST: { group: "Address", default: "0.0.0.0", description: "The address the server listens on." },
  PORT: { group: "Address", default: "8080", description: "The port the server listens on." },
  LOG_LEVEL: {
    group: "Address",
    default: "info",
    description:
      "How much is logged: `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`.",
  },
  DOCS_URL: {
    group: "Address",
    description:
      "The address of the documentation on the web, such as `https://docs.example.com`. With it, each page of the console's help offers to open online. Without it, the help is only the copy the instance carries.",
  },

  DATABASE_URL: {
    group: "Database",
    required: true,
    secret: true,
    description:
      "The Postgres the instance keeps everything in, as `postgres://user:password@host:port/database`.",
  },
  DATABASE_POOL_SIZE: {
    group: "Database",
    default: "10",
    description: "Connections for the instance's own work, for each replica.",
  },
  DATA_POOL_SIZE: {
    group: "Database",
    default: "10",
    description: "Connections for every tenant's table requests, for each replica.",
  },
  DATA_TENANT_CONNECTIONS: {
    group: "Database",
    default: "A third of `DATA_POOL_SIZE`, at least 2",
    description: "Table requests one tenant may have open at once, for each replica.",
  },
  DATA_STATEMENT_TIMEOUT_MS: {
    group: "Database",
    default: "15000",
    description: "How long one request for rows may take, in milliseconds.",
  },
  SQL_STATEMENT_TIMEOUT_MS: {
    group: "Database",
    default: "15000",
    description: "How long one query written in SQL may run before it is stopped, in milliseconds.",
  },

  S3_ENDPOINT: {
    group: "Files",
    description: "The address of the S3-compatible store. Left out, Amazon's own for the region.",
  },
  S3_REGION: { group: "Files", default: "us-east-1", description: "The store's region." },
  S3_BUCKET: { group: "Files", required: true, description: "The bucket files are kept in." },
  S3_ACCESS_KEY_ID: {
    group: "Files",
    required: true,
    description: "The key the store knows the instance by.",
  },
  S3_SECRET_ACCESS_KEY: {
    group: "Files",
    required: true,
    secret: true,
    description: "The secret that goes with `S3_ACCESS_KEY_ID`.",
  },
  S3_FORCE_PATH_STYLE: {
    group: "Files",
    default: "true",
    description:
      "`true` puts the bucket in the path, as most stores other than Amazon's need. `false` puts it in the hostname.",
  },

  AUTH_SECRET: {
    group: "Secrets",
    required: true,
    secret: true,
    description: "Signs session cookies. At least 32 characters: `openssl rand -hex 32`.",
  },
  MASTER_KEY: {
    group: "Secrets",
    required: true,
    secret: true,
    description:
      "Wraps every tenant's encryption key. 32 bytes, base64: `openssl rand -base64 32`. Keep a copy somewhere safe: without it no stored secret can be read again.",
  },
  MASTER_KEY_SECONDARY: {
    group: "Secrets",
    secret: true,
    description: "The other key while the master key is being rotated.",
  },
  METRICS_TOKEN: {
    group: "Secrets",
    secret: true,
    description:
      "Lets a scraper read the metrics with this token and no sign-in. At least 32 characters.",
  },

  BOOTSTRAP_ADMIN_EMAIL: {
    group: "First start",
    description:
      "The first operator, made when the instance has no members. Set with `BOOTSTRAP_ADMIN_PASSWORD`, and remove both after the first start.",
  },
  BOOTSTRAP_ADMIN_PASSWORD: {
    group: "First start",
    secret: true,
    description: "The first operator's password. At least 12 characters.",
  },

  APPS_URL: {
    group: "Apps",
    description:
      "A second address for apps written as code, such as `https://apps.example.com`. Without it they are not served, unless `APPS_ON_CONSOLE_ADDRESS` says so.",
  },
  APPS_ON_CONSOLE_ADDRESS: {
    group: "Apps",
    default: "false",
    description:
      "`true` serves apps written as code at the console's own address. Only where everyone who writes an app is trusted with the console.",
  },

  MANAGED_WORKERS: {
    group: "Workers",
    default: "process",
    description:
      "How tenants' workers are started: `host` by the worker host, `process` by the control plane itself, or `false` for none.",
  },
  WORKER_HOST_TOKEN: {
    group: "Workers",
    secret: true,
    description:
      "What the worker host presents to ask for work. Needed when `MANAGED_WORKERS` is `host`.",
  },
  MANAGED_WORKER_USER: {
    group: "Workers",
    default: "own",
    description:
      "With `process`: `own` runs workers as a user of their own, `same` as the control plane's. `same` is for development, or where everyone who writes code works for the operator.",
  },
  MANAGED_WORKER_UID: {
    group: "Workers",
    default: "10001",
    description:
      "The first user workers run as. With a worker host each worker runs as a user of its own, from this one up, so that one tenant's script cannot read another's worker.",
  },
  MANAGED_WORKER_GID: {
    group: "Workers",
    default: "10001",
    description: "The first group workers run as. Each worker's group follows its user.",
  },
  MANAGED_WORKER_USERS: {
    group: "Workers",
    default: "256",
    description:
      "How many users, counted from `MANAGED_WORKER_UID`, the worker host may use: it never runs more workers at once than this. Read by the worker host, and by its firewall rules.",
  },
  MANAGED_WORKERS_MAX: {
    group: "Workers",
    default: "Twice the run slots",
    description: "With `process`: managed workers alive at once.",
  },
  RUN_SLOTS: {
    group: "Workers",
    default: "From memory: one for each 160 MB past the first 512 MB, at least 2",
    description: "Scripts running at once on this machine.",
  },
  RUN_MEMORY_FLOOR_MB: {
    group: "Workers",
    default: "A tenth of memory, at least 128",
    description: "Free memory below which no worker here takes more work. 0 turns the check off.",
  },

  SCHEDULE_BACKLOG_LIMIT: {
    group: "Limits",
    default: "200",
    description:
      "Queued runs in a workspace past which its schedules pass over their times. 0 is no limit.",
  },
  TRIGGERS_PAUSED: {
    group: "Limits",
    default: "false",
    description: "`true` pauses every trigger of the instance, whatever the console says.",
  },

  SMTP_URL: {
    group: "Mail",
    secret: true,
    description:
      "Where mail is sent, as `smtp://user:password@host:port` or `smtps://…`. Set with `MAIL_FROM`.",
  },
  MAIL_FROM: { group: "Mail", description: "The address mail is sent from." },
  MAIL_CAPTURE_DIR: {
    group: "Mail",
    description: "A folder to write each mail to as a file, in place of sending it. For tests.",
  },

  RETENTION_RUNS_DAYS: {
    group: "Retention",
    default: "30",
    description: "How long runs and their logs are kept, unless a tenant says otherwise.",
  },
  RETENTION_EVENTS_DAYS: {
    group: "Retention",
    default: "30",
    description: "How long events are kept.",
  },
  RETENTION_REFUSALS_DAYS: {
    group: "Retention",
    default: "7",
    description: "How long refused requests are kept.",
  },
  RETENTION_AUDIT_DAYS: {
    group: "Retention",
    default: "400",
    description: "How long audit entries are kept. Never less than 90.",
  },

  OTEL_EXPORTER_OTLP_ENDPOINT: {
    group: "Telemetry",
    description:
      "Where traces and metrics are sent, such as `http://collector:4318`. Without it, none are sent.",
  },
  OTEL_EXPORTER_OTLP_HEADERS: {
    group: "Telemetry",
    secret: true,
    description: "Headers to send with them, as `name=value,name=value`. A vendor's key goes here.",
  },
  OTEL_EXPORTER_OTLP_PROTOCOL: {
    group: "Telemetry",
    default: "http/json",
    description: "The protocol. `http/json` is the only one spoken.",
  },
  OTEL_SERVICE_NAME: {
    group: "Telemetry",
    default: "volvel",
    description: "What the instance calls itself.",
  },
  OTEL_TRACES_EXPORTER: { group: "Telemetry", description: "`none` sends no traces." },
  OTEL_METRICS_EXPORTER: { group: "Telemetry", description: "`none` sends no metrics." },
  OTEL_METRIC_EXPORT_INTERVAL: {
    group: "Telemetry",
    default: "60000",
    description: "How often metrics are sent, in milliseconds.",
  },
  METRICS_WORKSPACE_LABELS: {
    group: "Telemetry",
    default: "true",
    description:
      "`false` leaves the workspace out of each metric, where there are too many workspaces for the store that keeps them.",
  },

  EGRESS_ALLOW: {
    group: "Network",
    description:
      "Private networks and hosts the control plane may reach for a tenant (an OAuth token address, an identity provider, a Git remote, a domain check, a data source), as a list with commas: `10.0.0.0/8,db.internal`. Everything else private is refused. It does not limit what scripts and connections reach: they run on workers, which have their own network.",
  },

  TRUSTED_PROXIES: {
    group: "Network",
    default: "1",
    description:
      "Whose forwarding headers are believed when the instance learns who is calling: a number of proxies in front of it, or the networks they are on, as a list with commas (`10.0.0.0/8,172.16.0.0/12`). With `1`, the address your one proxy adds last is the caller's. `0` believes none, for an instance reached directly. Rate limits and the audit log use this address. The proxy must put the caller's address in `X-Forwarded-For` itself, never pass on what the caller sent.",
  },

  CONSOLE_DIR: {
    group: "Files of the image",
    description: "Where the console's built files are. The image sets it.",
  },
  SCREENS_DIR: {
    group: "Files of the image",
    description: "Where the built files of the app that draws interfaces are. The image sets it.",
  },
} as const satisfies Record<string, ConfigVar>;

export type ConfigVarName = keyof typeof CONFIG_VARS;
