import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { ACCESS_ACTIONS, tenantAccess } from "./access.js";
import { BuildError, type Built, buildRepository, describeBundle } from "./build.js";
import { startDevServer } from "./dev.js";
import { CliError } from "./errors.js";
import { type Followed, followRun, Stopped } from "./follow.js";
import { init, runLocally } from "./local.js";
import { pull, pulledFile, readPulled } from "./pull.js";
import { SCHEMA_FOLDER, writeEditorSchemas } from "./schemas.js";

export { CliError };

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
  env: Record<string, string | undefined>;
}

export interface Settings {
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
  schemas                               Write each kind's file schema into .platform/schemas,
                                        and tell VS Code which files each checks, so that
                                        <name>.<kind>.yaml completes and is checked as typed
  run <script> [--input <json>]         Run one script on this machine
  run <script|flow> --remote --tenant <slug> --workspace <slug> [--input <json>|@file]
                                        Run it on the platform, from this build, in a dev
                                        workspace, and follow it. Nothing is deployed
  pull --tenant <slug> --workspace <slug> [--deployed] [--force]
                                        Write the workspace's console resources, drafts
                                        included, into platform/. A file changed here is
                                        kept unless --force
  dev [app] --tenant <slug> --workspace <slug> [--port <n>]
                                        Serve an app from its source, with reload, against
                                        that workspace's data, as yourself
  deploy --tenant <slug> --workspace <slug> [--allow-delete <path>]
                                        Build, upload and activate the bundle
  promote --tenant <slug> --workspace <slug> [--preview] [--allow-delete <path>]
          [--confirm-breaking]
                                        Activate this workspace's bundle in the workspace
                                        it is linked to. Nothing is rebuilt

A tenant's access: its groups, service accounts, roles and what they are given
  tenant plan --tenant <slug>           What releasing the repository's files would change
  tenant release --tenant <slug> [--message <text>] [--allow-delete <kind>/<key>]
                                        Make the tenant's access what the files say. Files are
                                        named <key>.<kind>.yaml, such as
                                        tenant/groups/tech-desk.group.yaml
  tenant pull --tenant <slug>           Write the tenant's access as it is into the repository
  tenant releases --tenant <slug>       The releases there were, newest first
  tenant approve|decline|withdraw <number> --tenant <slug> [--comment <text>]
                                        Answer a release that waits for a second person
  tenant rollback <number> --tenant <slug>
                                        Go back to the access a release left

Move a tenant
  tenant export --tenant <slug> --out <file> [--history]
                                        Write everything the tenant has to one file. The file's
                                        passphrase is read from VOLVEL_EXPORT_PASSPHRASE
  tenant import <file> [--slug <slug>] [--location <name>]
                                        Bring an exported tenant into this instance. Operators only

See what ran
  runs --tenant <slug> --workspace <slug> [run id]
                                        List recent runs, or show one with its logs
  runs cancel --tenant <slug> --workspace <slug> [--queued|--all] [--older-than <s>]
                                        Cancel the workspace's queued runs; with --all, those
                                        going too, and its flow runs
  logs <run id> --tenant <slug> --workspace <slug> [-f]
                                        A run's or flow run's logs; with -f, follow it to its
                                        end. Exits 0 when it succeeded, 1 failed, 3 canceled

build, run, dev, deploy and pull read the repository in the current directory, or --dir <path>.
Create an API key in the console under your account menu.
VOLVEL_URL and VOLVEL_TOKEN override the saved settings.`;

export function settingsPath(env: Io["env"]): string {
  const base = env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), ".config");
  return join(base, "volvel", "config.json");
}

export async function loadSettings(env: Io["env"]): Promise<Settings> {
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(await readFile(settingsPath(env), "utf8"));
  } catch {
    // Not signed in yet. The environment may still supply everything.
  }
  const url = env.VOLVEL_URL ?? saved.url;
  const token = env.VOLVEL_TOKEN ?? saved.token;
  if (!url || !token) {
    throw new CliError("Not signed in. Run: volvel login --url <url> --token <api key>");
  }
  return { url, token };
}

export interface ApiReply {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: replies are read field by field by each command
  body: any;
}

export async function request(
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
export function refusal(reply: ApiReply, doing: string): CliError {
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
  const { bundle } = await buildRepository({ directory });
  const file = join(directory, ".platform", "bundle.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(bundle));
  for (const line of describeBundle(bundle)) io.out(line);
  io.out(`Written to ${file}`);
}

async function schemas(args: string[], io: Io) {
  const { values } = parseArgs({ args, options: directoryOption });
  const directory = resolve(values.dir ?? ".");
  const written = await writeEditorSchemas(directory);
  io.out(`Wrote the schemas of ${written.kinds} kinds of file to ${SCHEMA_FOLDER}.`);
  if (written.settings === "manual") {
    io.out(
      ".vscode/settings.json could not be read as plain JSON, so it was left as it is. Add this to it:",
    );
    io.out(JSON.stringify({ "yaml.schemas": written.mapping }, null, 2));
    return;
  }
  io.out(
    written.settings === "written"
      ? ".vscode/settings.json now says which files each checks. It needs the YAML extension (redhat.vscode-yaml)."
      : ".vscode/settings.json already says which files each checks.",
  );
  io.out("Run this again after upgrading the CLI.");
}

/**
 * Finds a tenant by its slug among those the key can see, page by page: an operator
 * sees every tenant of the instance, which can be more than one page holds.
 */
export async function findTenant(settings: Settings, slug: string) {
  let cursor: string | undefined;
  do {
    const page = await request(
      settings.url,
      `/tenants?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      settings.token,
    );
    if (page.status !== 200) throw refusal(page, "list tenants");
    const found = (page.body.items as { id: string; slug: string; name?: string }[]).find(
      (item) => item.slug === slug,
    );
    if (found) return found;
    cursor = page.body.nextCursor ?? undefined;
  } while (cursor);
  throw new CliError(`You have no access to a tenant called "${slug}".`);
}

/** Finds a tenant and workspace by their slugs. */
export async function locate(
  settings: Settings,
  tenantSlug: string | undefined,
  workspaceSlug: string | undefined,
) {
  if (!tenantSlug || !workspaceSlug)
    throw new CliError("This needs --tenant <slug> and --workspace <slug>.");
  const tenant = await findTenant(settings, tenantSlug);
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
  return { base: `/tenants/${tenant.id}/workspaces/${workspace.id}`, workspace, tenant };
}

/** Sends the files of the bundle's apps that the tenant does not have yet. */
async function uploadFiles(settings: Settings, base: string, built: Built, io: Io) {
  const wanted = [...new Set((built.bundle.assets ?? []).map((asset) => asset.sha256))];
  if (wanted.length === 0) return;
  const root = `${settings.url.replace(/\/+$/, "")}/api/v1${base}/bundle-assets`;
  const authorization = `Bearer ${settings.token}`;
  let sent = 0;
  let next = 0;
  const one = async () => {
    for (;;) {
      const sha256 = wanted[next++];
      if (sha256 === undefined) return;
      const have = await request(settings.url, `${base}/bundle-assets/${sha256}`, settings.token);
      if (have.status === 200) continue;
      if (have.status !== 404) throw refusal(have, "check the app's files");
      const response = await fetch(`${root}/${sha256}`, {
        method: "PUT",
        headers: { authorization, "content-type": "application/octet-stream" },
        body: built.files.get(sha256) as Buffer,
      });
      if (!response.ok) throw await failure(response, "upload a file of an app");
      sent += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, wanted.length) }, one));
  io.out(`App files: ${wanted.length}, ${sent} new.`);
}

const targetOptions = {
  tenant: { type: "string" as const },
  workspace: { type: "string" as const },
};

/** Paths a deploy or a promotion may delete although it looks like a rename done wrong. */
const allowDeleteOption = {
  "allow-delete": { type: "string" as const, multiple: true as const },
};

async function deploy(args: string[], io: Io) {
  const { values } = parseArgs({
    args,
    options: { ...directoryOption, ...targetOptions, ...allowDeleteOption },
  });
  const settings = await loadSettings(io.env);
  const { base, workspace } = await locate(settings, values.tenant, values.workspace);
  const built = await buildRepository({ directory: resolve(values.dir ?? ".") });
  const { bundle } = built;
  for (const line of describeBundle(bundle)) io.out(line);
  for (const note of built.notes) io.out(`Note: ${note}`);
  await uploadFiles(settings, base, built, io);

  const uploaded = await request(settings.url, `${base}/bundles`, settings.token, {
    method: "POST",
    body: bundle,
  });
  if (uploaded.status >= 300) throw refusal(uploaded, "upload the bundle");
  // The drafts the last pull took into platform/ are deployed with it: the console can let them go.
  const directory = resolve(values.dir ?? ".");
  const pulled = await readPulled(directory);
  const carried =
    pulled?.workspace === workspace.id
      ? Object.entries(pulled.drafts ?? {}).map(([path, revision]) => ({ path, revision }))
      : [];
  const deployed = await request(settings.url, `${base}/deployments`, settings.token, {
    method: "POST",
    body: {
      bundleId: uploaded.body.id,
      ...(carried.length > 0 ? { settleDrafts: carried } : {}),
      ...(values["allow-delete"]?.length ? { allowDelete: values["allow-delete"] } : {}),
    },
  });
  if (deployed.status >= 300) throw refusal(deployed, `deploy to ${values.workspace}`);
  io.out(
    `Deployed version ${deployed.body.bundleVersion} to ${values.workspace} (${workspace.type}): ` +
      `${counts(deployed.body.summary)}.`,
  );
  for (const line of describeChanges(deployed.body.summary, MAX_DEPLOY_LINES)) io.out(line);
  const settled = (deployed.body.draftsSettled ?? []) as string[];
  if (settled.length > 0) {
    io.out(
      `${settled.length} console ${settled.length === 1 ? "draft" : "drafts"} it carried ${settled.length === 1 ? "is" : "are"} cleared: ${settled.join(", ")}.`,
    );
  }
  if (pulled && carried.length > 0) {
    await writeFile(
      pulledFile(directory),
      `${JSON.stringify({ ...pulled, drafts: {} }, null, 2)}\n`,
    );
  }
}

interface DeploySummary {
  created: number;
  updated: number;
  renamed?: number;
  unchanged: number;
  deleted: number;
  data?: string[];
  changes?: { change: string; kind: string; path: string; from?: string }[];
  warnings?: { path: string; message: string }[];
  aliasesRemoved?: string[];
  breaking?: { path: string; message: string }[];
}

/** A deploy's counts in a sentence. Renames are said only when there are any. */
const counts = (s: DeploySummary) =>
  `${s.created} created, ${s.updated} updated, ${s.renamed ? `${s.renamed} renamed, ` : ""}${s.deleted} deleted, ${s.unchanged} unchanged`;

/** A deploy has just listed what the bundle holds, so it names what it created only when that is short. */
const MAX_DEPLOY_LINES = 30;

/**
 * The resources and tables a deploy changed, or would change, one per line.
 * With a limit, a long list keeps what was deleted and counts the rest.
 */
function describeChanges(summary: DeploySummary, limit = Number.POSITIVE_INFINITY): string[] {
  const all = summary.changes ?? [];
  const shown =
    all.length > limit
      ? all.filter((entry) => entry.change === "deleted" || entry.change === "renamed")
      : all;
  return [
    ...shown.map(
      (entry) =>
        `  ${entry.change.padEnd(8)} ${entry.kind.padEnd(10)} ${entry.from ? `${entry.from} -> ` : ""}${entry.path}`,
    ),
    ...(shown.length < all.length
      ? [`  and ${all.length - shown.length} created or updated, listed above`]
      : []),
    ...(summary.data ?? []).map((line) => `  ${line}`),
    ...(summary.aliasesRemoved ?? []).map(
      (path) =>
        `  ${path} no longer answers for the resource renamed away from it: it is a resource's own path again`,
    ),
    ...(summary.breaking ?? []).map((one) => `  Breaking: ${one.message}`),
    ...(summary.warnings ?? []).map((warning) => `  Note: ${warning.message}`),
  ];
}

async function dev(args: string[], io: Io) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { ...directoryOption, ...targetOptions, port: { type: "string" as const } },
  });
  const settings = await loadSettings(io.env);
  const { workspace, tenant } = await locate(settings, values.tenant, values.workspace);
  const me = await whoami(settings);
  const server = await startDevServer({
    directory: resolve(values.dir ?? "."),
    app: positionals[0],
    port: values.port ? Number(values.port) : 5174,
    instance: settings,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name ?? tenant.slug },
    workspace: { id: workspace.id, slug: workspace.slug },
    principal: me.principal,
  });
  io.out(`${server.app.path} is at ${server.url}`);
  io.out(
    `It reads and writes ${values.tenant}/${values.workspace} on ${settings.url}, as ${describe(me.principal)}. Press Ctrl+C to stop.`,
  );
  await new Promise<void>((done) => {
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
  await server.close();
}

async function promote(args: string[], io: Io) {
  const { values } = parseArgs({
    args,
    options: {
      ...targetOptions,
      ...allowDeleteOption,
      preview: { type: "boolean" as const },
      "confirm-breaking": { type: "boolean" as const },
    },
  });
  const settings = await loadSettings(io.env);
  const { base } = await locate(settings, values.tenant, values.workspace);
  const allowed: string[] = values["allow-delete"] ?? [];
  const preview = await request(
    settings.url,
    `${base}/promotion-preview${allowed.length > 0 ? `?allowDelete=${encodeURIComponent(allowed.join(","))}` : ""}`,
    settings.token,
  );
  if (preview.status >= 300) throw refusal(preview, `promote ${values.workspace}`);
  const { target, bundle, possible, refusal: why, summary } = preview.body;
  const where = `${target.slug} (${target.type})`;
  io.out(
    `Bundle ${String(bundle.digest).slice(0, 12)}, version ${bundle.version} here, to ${where}.`,
  );
  if (!possible) {
    throw new CliError(
      [
        `It cannot be promoted. ${why.detail}`,
        ...(why.errors as { message: string }[]).map((problem) => `  - ${problem.message}`),
      ].join("\n"),
    );
  }
  if (values.preview) {
    io.out(`Promoting would leave ${where} with: ${counts(summary)}.`);
    for (const line of describeChanges(summary)) io.out(line);
    io.out("Nothing was changed. Run it again without --preview to promote.");
    return;
  }
  const breaking = (summary.breaking ?? []) as { message: string }[];
  if (breaking.length > 0 && target.type === "production" && !values["confirm-breaking"]) {
    throw new CliError(
      [
        `Promoting this to ${where} changes a name that something outside calls:`,
        ...breaking.map((one) => `  - ${one.message}`),
        "Nothing was changed. Run it again with --confirm-breaking to promote.",
      ].join("\n"),
    );
  }
  const promoted = await request(settings.url, `${base}/promotions`, settings.token, {
    method: "POST",
    body: {
      ...(allowed.length > 0 ? { allowDelete: allowed } : {}),
      ...(values["confirm-breaking"] ? { confirmBreaking: true } : {}),
    },
  });
  if (promoted.status >= 300) throw refusal(promoted, `promote to ${target.slug}`);
  io.out(
    `Promoted to ${where} as version ${promoted.body.bundleVersion}: ${counts(promoted.body.summary)}.`,
  );
  for (const line of describeChanges(promoted.body.summary)) io.out(line);
}

/** The passphrase for an export file. Kept out of the command line, where it would be visible to others. */
function passphrase(io: Io): string {
  const value = io.env.VOLVEL_EXPORT_PASSPHRASE;
  if (!value) {
    throw new CliError(
      "Set VOLVEL_EXPORT_PASSPHRASE to the passphrase for the export file. It protects every secret the tenant has: make it long, and pass it on separately from the file.",
    );
  }
  return value;
}

async function failure(response: Response, doing: string): Promise<CliError> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {}
  return refusal({ status: response.status, body }, doing);
}

async function tenant(args: string[], io: Io) {
  const [action, ...rest] = args;
  const settings = await loadSettings(io.env);
  const base = `${settings.url.replace(/\/+$/, "")}/api/v1`;
  const authorization = `Bearer ${settings.token}`;

  if (action !== undefined && ACCESS_ACTIONS.includes(action)) {
    await tenantAccess(action, rest, io, settings, { request, refusal, findTenant });
    return;
  }

  if (action === "export") {
    const { values } = parseArgs({
      args: rest,
      options: {
        tenant: { type: "string" as const },
        out: { type: "string" as const },
        history: { type: "boolean" as const },
      },
    });
    if (!values.tenant || !values.out) {
      throw new CliError("This needs --tenant <slug> and --out <file>.");
    }
    const secret = passphrase(io);
    const found = await findTenant(settings, values.tenant);
    const response = await fetch(`${base}/tenants/${found.id}/exports`, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ passphrase: secret, history: values.history ?? false }),
    });
    if (!response.ok || !response.body) throw await failure(response, `export ${values.tenant}`);
    const file = resolve(values.out);
    await pipeline(
      Readable.fromWeb(response.body as never),
      createWriteStream(file, { mode: 0o600 }),
    );
    const { size } = await stat(file);
    io.out(`Exported ${values.tenant} to ${file} (${(size / 1024 / 1024).toFixed(1)} MB).`);
    io.out(
      values.history
        ? "It includes run, flow and event history."
        : "Run, flow and event history is not in it. Add --history to include it.",
    );
    io.out(
      "API keys and worker credentials are never exported. Make new ones where the tenant goes.",
    );
    io.out(
      "The passphrase protects the secrets in the file. Its rows, files and history are readable by anyone who has it: keep it somewhere safe.",
    );
    return;
  }

  if (action === "import") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { slug: { type: "string" as const }, location: { type: "string" as const } },
    });
    const [path] = positionals;
    if (!path) throw new CliError("This needs the export file: volvel tenant import <file>");
    const secret = passphrase(io);
    const file = resolve(path);
    const { size } = await stat(file).catch(() => {
      throw new CliError(`There is no file at ${file}.`);
    });
    const query = new URLSearchParams();
    if (values.slug) query.set("slug", values.slug);
    if (values.location) query.set("dataLocation", values.location);
    // Asked first, because a key that is refused while a file is being sent cannot be told apart from a broken connection.
    const me = await request(settings.url, "/me", settings.token);
    if (me.status !== 200) throw refusal(me, "import the tenant");
    const response = await fetch(`${base}/instance/tenant-imports?${query}`, {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/x-tar",
        "content-length": String(size),
        "x-export-passphrase": secret,
      },
      body: Readable.toWeb(createReadStream(file)) as never,
      // Node needs this said to send a body as it is read.
      duplex: "half",
    } as RequestInit).catch((error: Error) => {
      throw new CliError(
        `The file could not be sent to ${settings.url}. ${(error.cause as Error | undefined)?.message ?? error.message}`,
      );
    });
    if (!response.ok) throw await failure(response, "import the tenant");
    const report = (await response.json()) as {
      tenant: { slug: string; dataLocation: string | null };
      counts: Record<string, number>;
      objects: number;
      members: { created: number; linked: number };
      pausedWorkspaces: number;
      cancelled: { runs: number; flowRuns: number };
      notCarried: string[];
    };
    const rows = Object.values(report.counts).reduce((a, b) => a + b, 0);
    io.out(
      `Imported ${report.tenant.slug}: ${rows} rows, ${report.objects} stored objects, ` +
        `${report.members.created} members created and ${report.members.linked} linked to accounts already here.`,
    );
    io.out(
      report.tenant.dataLocation
        ? `Its custom tables are in the database location "${report.tenant.dataLocation}".`
        : "Its custom tables are in the platform database.",
    );
    io.out(
      `All ${report.pausedWorkspaces} workspaces arrived with their triggers paused. Resume each one when the instance it came from has stopped.`,
    );
    if (report.cancelled.runs + report.cancelled.flowRuns > 0) {
      io.out(
        `${report.cancelled.runs} runs and ${report.cancelled.flowRuns} flow runs were unfinished in the export and are recorded as canceled.`,
      );
    }
    for (const line of report.notCarried) io.out(`Not carried: ${line}`);
    return;
  }
  throw new CliError("Use: volvel tenant export ..., or: volvel tenant import <file>");
}

export const clock = (iso: string) => iso.replace("T", " ").slice(0, 19);

/**
 * `runs cancel`: cancels a workspace's runs in bulk, the way out of a backlog.
 * Queued runs by default; `--all` takes what is going too, and flow runs.
 */
async function cancelInBulk(args: string[], io: Io) {
  const { values } = parseArgs({
    args,
    options: {
      ...targetOptions,
      queued: { type: "boolean" },
      all: { type: "boolean" },
      "older-than": { type: "string" },
    },
  });
  if (values.queued && values.all) throw new CliError("Give --queued or --all, not both.");
  const settings = await loadSettings(io.env);
  const { base } = await locate(settings, values.tenant, values.workspace);
  const older = values["older-than"];
  const olderThanSeconds = older === undefined ? undefined : Number(older);
  if (
    olderThanSeconds !== undefined &&
    (!Number.isInteger(olderThanSeconds) || olderThanSeconds < 1)
  ) {
    throw new CliError("--older-than is a whole number of seconds.");
  }
  const window = olderThanSeconds ? { olderThanSeconds } : {};
  let total = 0;
  for (;;) {
    const done = await request(settings.url, `${base}/runs/cancel`, settings.token, {
      method: "POST",
      body: { include: values.all ? "all" : "queued", ...window },
    });
    if (done.status !== 200) throw refusal(done, "cancel runs");
    total += done.body.cancelled as number;
    if (!done.body.more) break;
  }
  io.out(`Cancelled ${total} ${values.all ? "" : "queued "}run${total === 1 ? "" : "s"}.`);
  if (!values.all) return;
  let flows = 0;
  for (;;) {
    const done = await request(settings.url, `${base}/flow-runs/cancel`, settings.token, {
      method: "POST",
      body: window,
    });
    if (done.status !== 200) throw refusal(done, "cancel flow runs");
    flows += done.body.cancelled as number;
    if (!done.body.more) break;
  }
  io.out(`Cancelled ${flows} flow run${flows === 1 ? "" : "s"}.`);
}

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
  if (run.status === "queued" || run.status === "running") {
    io.out(
      `To follow it: volvel logs ${id} -f --tenant ${values.tenant} --workspace ${values.workspace}`,
    );
  }
}

/** Stops following on Ctrl+C, leaving the run to go on. */
function interruptible(): { signal: AbortSignal; done: () => void } {
  const stop = new AbortController();
  const onSignal = () => stop.abort();
  process.once("SIGINT", onSignal);
  return { signal: stop.signal, done: () => process.off("SIGINT", onSignal) };
}

async function logs(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { ...targetOptions, follow: { type: "boolean", short: "f" } },
  });
  const [id] = positionals;
  if (!id)
    throw new CliError("Say which run: volvel logs <run id> --tenant <slug> --workspace <slug>");
  const settings = await loadSettings(io.env);
  const { base, tenant } = await locate(settings, values.tenant, values.workspace);
  const watch = interruptible();
  try {
    const followed = await followRun(settings, { base, tenantId: tenant.id }, id, io, {
      follow: values.follow === true,
      signal: watch.signal,
    });
    return followed.exitCode;
  } finally {
    watch.done();
  }
}

/** The input a run is given: JSON on the command line, or a file of it with @. */
async function inputOf(text: string | undefined): Promise<unknown> {
  if (text === undefined) return {};
  const raw = text.startsWith("@")
    ? await readFile(resolve(text.slice(1)), "utf8").catch(() => {
        throw new CliError(`There is no file at ${resolve(text.slice(1))}.`);
      })
    : text;
  try {
    return JSON.parse(raw);
  } catch {
    throw new CliError(
      `--input must be JSON, or @ and a file of JSON, for example --input '{"customer":"ada"}'`,
    );
  }
}

/** Runs a script or flow on the platform from this build, in a dev workspace, and follows it. */
async function runRemote(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      ...directoryOption,
      ...targetOptions,
      remote: { type: "boolean" },
      input: { type: "string" },
      script: { type: "boolean" },
      flow: { type: "boolean" },
    },
  });
  const [path] = positionals;
  if (!path) throw new CliError("Say what to run: volvel run <script or flow path> --remote ...");
  const input = await inputOf(values.input);
  const settings = await loadSettings(io.env);
  const { base, workspace, tenant } = await locate(settings, values.tenant, values.workspace);
  if (workspace.type !== "dev") {
    throw new CliError(
      `${values.workspace} is a ${workspace.type} workspace. A local build is tried in a dev workspace.`,
    );
  }
  const built = await buildRepository({ directory: resolve(values.dir ?? ".") });
  const found = built.bundle.manifests.filter(
    (manifest) =>
      manifest.path === path &&
      (manifest.kind === "script" || manifest.kind === "flow") &&
      (!values.script || manifest.kind === "script") &&
      (!values.flow || manifest.kind === "flow"),
  );
  if (found.length === 0) {
    const known = built.bundle.manifests
      .filter((manifest) => manifest.kind === "script" || manifest.kind === "flow")
      .map((manifest) => `${manifest.path} (${manifest.kind})`);
    throw new CliError(
      `There is no script or flow "${path}" in this build. It has: ${known.join(", ") || "neither"}.`,
    );
  }
  if (found.length > 1) {
    throw new CliError(
      `"${path}" is both a script and a flow here. Say which with --script or --flow.`,
    );
  }
  const kind = (found[0] as { kind: "script" | "flow" }).kind;
  await uploadFiles(settings, base, built, io);
  const uploaded = await request(settings.url, `${base}/bundles?preview=true`, settings.token, {
    method: "POST",
    body: built.bundle,
  });
  if (uploaded.status >= 300) throw refusal(uploaded, "upload this build");
  const started = await request(settings.url, `${base}/test-runs`, settings.token, {
    method: "POST",
    body: { [kind]: path, bundleId: uploaded.body.id, input },
  });
  if (started.status >= 300) throw refusal(started, `start ${path}`);
  io.out(
    `Test run ${started.body.runId} of ${path} in ${values.workspace}, from this build (preview, version ${uploaded.body.version}). Nothing was deployed.`,
  );
  const watch = interruptible();
  let followed: Followed;
  try {
    followed = await followRun(settings, { base, tenantId: tenant.id }, started.body.runId, io, {
      follow: true,
      signal: watch.signal,
    });
  } finally {
    watch.done();
  }
  if (followed.status === "succeeded")
    io.out(`Output: ${JSON.stringify(followed.output, null, 2)}`);
  return followed.exitCode;
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
      case "schemas":
        await schemas(rest, io);
        return 0;
      case "run":
        if (rest.includes("--remote")) return await runRemote(rest, io);
        await runLocally(rest, io);
        return 0;
      case "logs":
        return await logs(rest, io);
      case "pull":
        return await pull(rest, io);
      case "dev":
        await dev(rest, io);
        return 0;
      case "deploy":
        await deploy(rest, io);
        return 0;
      case "promote":
        await promote(rest, io);
        return 0;
      case "tenant":
        await tenant(rest, io);
        return 0;
      case "runs":
        if (rest[0] === "cancel") await cancelInBulk(rest.slice(1), io);
        else await runs(rest, io);
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
    if (error instanceof Stopped) {
      io.err(error.message);
      return 130;
    }
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
