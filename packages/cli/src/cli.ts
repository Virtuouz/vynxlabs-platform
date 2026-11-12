import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { BuildError, buildBundle, describeBundle } from "./build.js";
import { init, runLocally } from "./local.js";

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
  env: Record<string, string | undefined>;
}

interface Settings {
  url: string;
  token: string;
}

const USAGE = `Usage: platform <command>

Sign in
  login --url <url> --token <api key>   Save the instance and key to use
  whoami                                Show who the saved key acts as
  status                                Show the instance's version and readiness

Work on a tenant repository
  init [directory]                      Write a starter repository
  build                                 Build the bundle and list what it contains
  run <script> [--input <json>]         Run one script on this machine
  deploy --tenant <slug> --workspace <slug>
                                        Build, upload and activate the bundle

See what ran
  runs --tenant <slug> --workspace <slug> [run id]
                                        List recent runs, or show one with its logs

build, run and deploy read the repository in the current directory, or --dir <path>.
Create an API key in the console under your account menu.
PLATFORM_URL and PLATFORM_TOKEN override the saved settings.`;

/** A failure with a message meant for the person at the terminal. */
export class CliError extends Error {}

export function settingsPath(env: Io["env"]): string {
  const base = env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), ".config");
  return join(base, "vynxlabs-platform", "config.json");
}

async function loadSettings(env: Io["env"]): Promise<Settings> {
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(await readFile(settingsPath(env), "utf8"));
  } catch {
    // Not signed in yet. The environment may still supply everything.
  }
  const url = env.PLATFORM_URL ?? saved.url;
  const token = env.PLATFORM_TOKEN ?? saved.token;
  if (!url || !token) {
    throw new CliError("Not signed in. Run: platform login --url <url> --token <api key>");
  }
  return { url, token };
}

interface ApiReply {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: replies are read field by field by each command
  body: any;
}

async function request(
  url: string,
  path: string,
  token?: string,
  send?: { method: string; body?: unknown },
): Promise<ApiReply> {
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/+$/, "")}/api/v1${path}`, {
      method: send?.method ?? "GET",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(send?.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(send?.body !== undefined ? { body: JSON.stringify(send.body) } : {}),
    });
  } catch {
    throw new CliError(`Could not reach ${url}. Check the URL and that the instance is running.`);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    throw new CliError(`${url} did not answer like a platform instance. Check the URL.`);
  }
  return { status: response.status, body };
}

/** Explains a refused request in the server's own words, including each named problem. */
function refusal(reply: ApiReply, doing: string): CliError {
  if (reply.status === 401) {
    return new CliError("The API key was not accepted. Create a new one and run login again.");
  }
  const problems = ((reply.body?.errors ?? []) as { message: string }[]).map(
    (problem) => `  - ${problem.message}`,
  );
  const detail = reply.body?.detail ?? `The instance answered ${reply.status}.`;
  return new CliError([`Could not ${doing}. ${detail}`, ...problems].join("\n"));
}

async function whoami(settings: Settings) {
  const me = await request(settings.url, "/me", settings.token);
  if (me.status === 401) {
    throw new CliError(
      "The API key was not accepted. It may be revoked or expired. Create a new one and run login again.",
    );
  }
  if (me.status !== 200)
    throw new CliError(me.body?.detail ?? `The instance answered ${me.status}.`);
  return me.body as {
    principal: { type: string; name: string | null; email: string | null };
    tenants: { slug: string; name: string }[];
  };
}

const describe = (principal: { type: string; name: string | null; email: string | null }) =>
  principal.email ?? `${principal.type.replace("_", " ")} ${principal.name ?? ""}`.trim();

async function login(args: string[], io: Io) {
  const { values } = parseArgs({
    args,
    options: { url: { type: "string" }, token: { type: "string" } },
  });
  if (!values.url || !values.token) {
    throw new CliError("login needs both --url and --token.");
  }
  if (!URL.canParse(values.url) || !/^https?:$/.test(new URL(values.url).protocol)) {
    throw new CliError("--url must start with http:// or https://");
  }
  const settings = { url: values.url.replace(/\/+$/, ""), token: values.token };
  // Check the key before saving it, so a typo is caught now.
  const me = await whoami(settings);
  const path = settingsPath(io.env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  // writeFile keeps the mode of a file that already exists.
  await chmod(path, 0o600);
  io.out(`Signed in to ${settings.url} as ${describe(me.principal)}.`);
}

const directoryOption = { dir: { type: "string" as const } };

async function build(args: string[], io: Io) {
  const { values } = parseArgs({ args, options: directoryOption });
  const directory = resolve(values.dir ?? ".");
  const bundle = await buildBundle({ directory });
  const file = join(directory, ".platform", "bundle.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(bundle));
  for (const line of describeBundle(bundle)) io.out(line);
  io.out(`Written to ${file}`);
}

/** Finds a tenant and workspace by their slugs. */
async function locate(
  settings: Settings,
  tenantSlug: string | undefined,
  workspaceSlug: string | undefined,
) {
  if (!tenantSlug || !workspaceSlug)
    throw new CliError("This needs --tenant <slug> and --workspace <slug>.");
  const tenants = await request(settings.url, "/tenants?limit=200", settings.token);
  if (tenants.status !== 200) throw refusal(tenants, "list tenants");
  const tenant = (tenants.body.items as { id: string; slug: string }[]).find(
    (item) => item.slug === tenantSlug,
  );
  if (!tenant) throw new CliError(`You have no access to a tenant called "${tenantSlug}".`);
  const workspaces = await request(
    settings.url,
    `/tenants/${tenant.id}/workspaces`,
    settings.token,
  );
  if (workspaces.status !== 200) throw refusal(workspaces, "list workspaces");
  const workspace = (workspaces.body.items as { id: string; slug: string; type: string }[]).find(
    (item) => item.slug === workspaceSlug,
  );
  if (!workspace)
    throw new CliError(
      `The tenant "${tenantSlug}" has no workspace called "${workspaceSlug}" that you can read.`,
    );
  return { base: `/tenants/${tenant.id}/workspaces/${workspace.id}`, workspace };
}

const targetOptions = {
  tenant: { type: "string" as const },
  workspace: { type: "string" as const },
};

async function deploy(args: string[], io: Io) {
  const { values } = parseArgs({ args, options: { ...directoryOption, ...targetOptions } });
  const settings = await loadSettings(io.env);
  const { base, workspace } = await locate(settings, values.tenant, values.workspace);
  const bundle = await buildBundle({ directory: resolve(values.dir ?? ".") });
  for (const line of describeBundle(bundle)) io.out(line);

  const uploaded = await request(settings.url, `${base}/bundles`, settings.token, {
    method: "POST",
    body: bundle,
  });
  if (uploaded.status >= 300) throw refusal(uploaded, "upload the bundle");
  const deployed = await request(settings.url, `${base}/deployments`, settings.token, {
    method: "POST",
    body: { bundleId: uploaded.body.id },
  });
  if (deployed.status >= 300) throw refusal(deployed, `deploy to ${values.workspace}`);
  const { created, updated, unchanged, deleted } = deployed.body.summary;
  io.out(
    `Deployed version ${deployed.body.bundleVersion} to ${values.workspace} (${workspace.type}): ` +
      `${created} created, ${updated} updated, ${deleted} deleted, ${unchanged} unchanged.`,
  );
  for (const line of (deployed.body.summary.data ?? []) as string[]) io.out(`  ${line}`);
}

const clock = (iso: string) => iso.replace("T", " ").slice(0, 19);

async function runs(args: string[], io: Io) {
  const { values, positionals } = parseArgs({
    args,
    options: { ...targetOptions, script: { type: "string" } },
    allowPositionals: true,
  });
  const settings = await loadSettings(io.env);
  const { base } = await locate(settings, values.tenant, values.workspace);
  const [id] = positionals;

  if (!id) {
    const query = values.script ? `&script=${encodeURIComponent(values.script)}` : "";
    const listed = await request(settings.url, `${base}/runs?limit=20${query}`, settings.token);
    if (listed.status !== 200) throw refusal(listed, "list runs");
    const items = listed.body.items as {
      id: string;
      script: string;
      status: string;
      trigger: { type: string };
      createdAt: string;
    }[];
    // Flow runs are listed with the script runs, newest first. A flow's steps appear as runs started by "flow".
    const flows = values.script
      ? { status: 200, body: { items: [] } }
      : await request(settings.url, `${base}/flow-runs?limit=20`, settings.token);
    for (const flow of (flows.body?.items ?? []) as {
      id: string;
      flow: string;
      status: string;
      trigger: { type: string };
      createdAt: string;
    }[]) {
      items.push({
        id: flow.id,
        script: `${flow.flow} (flow)`,
        status: flow.status,
        trigger: flow.trigger,
        createdAt: flow.createdAt,
      });
    }
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (items.length === 0) {
      io.out("No runs yet.");
      return;
    }
    for (const run of items) {
      io.out(
        `${clock(run.createdAt)}  ${run.status.padEnd(9)}  ${run.trigger.type.padEnd(8)}  ${run.script}  ${run.id}`,
      );
    }
    return;
  }

  const found = await request(settings.url, `${base}/runs/${id}`, settings.token);
  if (found.status !== 200) throw refusal(found, "read the run");
  const run = found.body;
  io.out(
    `${run.script}: ${run.status}, attempt ${run.attempt} of ${run.maxAttempts}, bundle version ${run.bundleVersion}`,
  );
  io.out(`Started by ${run.trigger.type} at ${clock(run.createdAt)}`);
  io.out(`Input:  ${JSON.stringify(run.input)}`);
  if (run.status === "succeeded") io.out(`Output: ${JSON.stringify(run.output)}`);
  if (run.error) io.out(`Error:  ${run.error.message}`);
  const logs = await request(settings.url, `${base}/runs/${id}/logs?limit=1000`, settings.token);
  for (const line of (logs.body?.items ?? []) as {
    time: string;
    level: string;
    message: string;
    fields: object;
  }[]) {
    const fields = Object.keys(line.fields).length > 0 ? ` ${JSON.stringify(line.fields)}` : "";
    io.out(`  ${clock(line.time)} ${line.level.padEnd(5)} ${line.message}${fields}`);
  }
}

/** Runs the command line. Returns the process exit code. */
export async function run(argv: string[], io: Io): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "login":
        await login(rest, io);
        return 0;
      case "whoami": {
        const settings = await loadSettings(io.env);
        const me = await whoami(settings);
        io.out(`${describe(me.principal)} on ${settings.url}`);
        io.out(
          me.tenants.length > 0
            ? `Tenants: ${me.tenants.map((tenant) => `${tenant.name} (${tenant.slug})`).join(", ")}`
            : "Tenants: none",
        );
        return 0;
      }
      case "status": {
        const { url } = await loadSettings(io.env);
        const [instance, ready] = await Promise.all([
          request(url, "/instance"),
          request(url, "/readyz"),
        ]);
        if (instance.status !== 200) throw new CliError(`${url} answered ${instance.status}.`);
        io.out(`${url}`);
        io.out(
          `Version ${instance.body.coreVersion}, migration level ${instance.body.migrationLevel}`,
        );
        const failing = Object.entries(
          (ready.body?.checks ?? {}) as Record<string, { ok: boolean }>,
        )
          .filter(([, check]) => !check.ok)
          .map(([name]) => name);
        io.out(failing.length === 0 ? "Ready" : `Not ready: ${failing.join(", ")} failing`);
        return failing.length === 0 ? 0 : 1;
      }
      case "init":
        await init(rest, io);
        return 0;
      case "build":
        await build(rest, io);
        return 0;
      case "run":
        await runLocally(rest, io);
        return 0;
      case "deploy":
        await deploy(rest, io);
        return 0;
      case "runs":
        await runs(rest, io);
        return 0;
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.out(USAGE);
        return 0;
      default:
        io.err(`Unknown command "${command}".\n\n${USAGE}`);
        return 2;
    }
  } catch (error) {
    if (error instanceof CliError || error instanceof BuildError) {
      io.err(
        error instanceof BuildError
          ? `The build failed:\n${error.problems.map((p) => `  - ${p}`).join("\n")}`
          : error.message,
      );
      return 1;
    }
    if ((error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
      io.err((error as Error).message);
      return 2;
    }
    throw error;
  }
}
