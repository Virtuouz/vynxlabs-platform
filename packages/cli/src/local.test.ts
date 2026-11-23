import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { run } from "./cli.js";

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const scratch: string[] = [];
afterAll(() => Promise.all(scratch.map((dir) => rm(dir, { recursive: true }))));

/** A throwaway tenant repository that can import the SDK, with local bindings. */
async function repository(source: string, local?: object) {
  const dir = await mkdtemp(join(tmpdir(), "local-"));
  scratch.push(dir);
  await mkdir(join(dir, "src"));
  await mkdir(join(dir, "node_modules", "@volvel"), { recursive: true });
  await symlink(
    join(example, "node_modules", "@volvel", "sdk"),
    join(dir, "node_modules", "@volvel", "sdk"),
  );
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  await writeFile(join(dir, "src", "index.ts"), source);
  if (local) {
    await mkdir(join(dir, ".platform"));
    await writeFile(join(dir, ".platform", "local.json"), JSON.stringify(local));
  }
  return dir;
}

async function cli(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: { XDG_CONFIG_HOME: tmpdir() },
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const SOURCE = `import { defineConnection, defineConnectionGroup, defineConnector, defineScript, z } from "@volvel/sdk";

export const shopConnector = defineConnector({
  path: "shop-api",
  configSchema: { type: "object" },
  create: (config, credential) => ({ kind: "shop", config, credential }),
});
export const shop = defineConnection({ path: "shop", connector: shopConnector });
export const mail = defineConnection({ path: "mail", connector: "smtp" });
export const plain = defineConnection({ path: "plain" });
export const shops = defineConnectionGroup({ path: "shops", connector: shopConnector });

export const useShop = defineScript({
  path: "use-shop",
  input: z.object({}),
  output: z.object({}).passthrough(),
  connections: [shop],
  async run(_input, ctx) {
    return { client: await ctx.connection("shop") };
  },
});
export const useMail = defineScript({
  path: "use-mail",
  input: z.object({}),
  output: z.object({}).passthrough(),
  connections: [mail],
  async run(_input, ctx) {
    await ctx.connection("mail");
    return {};
  },
});
export const useGroup = defineScript({
  path: "use-group",
  input: z.object({ key: z.string().default("acme") }),
  output: z.object({}).passthrough(),
  connectionGroups: [shops],
  async run(input, ctx) {
    const group = ctx.connections("shops");
    return { keys: await group.keys(), client: await group.get(input.key) };
  },
});
export const keys = defineScript({
  path: "keys",
  input: z.object({}),
  output: z.object({ keys: z.array(z.string()) }),
  async run(_input, ctx) {
    return { keys: Object.keys(ctx).sort() };
  },
});
export const echo = defineScript({
  path: "echo",
  input: z.object({ name: z.string() }),
  output: z.object({ name: z.string() }),
  async run(input) {
    return { name: input.name };
  },
});
`;

const LOCAL = {
  connections: {
    shop: { config: { region: "eu" }, credential: "k1" },
    mail: { config: { host: "smtp.example.test", from: "a@b.test" } },
  },
  groups: { shops: { acme: { config: { region: "us" }, credential: "k2", label: "Acme" } } },
};

describe("a local run builds its context as a platform run does", () => {
  test("a connection uses the connector it names, not always the HTTP client (CLI-05)", async () => {
    const dir = await repository(SOURCE, LOCAL);
    const ran = await cli(["run", "use-shop", "--dir", dir]);
    expect(ran.err).toBe("");
    expect(ran.out).toContain(
      'Output: {"client":{"kind":"shop","config":{"region":"eu"},"credential":"k1"}}',
    );
  }, 60_000);

  test("a connection of a connector that cannot run on this machine says so (CLI-05)", async () => {
    const dir = await repository(SOURCE, LOCAL);
    const ran = await cli(["run", "use-mail", "--dir", dir]);
    expect(ran.code).toBe(1);
    expect(ran.err).toContain("Deploy to a dev workspace");
  }, 60_000);

  test("connections(group) takes its members from local.json (CLI-06)", async () => {
    const dir = await repository(SOURCE, LOCAL);
    const ran = await cli(["run", "use-group", "--dir", dir]);
    expect(ran.err).toBe("");
    expect(ran.out).toContain('"keys":[{"key":"acme","label":"Acme"}]');
    expect(ran.out).toContain(
      '"client":{"kind":"shop","config":{"region":"us"},"credential":"k2"}',
    );
    const missing = await cli(["run", "use-group", "--dir", dir, "--input", '{"key":"zed"}']);
    expect(missing.err).toContain('The group "shops" has no member "zed"');
  }, 60_000);

  test("the local context has every key a worker's has (CLI-05)", async () => {
    const dir = await repository(SOURCE, LOCAL);
    const ran = await cli(["run", "keys", "--dir", dir]);
    const local = JSON.parse(ran.out.split("Output: ")[1] ?? "{}").keys;
    const { buildContext } = await import("@volvel/worker");
    const worker = Object.keys(
      buildContext({
        job: { runId: "r", attempt: 1 } as never,
        call: (async () => ({})) as never,
        loaded: { manifests: [], exports: {} } as never,
        signal: new AbortController().signal,
        write: () => {},
      }),
    ).sort();
    expect(local).toEqual(worker);
  }, 60_000);

  test("--input @file reads the file, as a remote run does (CLI-15)", async () => {
    const dir = await repository(SOURCE, LOCAL);
    await writeFile(join(dir, "in.json"), '{"name":"ada"}');
    const ran = await cli(["run", "echo", "--dir", dir, "--input", `@${join(dir, "in.json")}`]);
    expect(ran.err).toBe("");
    expect(ran.out).toContain('Output: {"name":"ada"}');
    const none = await cli(["run", "echo", "--dir", dir, "--input", "@nowhere.json"]);
    expect(none.err).toContain("There is no file at");
  }, 60_000);
});
