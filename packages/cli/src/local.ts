import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildBundle } from "./build.js";
import { CliError, type Io } from "./cli.js";
import { inputOf } from "./input.js";

interface LocalBindings {
  connections?: Record<string, { config: unknown; credential?: string }>;
  /** The members of each connection group, by group path, then member key. */
  groups?: Record<string, Record<string, { config: unknown; credential?: string; label?: string }>>;
  secrets?: Record<string, string>;
  variables?: Record<string, string>;
}

/** What a local run cannot offer, said plainly. */
function notLocal(what: string): never {
  throw new Error(
    `${what} live in a workspace, so they are not available to a local run. Deploy to a dev workspace to try this script.`,
  );
}

/**
 * Runs one script in this process, with connections, secrets and variables
 * read from `.platform/local.json`. Nothing is sent to an instance.
 */
export async function runLocally(args: string[], io: Io) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      dir: { type: "string" },
      entry: { type: "string" },
      resources: { type: "string" },
      input: { type: "string" },
    },
    allowPositionals: true,
  });
  const [path] = positionals;
  if (!path) throw new CliError("Say which script to run: volvel run <script path>");
  const directory = resolve(values.dir ?? ".");

  const input = await inputOf(values.input);

  const bundle = await buildBundle({
    directory,
    ...(values.entry ? { entry: values.entry } : {}),
    ...(values.resources ? { resources: values.resources } : {}),
  });
  const manifest = bundle.manifests.find(
    (candidate) => candidate.kind === "script" && candidate.path === path,
  );
  if (!manifest) {
    const known = bundle.manifests
      // The steps that come with the platform are not the repository's to list.
      .filter((candidate) => candidate.kind === "script" && !candidate.path.startsWith("core/"))
      .map((candidate) => candidate.path);
    throw new CliError(`There is no script "${path}". This repository has: ${known.join(", ")}`);
  }
  const body = manifest.body as {
    entry: string;
    uses: {
      connections: string[];
      connectionGroups?: string[];
      secrets: string[];
      variables: string[];
    };
  };

  const bindingsFile = join(directory, ".platform", "local.json");
  let bindings: LocalBindings = {};
  try {
    bindings = JSON.parse(await readFile(bindingsFile, "utf8"));
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw new CliError(`${bindingsFile} is not valid JSON.`);
    }
  }
  const defaults = Object.fromEntries(
    bundle.manifests
      .filter(
        (candidate) => candidate.kind === "variable" && typeof candidate.body.default === "string",
      )
      .map((candidate) => [candidate.path, candidate.body.default as string]),
  );
  const need = (kind: string, name: string, declared: string[], value: unknown) => {
    if (!declared.includes(name)) {
      throw new Error(
        `The script did not declare the ${kind} "${name}". Add it to the script's definition.`,
      );
    }
    if (value === undefined) {
      throw new Error(`The ${kind} "${name}" has no local value. Add it to ${bindingsFile}.`);
    }
    return value;
  };

  const file = join(directory, ".platform", `run-${process.pid}-${Date.now()}.mjs`);
  await mkdir(join(directory, ".platform"), { recursive: true });
  await writeFile(file, bundle.code);
  try {
    const loaded = (await import(pathToFileURL(file).href)) as Record<
      string,
      { execute(input: unknown, ctx: unknown): Promise<unknown> }
    >;
    const sdk = await import(
      pathToFileURL(createRequire(join(directory, "package.json")).resolve("@volvel/sdk")).href
    );
    const abort = new AbortController();
    // The connector a connection or group names: as a worker finds it, one of the platform's, or one this repository declares.
    const connectorOf = (kind: "connection" | "connection_group", path: string) =>
      (
        bundle.manifests.find((candidate) => candidate.kind === kind && candidate.path === path)
          ?.body as { connector?: string } | undefined
      )?.connector ?? "http";
    const clientFor = (
      connector: string,
      bound: { config: unknown; credential?: string },
    ): unknown => {
      if (connector === "http")
        return sdk.httpConnector.create(bound.config, bound.credential, abort.signal);
      if (connector === "oauth2")
        return sdk.oauth2Connector.create(bound.config, bound.credential, abort.signal);
      if (connector === "smtp") return notLocal("Mail connections");
      const entry = (
        bundle.manifests.find(
          (candidate) => candidate.kind === "connector" && candidate.path === connector,
        )?.body as { entry?: string } | undefined
      )?.entry;
      const own = entry ? (loaded as Record<string, unknown>)[entry] : undefined;
      if (typeof (own as { create?: unknown } | undefined)?.create !== "function") {
        throw new Error(`There is no connector "${connector}" in this repository.`);
      }
      return (
        own as unknown as {
          create(config: unknown, credential: string | undefined, signal: AbortSignal): unknown;
        }
      ).create(bound.config, bound.credential, abort.signal);
    };
    const log = (level: string) => (message: string, fields?: Record<string, unknown>) =>
      io.out(`${level.padEnd(5)} ${message}${fields ? ` ${JSON.stringify(fields)}` : ""}`);
    const output = await loaded[body.entry]?.execute(input, {
      connection: async (name: string) => {
        const bound = need(
          "connection",
          name,
          body.uses.connections,
          bindings.connections?.[name],
        ) as {
          config: unknown;
          credential?: string;
        };
        return clientFor(connectorOf("connection", name), bound);
      },
      connections: (group: string | { path: string }) => {
        const path = typeof group === "string" ? group : group.path;
        const members = () =>
          need(
            "connection group",
            path,
            body.uses.connectionGroups ?? [],
            bindings.groups?.[path],
          ) as NonNullable<LocalBindings["groups"]>[string];
        return {
          get: async (key: string) => {
            const member = members()[key];
            if (!member) {
              throw new Error(
                `The group "${path}" has no member "${key}" locally. Add it under groups in ${bindingsFile}.`,
              );
            }
            return clientFor(connectorOf("connection_group", path), member);
          },
          keys: async () =>
            Object.entries(members()).map(([key, member]) => ({ key, label: member.label ?? key })),
        };
      },
      secret: async (name: string) =>
        need("secret", name, body.uses.secrets, bindings.secrets?.[name]),
      variable: async (name: string) =>
        need("variable", name, body.uses.variables, bindings.variables?.[name] ?? defaults[name]),
      table: () => notLocal("Tables"),
      source: () => notLocal("Data sources"),
      files: { put: () => notLocal("Files"), get: () => notLocal("Files") },
      events: {
        publish: async (event: string, payload: unknown) =>
          io.out(`event ${event} ${JSON.stringify(payload)} (not delivered: this is a local run)`),
      },
      log: { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") },
      run: {
        id: randomUUID(),
        attempt: 1,
        idempotencyKey: randomUUID(),
        trigger: { type: "local" },
        startedBy: { type: "system", id: null },
        tag: async (...tags: string[]) =>
          io.out(`tags ${tags.join(", ")} (not kept: this is a local run)`),
      },
      signal: abort.signal,
    });
    io.out(`Output: ${JSON.stringify(output)}`);
  } catch (error) {
    throw new CliError(`The script failed: ${(error as Error).message}`);
  } finally {
    await rm(file, { force: true });
  }
}

/** The SDK a new repository asks for. A release sets it to the version released. */
export const STARTER_SDK_RANGE = "^0.5.0";

const STARTER: Record<string, string> = {
  "package.json": `${JSON.stringify(
    {
      name: "tenant-repository",
      private: true,
      type: "module",
      dependencies: { "@volvel/sdk": STARTER_SDK_RANGE },
    },
    null,
    2,
  )}\n`,
  ".gitignore": "node_modules/\n.platform/\n",
  "tsconfig.json": `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2023",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["src", ".platform/*.d.ts"],
    },
    null,
    2,
  )}\n`,
  "src/index.ts": `import { defineSchedule, defineScript, z } from "@volvel/sdk";

// Everything this file exports becomes a resource in the workspace you deploy to.

export const hello = defineScript({
  path: "hello",
  description: "Says hello. Replace it with your first integration.",
  input: z.object({ name: z.string().default("world") }),
  output: z.object({ greeting: z.string() }),
  async run(input, ctx) {
    ctx.log.info("Saying hello", { name: input.name });
    return { greeting: \`Hello, \${input.name}\` };
  },
});

export const helloEveryMorning = defineSchedule({
  path: "hello-every-morning",
  script: hello,
  cron: "0 8 * * 1-5",
});
`,
};

/** Writes a starter tenant repository into an empty directory. */
export async function init(args: string[], io: Io) {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const directory = resolve(positionals[0] ?? ".");
  await mkdir(directory, { recursive: true });
  const existing = (await readdir(directory)).filter((name) => name !== ".git");
  if (existing.length > 0) {
    throw new CliError(
      `${directory} is not empty. Choose an empty directory for a new repository.`,
    );
  }
  for (const [name, contents] of Object.entries(STARTER)) {
    const file = join(directory, name);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, contents);
  }
  io.out(`Created a tenant repository in ${directory}`);
  io.out("Next:");
  io.out("  1. In that folder, install the repository's dependencies: npm install");
  io.out(
    "  2. If the volvel command is not on this machine yet, install the CLI: npm install --global @volvel/cli",
  );
  io.out(
    "  3. Sign in: volvel login --url <your instance> --token <api key>. Create the key in the console under your account menu.",
  );
  io.out("  4. Try the script on this machine: volvel run hello. Check the build: volvel build.");
  io.out("  5. Send it to a dev workspace: volvel deploy --tenant <slug> --workspace <slug>");
}
