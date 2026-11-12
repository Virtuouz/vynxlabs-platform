import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

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

Commands:
  login --url <url> --token <api key>   Save the instance and key to use
  whoami                                Show who the saved key acts as
  status                                Show the instance's version and readiness

Create an API key in the console under your account menu.
PLATFORM_URL and PLATFORM_TOKEN override the saved settings.`;

/** A failure with a message meant for the person at the terminal. */
class CliError extends Error {}

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

async function request(url: string, path: string, token?: string): Promise<ApiReply> {
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/+$/, "")}/api/v1${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
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
    if (error instanceof CliError) {
      io.err(error.message);
      return 1;
    }
    if ((error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
      io.err((error as Error).message);
      return 2;
    }
    throw error;
  }
}
