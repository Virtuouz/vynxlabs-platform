import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { commandOf } from "./commands.js";

/** HOST-MP5: what `node dist/main.js` does with the words after it, before it opens anything. */
const main = fileURLToPath(new URL("../dist/main.js", import.meta.url));
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [main, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
    encoding: "utf8",
    timeout: 20_000,
  });

describe("the words", () => {
  test("each is read, and a word nobody knows is its own answer", () => {
    expect(commandOf([])).toEqual({ run: "start" });
    expect(commandOf(["rekey", "--data-role"])).toEqual({ run: "rekey", dataRole: true });
    expect(commandOf(["rekey"])).toEqual({ run: "rekey", dataRole: false });
    expect(commandOf(["recover-operator", "a@b.test"])).toEqual({
      run: "recover-operator",
      email: "a@b.test",
    });
    expect(commandOf(["check-config"])).toEqual({ run: "check-config" });
    expect(commandOf(["migrate"])).toEqual({ run: "migrate" });
    expect(commandOf(["rekey", "--help"])).toEqual({ run: "help" });
    expect(commandOf(["-h"])).toEqual({ run: "help" });
    expect(commandOf(["rekye"])).toEqual({ run: "unknown", word: "rekye" });
  });
});

describe("the program", () => {
  test("--help lists every command and exits 0 with no settings and no database", () => {
    const result = run(["--help"]);
    expect(result.status).toBe(0);
    for (const word of ["check-config", "migrate", "rekey", "recover-operator"]) {
      expect(result.stdout).toContain(word);
    }
    expect(run(["rekey", "--help"]).status).toBe(0);
  });

  test("a word that is not a command exits 2 and does not start the instance", () => {
    const result = run(["rekye"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("rekye is not a command");
  });

  test("check-config says every problem at once, and opens nothing", () => {
    const bad = run(["check-config"]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("DATABASE_URL is required.");
    expect(bad.stderr).toContain("AUTH_SECRET is required.");
    const good = run(["check-config"], {
      DATABASE_URL: "postgres://nobody:none@127.0.0.1:1/none",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s",
      PUBLIC_URL: "http://localhost:8080",
      AUTH_SECRET: "x".repeat(32),
      MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
    });
    expect(good.status, good.stderr).toBe(0);
    expect(good.stdout).toContain("The settings are valid.");
  });
});
