import { describe, expect, test } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const valid = {
  DATABASE_URL: "postgres://user:pass@db:5432/platform",
  S3_BUCKET: "platform",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
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
    });
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
      "S3_BUCKET is required.",
      "S3_ACCESS_KEY_ID is required.",
      "S3_SECRET_ACCESS_KEY is required.",
    ]);
  });

  test("treats an empty value as missing", () => {
    expect(problems({ ...valid, S3_BUCKET: "  " })).toEqual(["S3_BUCKET is required."]);
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
