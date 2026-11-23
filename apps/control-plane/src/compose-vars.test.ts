import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { CONFIG_VARS, WORKER_VARS } from "./config-vars.js";

/**
 * HOST-11, HOST-12, D20: what a person sets in compose's `.env` reaches the instance, and
 * the bundled database and object store can be left out.
 */
const folder = fileURLToPath(new URL("../../../deploy/compose/", import.meta.url));
const compose = readFileSync(`${folder}compose.yaml`, "utf8");
const example = readFileSync(`${folder}.env.example`, "utf8");

/** Not passed through compose, and why. */
const NOT_PASSED: Record<string, string> = {
  CONSOLE_DIR: "the image sets it",
  SCREENS_DIR: "the image sets it",
  HOST: "the published port and the health check assume the image's address",
  PORT: "the published port and the health check assume 8080",
  MAIL_CAPTURE_DIR: "a test setting: it writes mail to a folder in the container",
};

describe("compose passes the settings", () => {
  const environment = (service: string) => {
    const start = compose.indexOf(`\n  ${service}:`);
    const rest = compose.slice(start + 1);
    const end = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
    return end < 0 ? rest : rest.slice(0, end + 1);
  };

  test("every setting of the instance is in the control plane's environment, or says why not (HOST-11)", () => {
    const given = environment("control-plane");
    const missing = Object.keys(CONFIG_VARS).filter(
      (name) => !NOT_PASSED[name] && !new RegExp(`^ {6}${name}:`, "m").test(given),
    );
    expect(missing).toEqual([]);
  });

  test("the worker host gets the settings that size it and its workers (HOST-11, D20)", () => {
    const given = environment("worker-host");
    for (const name of [
      "RUN_SLOTS",
      "RUN_MEMORY_FLOOR_MB",
      "MANAGED_WORKERS_MAX",
      "MANAGED_WORKER_UID",
      "MANAGED_WORKER_GID",
      "MANAGED_WORKER_USERS",
      "WORKER_EGRESS_ALLOW",
    ]) {
      expect(given, name).toMatch(new RegExp(`^ {6}${name}:`, "m"));
    }
    expect(Object.keys(WORKER_VARS)).toContain("WORKER_EGRESS_ALLOW");
  });

  test(".env.example names every setting it can pass", () => {
    const missing = Object.keys(CONFIG_VARS)
      .filter((name) => !NOT_PASSED[name])
      .filter((name) => !new RegExp(`^#? ?${name}=`, "m").test(example));
    expect([
      ...missing,
      ...(/^#? ?WORKER_EGRESS_ALLOW=/m.test(example) ? [] : ["WORKER_EGRESS_ALLOW"]),
    ]).toEqual([]);
  });
});

const docker = spawnSync("docker", ["compose", "version"]).status === 0;
describe.skipIf(!docker)("compose leaves the bundled services out (HOST-12)", () => {
  const required = {
    PUBLIC_URL: "https://volvel.example.com",
    AUTH_SECRET: "a".repeat(32),
    MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
    WORKER_HOST_TOKEN: "w".repeat(40),
  };
  const config = (env: Record<string, string>, profiles: string) => {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "-f",
        `${folder}compose.yaml`,
        "--project-directory",
        folder,
        "config",
        "--format",
        "json",
      ],
      {
        env: { PATH: process.env.PATH ?? "", COMPOSE_PROFILES: profiles, ...required, ...env },
        encoding: "utf8",
      },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout) as {
      services: Record<string, { environment: Record<string, string> }>;
    };
  };

  test("with a database and a store of your own, only the control plane and the worker host are started", () => {
    const own = {
      DATABASE_URL: "postgres://me:pw@db.example.com:5432/volvel",
      S3_ENDPOINT: "https://s3.example.com",
      S3_BUCKET: "mine",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
    };
    const parsed = config(own, "");
    expect(Object.keys(parsed.services).sort()).toEqual(["control-plane", "worker-host"]);
    const env = parsed.services["control-plane"]?.environment;
    expect(env?.DATABASE_URL).toBe(own.DATABASE_URL);
    expect(env?.S3_ENDPOINT).toBe(own.S3_ENDPOINT);
    expect(env?.S3_BUCKET).toBe("mine");
  });

  test("with the profiles named, the bundled database and store are made and used", () => {
    const parsed = config(
      { POSTGRES_PASSWORD: "pw", OBJECTSTORE_SECRET: "os" },
      "postgres,objectstore",
    );
    expect(Object.keys(parsed.services).sort()).toEqual([
      "control-plane",
      "objectstore",
      "postgres",
      "worker-host",
    ]);
    const env = parsed.services["control-plane"]?.environment;
    expect(env?.DATABASE_URL).toBe("postgres://platform:pw@postgres:5432/platform");
    expect(env?.S3_ENDPOINT).toBe("http://objectstore:8333");
  });
});
