import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildBundle } from "./build.js";
import { CliError, type Io } from "./cli.js";

interface LocalBindings {
  connections?: Record<string, { config: unknown; credential?: string }>;
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
    options: { dir: { type: "string" }, input: { type: "string" } },
    allowPositionals: true,
  });
  const [path] = positionals;
  if (!path) throw new CliError("Say which script to run: platform run <script path>");
  const directory = resolve(values.dir ?? ".");

  let input: unknown = {};
  if (values.input !== undefined) {
    try {
      input = JSON.parse(values.input);
    } catch {
      throw new CliError('--input must be JSON, for example --input \'{"since":"2026-01-01"}\'');
    }
  }

  const bundle = await buildBundle({ directory });
  const manifest = bundle.manifests.find(
    (candidate) => candidate.kind === "script" && candidate.path === path,
  );
  if (!manifest) {
    const known = bundle.manifests
      .filter((candidate) => candidate.kind === "script")
      .map((candidate) => candidate.path);
    throw new CliError(`There is no script "${path}". This repository has: ${known.join(", ")}`);
  }
  const body = manifest.body as {
    entry: string;
    uses: { connections: string[]; secrets: string[]; variables: string[] };
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
      pathToFileURL(createRequire(join(directory, "package.json")).resolve("@vynxlabs/sdk")).href
    );
    const abort = new AbortController();
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
        return sdk.httpConnector.create(bound.config, bound.credential, abort.signal);
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

const STARTER: Record<string, string> = {
  "package.json": `${JSON.stringify(
    {
      name: "tenant-repository",
      private: true,
      type: "module",
      dependencies: { "@vynxlabs/sdk": "^0.3.0" },
    },
    null,
    2,
  )}\n`,
  ".gitignore": "node_modules/\n.platform/\n",
  "src/index.ts": `import { defineSchedule, defineScript, z } from "@vynxlabs/sdk";

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
  io.out("Next: install dependencies, then try `platform run hello` and `platform build`.");
}
