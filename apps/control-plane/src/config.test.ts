import { describe, expect, test } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const valid = {
  DATABASE_URL: "postgres://user:pass@db:5432/platform",
  S3_BUCKET: "platform",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  PUBLIC_URL: "https://platform.example.com/",
  AUTH_SECRET: "a".repeat(32),
  MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
};

function problems(env: Record<string, string | undefined>) {
  try {
    loadConfig(env);
    return [];
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
}

describe("configuration", () => {
  test("applies defaults", () => {
    expect(loadConfig(valid)).toEqual({
      databaseUrl: valid.DATABASE_URL,
      s3: {
        endpoint: undefined,
        region: "us-east-1",
        bucket: "platform",
        accessKeyId: "key",
        secretAccessKey: "secret",
        forcePathStyle: true,
      },
      host: "0.0.0.0",
      port: 8080,
      logLevel: "info",
      publicUrl: "https://platform.example.com",
      authSecret: "a".repeat(32),
      masterKey: Buffer.alloc(32, 7),
      bootstrapAdmin: undefined,
      managedWorkers: "process",
      workerHostToken: undefined,
      metricsWorkspaceLabels: true,
      metricsToken: undefined,
      telemetry: {
        endpoint: undefined,
        headers: {},
        serviceName: "volvel",
        traces: true,
        metrics: true,
        metricsIntervalMs: 60000,
      },
      managedWorkerUser: { uid: 10001, gid: 10001 },
      retention: { runsDays: 30, eventsDays: 30, refusalsDays: 7, auditDays: 400 },
      egressAllow: { networks: [], hosts: [] },
      consoleDir: undefined,
      appsUrl: undefined,
      appsOnConsoleAddress: false,
      limits: {
        runSlots: undefined,
        runMemoryFloorMb: undefined,
        managedWorkersMax: undefined,
        databasePoolSize: 10,
        dataPoolSize: 10,
        dataTenantConnections: undefined,
        dataStatementTimeoutMs: 15_000,
        sqlStatementTimeoutMs: 15_000,
        triggersPaused: false,
        scheduleBacklogLimit: 200,
      },
    });
  });

  test("the operator may set how much runs at once, within bounds", () => {
    expect(
      loadConfig({ ...valid, RUN_SLOTS: "6", RUN_MEMORY_FLOOR_MB: "0", MANAGED_WORKERS_MAX: "20" })
        .limits,
    ).toMatchObject({ runSlots: 6, runMemoryFloorMb: 0, managedWorkersMax: 20 });
    expect(() => loadConfig({ ...valid, RUN_SLOTS: "0" })).toThrow(/RUN_SLOTS/);
    expect(() => loadConfig({ ...valid, MANAGED_WORKERS_MAX: "lots" })).toThrow(
      /MANAGED_WORKERS_MAX/,
    );
  });

  test("the operator may let the instance reach some internal networks and hosts for tenants", () => {
    expect(loadConfig({ ...valid, EGRESS_ALLOW: "10.20.0.0/16,git.internal" }).egressAllow).toEqual(
      { networks: ["10.20.0.0/16"], hosts: ["git.internal"] },
    );
    expect(() => loadConfig({ ...valid, EGRESS_ALLOW: "10.0.0.0/99" })).toThrow(/EGRESS_ALLOW/);
  });

  test("history is kept 30, 30, 7 and 400 days unless the operator says otherwise, within bounds", () => {
    expect(
      loadConfig({ ...valid, RETENTION_RUNS_DAYS: "90", RETENTION_AUDIT_DAYS: "730" }).retention,
    ).toEqual({ runsDays: 90, eventsDays: 30, refusalsDays: 7, auditDays: 730 });
    expect(() => loadConfig({ ...valid, RETENTION_AUDIT_DAYS: "30" })).toThrow(
      /RETENTION_AUDIT_DAYS must be a whole number of days from 90 to 3650/,
    );
    expect(() => loadConfig({ ...valid, RETENTION_RUNS_DAYS: "0" })).toThrow(/RETENTION_RUNS_DAYS/);
  });

  test("managed workers are started by a worker host, beside the control plane, or not at all", () => {
    const token = "t".repeat(32);
    expect(loadConfig({ ...valid, MANAGED_WORKERS: "true" }).managedWorkers).toBe("process");
    expect(loadConfig({ ...valid, MANAGED_WORKERS: "false" }).managedWorkers).toBe(false);
    expect(
      loadConfig({ ...valid, MANAGED_WORKERS: "host", WORKER_HOST_TOKEN: token }),
    ).toMatchObject({ managedWorkers: "host", workerHostToken: token });
    // The token means nothing without a host to present it.
    expect(loadConfig({ ...valid, WORKER_HOST_TOKEN: token }).workerHostToken).toBeUndefined();
    expect(problems({ ...valid, MANAGED_WORKERS: "host" })).toEqual([
      "MANAGED_WORKERS=host needs WORKER_HOST_TOKEN, of at least 32 characters.",
    ]);
    expect(problems({ ...valid, MANAGED_WORKERS: "yes" })).toEqual([
      "MANAGED_WORKERS must be host, process or false.",
    ]);
  });

  test("managed workers run as their own user unless the operator says otherwise", () => {
    expect(loadConfig({ ...valid, MANAGED_WORKER_UID: "2000" }).managedWorkerUser).toEqual({
      uid: 2000,
      gid: 10001,
    });
    expect(loadConfig({ ...valid, MANAGED_WORKER_USER: "same" }).managedWorkerUser).toBe("same");
    expect(() => loadConfig({ ...valid, MANAGED_WORKER_USER: "root" })).toThrow(
      /MANAGED_WORKER_USER must be own or same/,
    );
    expect(() => loadConfig({ ...valid, MANAGED_WORKER_UID: "-1" })).toThrow(
      /MANAGED_WORKER_UID must be a positive whole number/,
    );
  });

  test("reads every variable", () => {
    const config = loadConfig({
      ...valid,
      S3_ENDPOINT: "http://objectstore:8333",
      S3_REGION: "eu-west-1",
      S3_FORCE_PATH_STYLE: "false",
      HOST: "127.0.0.1",
      PORT: "9000",
      LOG_LEVEL: "debug",
    });
    expect(config.s3.endpoint).toBe("http://objectstore:8333");
    expect(config.s3.region).toBe("eu-west-1");
    expect(config.s3.forcePathStyle).toBe(false);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(9000);
    expect(config.logLevel).toBe("debug");
  });

  test("reports every missing value at once", () => {
    expect(problems({})).toEqual([
      "DATABASE_URL is required.",
      "PUBLIC_URL is required.",
      "AUTH_SECRET is required.",
      "MASTER_KEY is required.",
      "S3_BUCKET is required.",
      "S3_ACCESS_KEY_ID is required.",
      "S3_SECRET_ACCESS_KEY is required.",
    ]);
  });

  test("treats an empty value as missing", () => {
    expect(problems({ ...valid, S3_BUCKET: "  " })).toEqual(["S3_BUCKET is required."]);
  });

  test("checks the secrets and the bootstrap admin", () => {
    expect(
      problems({
        ...valid,
        AUTH_SECRET: "short",
        MASTER_KEY: "dG9vLXNob3J0",
        BOOTSTRAP_ADMIN_EMAIL: "Admin@Example.com",
      }),
    ).toEqual([
      "AUTH_SECRET must be at least 32 characters.",
      "MASTER_KEY must be 32 bytes, base64 encoded. Generate one with: openssl rand -base64 32",
      "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together.",
    ]);
    expect(
      problems({
        ...valid,
        BOOTSTRAP_ADMIN_EMAIL: "a@example.com",
        BOOTSTRAP_ADMIN_PASSWORD: "short",
      }),
    ).toEqual(["BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters."]);
    const config = loadConfig({
      ...valid,
      BOOTSTRAP_ADMIN_EMAIL: "Admin@Example.com",
      BOOTSTRAP_ADMIN_PASSWORD: "a-long-password",
    });
    expect(config.bootstrapAdmin).toEqual({
      email: "admin@example.com",
      password: "a-long-password",
    });
  });

  test("reports malformed values", () => {
    expect(
      problems({
        ...valid,
        DATABASE_URL: "mysql://db/platform",
        S3_ENDPOINT: "objectstore:8333",
        S3_FORCE_PATH_STYLE: "yes",
        PORT: "80a",
        LOG_LEVEL: "loud",
      }),
    ).toEqual([
      "DATABASE_URL must be a URL starting with postgres: or postgresql://.",
      "S3_ENDPOINT must be a URL starting with http: or https://.",
      "S3_FORCE_PATH_STYLE must be true or false.",
      "PORT must be a number from 1 to 65535.",
      "LOG_LEVEL must be one of fatal, error, warn, info, debug, trace, silent.",
    ]);
  });
});

test("mail can be kept as files instead of sent, for development", () => {
  expect(loadConfig({ ...valid, MAIL_CAPTURE_DIR: "/tmp/mail" }).mailCaptureDir).toBe("/tmp/mail");
  expect(loadConfig(valid).mailCaptureDir).toBeUndefined();
});
