import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { runLocally } from "./local.js";

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const scratch: string[] = [];
afterAll(() => Promise.all(scratch.map((dir) => rm(dir, { recursive: true }))));

const SOURCE = `import { defineConnection, defineScript, z } from "@volvel/sdk";
export const mail = defineConnection({ path: "mail", connector: "smtp" });
export const viaGroup = defineScript({
  path: "t/group", input: z.object({}), output: z.object({}),
  run: async (_input, ctx) => { await ctx.connections("shops").keys(); return {}; },
});
export const viaMail = defineScript({
  path: "t/mail", input: z.object({}), output: z.object({}), connections: [mail],
  run: async (_input, ctx) => { await ctx.connection("mail"); return {}; },
});
`;

async function repository() {
  const dir = await mkdtemp(join(tmpdir(), "local-"));
  scratch.push(dir);
  await mkdir(join(dir, "src"));
  await mkdir(join(dir, "node_modules", "@volvel"), { recursive: true });
  await symlink(
    join(example, "node_modules", "@volvel", "sdk"),
    join(dir, "node_modules", "@volvel", "sdk"),
  );
  await mkdir(join(dir, ".platform"));
  await writeFile(
    join(dir, ".platform", "local.json"),
    JSON.stringify({ connections: { mail: { config: {} } } }),
  );
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  await writeFile(join(dir, "src", "index.ts"), SOURCE);
  return dir;
}

async function run(script: string) {
  const dir = await repository();
  const out: string[] = [];
  const err: string[] = [];
  await runLocally([script, "--dir", dir], {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: {},
  }).catch((error) => err.push((error as Error).message));
  return [...out, ...err].join("\n");
}

describe("a local run", () => {
  test("says that connection groups are not local, not a TypeError", async () => {
    const said = await run("t/group");
    expect(said).toContain("Connection groups live in a workspace");
    expect(said).not.toContain("is not a function");
  });

  test("names the kind of a connection that is not http", async () => {
    expect(await run("t/mail")).toContain('The connection "mail" is a smtp connection');
  });
});
