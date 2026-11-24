import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { ENV_TYPES_FILE, resourceOfFile } from "@volvel/manifest";
import { ACCESS_ACTIONS, tenantAccess } from "./access.js";
import { appSources, BuildError, type Built, buildRepository, describeBundle } from "./build.js";
import { type CommandName, usage } from "./commands.js";
import { convertRepository, describeConvert } from "./convert.js";
import { startDevServer } from "./dev.js";
import { siteApps } from "./dev-site.js";
import { startWidgetServer, widgetsOf } from "./dev-widgets.js";
import { CliError } from "./errors.js";
import { type Followed, followRun, Stopped } from "./follow.js";
import { inputOf } from "./input.js";
import { init, runLocally } from "./local.js";
import { pull, pulledFile, readPulled } from "./pull.js";
import { SCHEMA_FOLDER, writeEditorSchemas } from "./schemas.js";
import { writeEnvTypes } from "./types.js";
import { widgetCommand } from "./widget.js";

export { CliError };

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
  env: Record<string, string | undefined>;
  /** Asks a yes or no question of whoever is at the terminal. Absent when nobody can answer. */
  confirm?: (question: string) => Promise<boolean>;
}

export interface Settings {
  url: string;
  token: string;
}

const PROFILE_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

/** The folder the CLI keeps what it saves in. */
function settingsFolder(env: Io["env"]): string {
  return join(env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), ".config"), "volvel");
}

/**
 * Where the sign-in is saved. With a profile (`--profile <name>` or VOLVEL_PROFILE), the
 * profile's own file, so that one machine can be signed in to several instances.
 */
export function settingsPath(env: Io["env"]): string {
  const profile = env.VOLVEL_PROFILE;
  if (profile !== undefined && profile !== "") {
    if (!PROFILE_NAME.test(profile)) {
      throw new CliError(
        `A profile name is letters, digits, "-" and "_", up to 40, not "${profile}".`,
      );
    }
    return join(settingsFolder(env), `profile-${profile.toLowerCase()}.json`);
  }
  return join(settingsFolder(env), "config.json");
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

async function savedSettings(env: Io["env"]): Promise<Partial<Settings>> {
  const path = settingsPath(env);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    // Not signed in yet. The environment may still supply everything.
    return {};
  }
}

/** The instance a command that sends no key talks to. */
export async function loadUrl(env: Io["env"]): Promise<string> {
  const url = env.VOLVEL_URL ?? (await savedSettings(env)).url;
  if (!url)
    throw new CliError("No instance chosen. Run: volvel login --url <url> --token <api key>");
  return url;
}

export async function loadSettings(env: Io["env"]): Promise<Settings> {
  const saved = await savedSettings(env);
  const url = env.VOLVEL_URL ?? saved.url;
  // A saved token belongs to the instance it was saved for. It is sent only there.
  const sameInstance = saved.url !== undefined && url !== undefined && sameUrl(url, saved.url);
  const token = env.VOLVEL_TOKEN ?? (sameInstance ? saved.token : undefined);
  if (url && !token && saved.token && !sameInstance) {
    throw new CliError(
      `The saved API key is for ${saved.url}, not ${url}. Set VOLVEL_TOKEN to a key for ${url}, or run: volvel login --url ${url} --token <api key>`,
    );
  }
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

/** What an instance from before types, subjects, moves and dates says of a page that uses them. */
const OLDER_INSTANCE = /There is no "(type|subjects|moved_from|date)" (here|in )/;

/** Explains a refused request in the server's own words, including each named problem. */
/** One problem of a refusal. What the console changed is named by its path: the path is the point. */
function problemLine(code: unknown, problem: { path?: string; message: string }): string {
  return code === "console_changed" && problem.path
    ? `  - ${problem.path}: ${problem.message}`
    : `  - ${problem.message}`;
}

export function refusal(reply: ApiReply, doing: string): CliError {
  if (reply.status === 401) {
    return new CliError("The API key was not accepted. Create a new one and run login again.");
  }
  const problems = ((reply.body?.errors ?? []) as { path?: string; message: string }[]).map(
    (problem) => problemLine(reply.body?.code, problem),
  );
  const detail = reply.body?.detail ?? `The instance answered ${reply.status}.`;
  const lines = [`Could not ${doing}. ${detail}`, ...problems];
  if (reply.body?.code === "console_changed") {
    lines.push(
      "To overwrite them on purpose, deploy again with --force. That is written to the audit log.",
    );
  }
  // An instance from before a page could say these refuses the key, and says it by name.
  const older = ((reply.body?.errors ?? []) as { message: string }[]).some((problem) =>
    OLDER_INSTANCE.test(problem.message),
  );
  if (older || OLDER_INSTANCE.test(String(detail))) {
    lines.push(
      "A page uses a key that this instance may not know: the instance may be older than this CLI. Upgrade the instance, or take type, subjects, moved_from and date out of the pages' top.",
    );
  }
  return new CliError(lines.join("\n"));
}

/** `--json` on a command: its one answer is a JSON document on stdout, and no other line is. */
const jsonOption = { json: { type: "boolean" as const } };

/** The Io a command speaks through: every line, or none when it answers in JSON. */
const spoken = (io: Io, json: boolean | undefined): Io => (json ? { ...io, out: () => {} } : io);

/**
 * What a deploy or a promotion says it is for: `--message`, else, in CI, the subject of the
 * commit it was built from. Left out when there is neither.
 */
async function messageFor(
  said: string | undefined,
  directory: string,
  env: Io["env"],
): Promise<string | undefined> {
  const clip = (text: string) => (text.length > 500 ? `${text.slice(0, 497)}...` : text);
  if (said !== undefined) {
    if (said.trim() === "") throw new CliError("--message needs some words.");
    return clip(said.trim());
  }
  if (!env.CI || env.CI === "false" || env.CI === "0") return undefined;
  const subject = await new Promise<string>((done) =>
    execFile("git", ["log", "-1", "--format=%s"], { cwd: directory }, (error, out) =>
      done(error ? "" : out.trim()),
    ),
  );
  return subject === "" ? undefined : clip(subject);
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
  if (!me.body?.principal || !Array.isArray(me.body.tenants)) {
    throw new CliError(`${settings.url} did not answer like a platform instance. Check the URL.`);
  }
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
  const { protocol, hostname } = new URL(settings.url);
  if (protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    io.err(
      `Warning: ${settings.url} is plain http, so the API key crosses the network unencrypted. Use https:// unless this is a network you trust.`,
    );
  }
  // Check the key before saving it, so a typo is caught now.
  const me = await whoami(settings);
  const path = settingsPath(io.env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  // writeFile keeps the mode of a file that already exists.
  await chmod(path, 0o600);
  io.out(`Signed in to ${settings.url} as ${describe(me.principal)}.`);
}

/** A flag that is a whole number within bounds. One reader for every such flag. */
export function wholeNumber(flag: string, value: string, min: number, max?: number): number {
  const number = /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number) || number < min || (max !== undefined && number > max)) {
    throw new CliError(
      `${flag} is a whole number${max === undefined ? ` of at least ${min}` : ` from ${min} to ${max}`}, not "${value}".`,
    );
  }
  return number;
}

const directoryOption = { dir: { type: "string" as const } };

/** Where the repository keeps its code and the console's folder, when not where `volvel.yaml` or the defaults say. */
const placesOption = {
  ...directoryOption,
  entry: { type: "string" as const },
  resources: { type: "string" as const },
};

/** What a command that builds is told: the directory, and the places a flag names. */
const buildOptionsOf = (values: { dir?: string; entry?: string; resources?: string }) => ({
  directory: resolve(values.dir ?? "."),
  ...(values.entry ? { entry: values.entry } : {}),
  ...(values.resources ? { resources: values.resources } : {}),
});

async function build(args: string[], io: Io) {
  const { values } = parseArgs({ args, options: placesOption });
  const directory = resolve(values.dir ?? ".");
  const built = await buildRepository(buildOptionsOf(values));
  const { bundle } = built;
  for (const warning of built.warnings) io.err(`Warning: ${warning}`);
  const file = join(directory, ".platform", "bundle.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(bundle));
  await writeEnvTypes(directory, bundle.manifests);
  for (const line of describeBundle(bundle)) io.out(line);
  io.out(`Written to ${file}`);
}

async function types(args: string[], io: Io) {
  const { values } = parseArgs({ args, options: placesOption });
  const directory = resolve(values.dir ?? ".");
  const built = await buildRepository({ ...buildOptionsOf(values), withoutAppSources: true });
  for (const warning of built.warnings) io.err(`Warning: ${warning}`);
  await writeEnvTypes(directory, built.bundle.manifests);
  io.out(`Wrote the types of your tables, events, variables and connections to ${ENV_TYPES_FILE}.`);
  io.out(
    'Scripts are typed by them when tsconfig.json includes ".platform/*.d.ts". Run this again, or `volvel build`, after a definition changes.',
  );
}

async function convert(args: string[], io: Io) {
  const { values } = parseArgs({
    args,
    options: {
      ...placesOption,
      "dry-run": { type: "boolean" as const },
      only: { type: "string" as const },
      "keep-references": { type: "boolean" as const },
    },
  });
  const only = values.only
    ?.split(",")
    .map((kind) => kind.trim())
    .filter((kind) => kind !== "");
  const result = await convertRepository({
    ...buildOptionsOf(values),
    ...(only && only.length > 0 ? { only } : {}),
    dryRun: values["dry-run"] === true,
    keepReferences: values["keep-references"] === true,
  });
  for (const line of describeConvert(result)) io.out(line);
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
      }).catch(() => {
        throw new CliError(
          `Could not reach ${settings.url} to send a file of an app. Check the connection and run the command again: files already sent are kept.`,
        );
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

/**
 * What a deploy of this repository would delete from what the console made: the resources the
 * workspace runs from the console that the repository has no file for. Said before anything is
 * uploaded, because the bundle speaks for the whole set.
 */
export function consoleResourcesLeft(
  deployed: { files: { path: string }[]; elsewhere?: { resource?: string }[] },
  bundlePaths: string[],
  allowed: string[],
): string[] {
  const here = new Set(bundlePaths);
  const allow = new Set(allowed);
  const there = new Set([
    ...deployed.files.map((file) => resourceOfFile(file.path)),
    ...(deployed.elsewhere ?? []).flatMap((file) => (file.resource ? [file.resource] : [])),
  ]);
  return [...there].filter((path) => !here.has(path) && !allow.has(path)).sort();
}

async function refuseToDropConsoleResources(
  settings: Settings,
  base: string,
  bundlePaths: string[],
  allowed: string[],
) {
  const reply = await request(settings.url, `${base}/resource-files?drafts=false`, settings.token);
  // Someone who may not read them all cannot tell, and the server decides as it always has.
  if (reply.status !== 200) return;
  const left = consoleResourcesLeft(reply.body, bundlePaths, allowed);
  if (left.length === 0) return;
  const shown = left.slice(0, 10).map((path) => `  - ${path}`);
  if (left.length > shown.length) shown.push(`  and ${left.length - shown.length} more`);
  throw new CliError(
    [
      `This deploy would delete ${left.length} ${left.length === 1 ? "resource" : "resources"} made in the console, because this repository has no file for ${left.length === 1 ? "it" : "them"}:`,
      ...shown,
      "Run `volvel pull` to bring them into platform/, or deploy again with --allow-delete <path> for each one that should go.",
    ].join("\n"),
  );
}

async function deploy(args: string[], io: Io) {
  const { values } = parseArgs({
    args,
    options: {
      ...placesOption,
      ...targetOptions,
      ...allowDeleteOption,
      ...jsonOption,
      preview: { type: "boolean" as const },
      message: { type: "string" as const },
      force: { type: "boolean" as const },
    },
  });
  const say = spoken(io, values.json);
  const settings = await loadSettings(io.env);
  const { base, workspace } = await locate(settings, values.tenant, values.workspace);
  const built = await buildRepository(buildOptionsOf(values));
  const { bundle } = built;
  const message = await messageFor(values.message, resolve(values.dir ?? "."), io.env);
  for (const line of describeBundle(bundle)) say.out(line);
  for (const note of built.notes) say.out(`Note: ${note}`);
  for (const warning of built.warnings) io.err(`Warning: ${warning}`);
  // The drafts the last pull took into platform/ are deployed with it: the console can let them go.
  const directory = resolve(values.dir ?? ".");
  const pulled = await readPulled(directory);
  const carried =
    pulled?.workspace === workspace.id
      ? Object.entries(pulled.drafts ?? {}).map(([path, revision]) => ({ path, revision }))
      : [];
  // A resource deleted in the console and pulled is meant to go: its file is gone on purpose.
  // A bundle with no console file at all leaves the console's resources as they are.
  if (!values.force && bundle.manifests.some((manifest) => manifest.ownership === "ui")) {
    await refuseToDropConsoleResources(
      settings,
      base,
      bundle.manifests.map((manifest) => manifest.path),
      [...(values["allow-delete"] ?? []), ...carried.map((one) => one.path)],
    );
  }
  await uploadFiles(settings, base, built, say);

  if (values.preview) {
    // Stored as a bundle made to be tried, never offered for deploying, and removed after a week.
    const tried = await request(settings.url, `${base}/bundles?preview=true`, settings.token, {
      method: "POST",
      body: bundle,
    });
    if (tried.status >= 300) throw refusal(tried, "check the bundle");
    const allowed: string[] = values["allow-delete"] ?? [];
    const answer = await request(
      settings.url,
      `${base}/deployment-preview?bundleId=${tried.body.id}${allowed.length > 0 ? `&allowDelete=${encodeURIComponent(allowed.join(","))}` : ""}${values.force ? "&force=true" : ""}`,
      settings.token,
    );
    if (answer.status >= 300) throw refusal(answer, `check a deploy to ${values.workspace}`);
    const { possible, refusal: why, summary } = answer.body;
    if (!possible) {
      throw new CliError(
        [
          `It cannot be deployed. ${why.detail}`,
          ...(why.errors as { path?: string; message: string }[]).map((problem) =>
            problemLine(why.code, problem),
          ),
          ...(why.code === "console_changed"
            ? ["To overwrite them on purpose, deploy again with --force."]
            : []),
        ].join("\n"),
      );
    }
    say.out(
      `Deploying would leave ${values.workspace} (${workspace.type}) with: ${counts(summary)}.`,
    );
    for (const line of describeChanges(summary, MAX_DEPLOY_LINES)) say.out(line);
    say.out("Nothing was changed. Run it again without --preview to deploy.");
    if (values.json) {
      io.out(JSON.stringify({ preview: true, workspace: values.workspace, summary }));
    }
    return;
  }

  const uploaded = await request(settings.url, `${base}/bundles`, settings.token, {
    method: "POST",
    body: bundle,
  });
  if (uploaded.status >= 300) throw refusal(uploaded, "upload the bundle");
  const deployed = await request(settings.url, `${base}/deployments`, settings.token, {
    method: "POST",
    body: {
      bundleId: uploaded.body.id,
      ...(message ? { message } : {}),
      ...(carried.length > 0 ? { settleDrafts: carried } : {}),
      ...(values["allow-delete"]?.length ? { allowDelete: values["allow-delete"] } : {}),
      ...(values.force ? { force: true } : {}),
    },
  });
  if (deployed.status >= 300) throw refusal(deployed, `deploy to ${values.workspace}`);
  say.out(
    `Deployed version ${deployed.body.bundleVersion} to ${values.workspace} (${workspace.type}): ` +
      `${counts(deployed.body.summary)}.`,
  );
  for (const line of describeChanges(deployed.body.summary, MAX_DEPLOY_LINES)) say.out(line);
  const settled = (deployed.body.draftsSettled ?? []) as string[];
  if (settled.length > 0) {
    say.out(
      `${settled.length} console ${settled.length === 1 ? "draft" : "drafts"} it carried ${settled.length === 1 ? "is" : "are"} cleared: ${settled.join(", ")}.`,
    );
  }
  if (pulled && carried.length > 0) {
    await writeFile(
      pulledFile(directory),
      `${JSON.stringify({ ...pulled, drafts: {} }, null, 2)}\n`,
    );
  }
  if (values.json) {
    io.out(
      JSON.stringify({
        workspace: values.workspace,
        type: workspace.type,
        version: deployed.body.bundleVersion,
        summary: deployed.body.summary,
        draftsSettled: settled,
        ...(message ? { message } : {}),
      }),
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
    options: {
      ...placesOption,
      ...targetOptions,
      port: { type: "string" as const },
      "no-strict": { type: "boolean" as const },
      widgets: { type: "boolean" as const },
    },
  });
  const port = values.port === undefined ? 5174 : wholeNumber("--port", values.port, 1, 65535);
  // A repository of widgets and no app, or --widgets, is previewed without an instance.
  if (values.widgets || positionals[0] === undefined) {
    const places = buildOptionsOf(values);
    const found = await widgetsOf(places);
    const apps =
      values.widgets || found.length === 0
        ? 1
        : (await appSources(places)).length + (await siteApps(places)).length;
    if (values.widgets || (found.length > 0 && apps === 0)) {
      const preview = await startWidgetServer({ ...places, port });
      io.out(`${found.length} widget${found.length === 1 ? "" : "s"} previewed at ${preview.url}`);
      io.out(
        "Each runs in the sandboxed frame and under the content policy it has once deployed, given the data of its fixture.json. A saved file rebuilds it. Press Ctrl+C to stop.",
      );
      await new Promise<void>((done) => {
        process.once("SIGINT", done);
        process.once("SIGTERM", done);
      });
      await preview.close();
      return;
    }
  }
  const settings = await loadSettings(io.env);
  const { workspace, tenant } = await locate(settings, values.tenant, values.workspace);
  const me = await whoami(settings);
  // The editor's types follow the definitions from the first start, as they do on each rebuild.
  await buildRepository({ ...buildOptionsOf(values), withoutAppSources: true })
    .then((built) => writeEnvTypes(resolve(values.dir ?? "."), built.bundle.manifests))
    .catch(() => undefined);
  const server = await startDevServer({
    ...buildOptionsOf(values),
    app: positionals[0],
    port,
    strict: values["no-strict"] !== true,
    instance: settings,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name ?? tenant.slug },
    workspace: { id: workspace.id, slug: workspace.slug },
    principal: me.principal,
  });
  io.out(`${server.app.path} is at ${server.url}`);
  io.out(
    values["no-strict"]
      ? "The page is served without Volvel's content policy (--no-strict), so it may do what a deployed app cannot."
      : "The page is served under Volvel's content policy: no inline script, nothing from another site. A browser's console says what it refused; --no-strict turns this off.",
  );
  io.out(
    `It reads and writes ${values.tenant}/${values.workspace} on ${settings.url}, as ${describe(me.principal)}. Press Ctrl+C to stop.`,
  );
  await new Promise<void>((done) => {
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
  await server.close();
}

async function promote(args: string[], io: Io): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      ...targetOptions,
      ...allowDeleteOption,
      ...jsonOption,
      ...directoryOption,
      message: { type: "string" as const },
      preview: { type: "boolean" as const },
      "confirm-breaking": { type: "boolean" as const },
    },
  });
  const settings = await loadSettings(io.env);
  const say = spoken(io, values.json);
  const message = await messageFor(values.message, resolve(values.dir ?? "."), io.env);
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
  say.out(
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
  const breaking = (summary.breaking ?? []) as { message: string }[];
  if (values.preview) {
    say.out(`Promoting would leave ${where} with: ${counts(summary)}.`);
    for (const line of describeChanges(summary)) say.out(line);
    const needsConfirmation =
      breaking.length > 0 && target.type === "production" && !values["confirm-breaking"];
    if (needsConfirmation) {
      io.err(
        "Promoting would be refused: it changes a name that something outside calls. Nothing was changed. Run it again without --preview and with --confirm-breaking to promote.",
      );
      if (values.json) io.out(JSON.stringify({ preview: true, target, summary, refused: true }));
      return 4;
    }
    say.out("Nothing was changed. Run it again without --preview to promote.");
    if (values.json) io.out(JSON.stringify({ preview: true, target, summary }));
    return 0;
  }
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
      ...(message ? { message } : {}),
    },
  });
  if (promoted.status >= 300) throw refusal(promoted, `promote to ${target.slug}`);
  say.out(
    `Promoted to ${where} as version ${promoted.body.bundleVersion}: ${counts(promoted.body.summary)}.`,
  );
  for (const line of describeChanges(promoted.body.summary)) say.out(line);
  // The release branch is committed after the promotion and never undoes it, so a failure is a warning.
  const release = promoted.body.release as
    | { status: string; branch: string | null; problem?: string }
    | undefined;
  if (release?.status === "done" && release.branch) {
    say.out(`Committed to the release branch ${release.branch}.`);
  } else if (release?.status === "failed") {
    io.err(
      `Warning: the promotion is done, but Git sync did not get the release${release.branch ? ` (${release.branch})` : ""}: ${release.problem ?? "no reason was given"}. Commit it again from Git sync in the console.`,
    );
  }
  if (values.json) {
    io.out(
      JSON.stringify({
        target,
        version: promoted.body.bundleVersion,
        summary: promoted.body.summary,
        ...(release ? { release } : {}),
        ...(message ? { message } : {}),
      }),
    );
  }
  return 0;
}

/** Puts an earlier version of the code back: it is deployed again, as a deploy of that version. */
async function rollback(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { ...targetOptions, ...jsonOption, message: { type: "string" as const } },
  });
  const [wanted] = positionals;
  if (!wanted || !/^\d+$/.test(wanted)) {
    throw new CliError(
      "Say which version to go back to: volvel rollback <version> --tenant <slug> --workspace <slug>. `volvel runs` and the console's Versions list name them.",
    );
  }
  const version = Number(wanted);
  const settings = await loadSettings(io.env);
  const { base, workspace } = await locate(settings, values.tenant, values.workspace);
  const listed = await request(settings.url, `${base}/bundles`, settings.token);
  if (listed.status !== 200) throw refusal(listed, "list the versions");
  const versions = (listed.body.items as { id: string; version: number; active?: boolean }[]).sort(
    (a, b) => b.version - a.version,
  );
  const chosen = versions.find((one) => one.version === version);
  if (!chosen) {
    throw new CliError(
      `${values.workspace} has no version ${version} among its newest ${versions.length}. It has ${
        versions.length === 0
          ? "none"
          : `${versions
              .slice(0, 10)
              .map((one) => one.version)
              .join(", ")}${versions.length > 10 ? ", and older ones" : ""}`
      }.`,
    );
  }
  if (chosen.active) {
    throw new CliError(
      `Version ${version} is the one ${values.workspace} runs now. Nothing was changed.`,
    );
  }
  const message =
    (await messageFor(values.message, resolve("."), io.env)) ?? `Went back to version ${version}`;
  const deployed = await request(settings.url, `${base}/deployments`, settings.token, {
    method: "POST",
    body: { bundleId: chosen.id, message },
  });
  if (deployed.status >= 300) throw refusal(deployed, `go back to version ${version}`);
  if (values.json) {
    io.out(
      JSON.stringify({
        workspace: values.workspace,
        type: workspace.type,
        version: deployed.body.bundleVersion,
        restoredFrom: version,
        summary: deployed.body.summary,
        message,
      }),
    );
    return 0;
  }
  // Going back to a version whose console resources differ from today's makes a new version.
  io.out(
    deployed.body.bundleVersion === version
      ? `${values.workspace} (${workspace.type}) runs version ${version} again: ${counts(deployed.body.summary)}.`
      : `${values.workspace} (${workspace.type}) runs what version ${version} had, as version ${deployed.body.bundleVersion}: ${counts(deployed.body.summary)}.`,
  );
  for (const line of describeChanges(deployed.body.summary, MAX_DEPLOY_LINES)) io.out(line);
  return 0;
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
    }).catch(() => {
      throw new CliError(
        `Could not reach ${settings.url}. Check the URL and that the instance is running.`,
      );
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
        : "Its custom tables are in Volvel's own database.",
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
  const older = values["older-than"];
  const olderThanSeconds = older === undefined ? undefined : wholeNumber("--older-than", older, 1);
  const settings = await loadSettings(io.env);
  const { base } = await locate(settings, values.tenant, values.workspace);
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
  io.out(`Canceled ${total} ${values.all ? "" : "queued "}run${total === 1 ? "" : "s"}.`);
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
  io.out(`Canceled ${flows} flow run${flows === 1 ? "" : "s"}.`);
}

async function runs(args: string[], io: Io) {
  const { values, positionals } = parseArgs({
    args,
    options: { ...targetOptions, ...jsonOption, script: { type: "string" } },
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
    if (values.json) {
      io.out(JSON.stringify({ items }));
      return;
    }
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
  if (values.json) {
    const lines = await request(settings.url, `${base}/runs/${id}/logs?limit=1000`, settings.token);
    io.out(JSON.stringify({ run, logs: lines.body?.items ?? [] }));
    return;
  }
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

/** Runs a script or flow on the platform from this build, in a dev workspace, and follows it. */
async function runRemote(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      ...placesOption,
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
  const built = await buildRepository(buildOptionsOf(values));
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

/** `instance triggers [pause [--reason <text>]|resume]`: the operator's emergency stop. */
async function instanceCommand(rest: string[], io: Io): Promise<void> {
  const [area, action, ...more] = rest;
  if (area !== "triggers" || (action !== undefined && action !== "pause" && action !== "resume")) {
    throw new CliError(
      "Use: volvel instance triggers, to see where they stand, or volvel instance triggers pause|resume.",
    );
  }
  const settings = await loadSettings(io.env);
  let reply: ApiReply;
  if (action === undefined) {
    reply = await request(settings.url, "/instance/triggers", settings.token);
    if (reply.status !== 200) throw refusal(reply, "read the instance's triggers");
  } else {
    const { values } = parseArgs({ args: more, options: { reason: { type: "string" as const } } });
    const paused = action === "pause";
    reply = await request(settings.url, "/instance/triggers", settings.token, {
      method: "PUT",
      body: { paused, ...(paused && values.reason ? { reason: values.reason } : {}) },
    });
    if (reply.status !== 200) throw refusal(reply, `${action} the instance's triggers`);
  }
  const state = reply.body as { paused: boolean; reason: string | null; byEnvironment: boolean };
  if (!state.paused) {
    io.out(action === "resume" ? "Triggers are running again." : "Triggers are running.");
    return;
  }
  io.out(
    action === "pause"
      ? "Every trigger is paused. Runs already queued or going carry on."
      : "Every trigger is paused.",
  );
  if (state.reason) io.out(`Why: ${state.reason}`);
  if (state.byEnvironment) {
    io.out("TRIGGERS_PAUSED is set where the instance runs: unset it and restart to resume.");
  }
}

/** What each command does. One for each name in `COMMANDS`, and none besides: the types hold it to that. */
const HANDLERS: Record<CommandName, (rest: string[], io: Io) => Promise<number>> = {
  login: async (rest, io) => {
    await login(rest, io);
    return 0;
  },
  whoami: async (rest, io) => {
    const { values } = parseArgs({ args: rest, options: jsonOption });
    const settings = await loadSettings(io.env);
    const me = await whoami(settings);
    if (values.json) {
      io.out(JSON.stringify({ url: settings.url, principal: me.principal, tenants: me.tenants }));
      return 0;
    }
    io.out(`${describe(me.principal)} on ${settings.url}`);
    io.out(
      me.tenants.length > 0
        ? `Tenants: ${me.tenants.map((tenant) => `${tenant.name} (${tenant.slug})`).join(", ")}`
        : "Tenants: none",
    );
    return 0;
  },
  status: async (rest, io) => {
    const { values } = parseArgs({ args: rest, options: jsonOption });
    const url = await loadUrl(io.env);
    const [instance, ready] = await Promise.all([
      request(url, "/instance"),
      request(url, "/readyz"),
    ]);
    if (instance.status !== 200) throw new CliError(`${url} answered ${instance.status}.`);
    const failing = Object.entries((ready.body?.checks ?? {}) as Record<string, { ok: boolean }>)
      .filter(([, check]) => !check.ok)
      .map(([name]) => name);
    if (values.json) {
      io.out(
        JSON.stringify({
          url,
          version: instance.body.coreVersion,
          migrationLevel: instance.body.migrationLevel,
          ready: failing.length === 0,
          failing,
        }),
      );
      return failing.length === 0 ? 0 : 1;
    }
    io.out(`${url}`);
    io.out(`Version ${instance.body.coreVersion}, migration level ${instance.body.migrationLevel}`);
    io.out(failing.length === 0 ? "Ready" : `Not ready: ${failing.join(", ")} failing`);
    if (ready.body?.checks?.database?.readOnly) {
      io.out(
        "Read only: the database takes no writes, such as when its disk is full. Reads are served; every change is refused with 503 until it takes writes again.",
      );
    }
    return failing.length === 0 ? 0 : 1;
  },
  logout: async (_rest, io) => {
    const path = settingsPath(io.env);
    const had = await stat(path).then(
      () => true,
      () => false,
    );
    await rm(path, { force: true });
    io.out(
      had
        ? `Signed out: the saved key is removed from ${path}.`
        : "Nothing was saved here, so there is nothing to sign out of.",
    );
    return 0;
  },
  profiles: async (_rest, io) => {
    const { readdir } = await import("node:fs/promises");
    const names = (await readdir(settingsFolder(io.env)).catch(() => [] as string[]))
      .map((file) => /^profile-(.+)\.json$/.exec(file)?.[1])
      .filter((name): name is string => name !== undefined)
      .sort();
    const lines: string[] = [];
    for (const name of ["", ...names]) {
      const saved = await savedSettings({ ...io.env, VOLVEL_PROFILE: name });
      if (name === "" && !saved.url) continue;
      lines.push(
        `${name === "" ? "(none)".padEnd(12) : name.padEnd(12)} ${saved.url ?? "not signed in"}`,
      );
    }
    io.out(
      lines.length > 0
        ? lines.join("\n")
        : "No sign-in is saved. Run: volvel login --url <url> --token <api key>",
    );
    return 0;
  },
  instance: async (rest, io) => {
    await instanceCommand(rest, io);
    return 0;
  },
  init: async (rest, io) => {
    await init(rest, io);
    return 0;
  },
  widget: async (rest, io) => {
    await widgetCommand(rest, io);
    return 0;
  },
  build: async (rest, io) => {
    await build(rest, io);
    return 0;
  },
  schemas: async (rest, io) => {
    await schemas(rest, io);
    return 0;
  },
  types: async (rest, io) => {
    await types(rest, io);
    return 0;
  },
  convert: async (rest, io) => {
    await convert(rest, io);
    return 0;
  },
  run: async (rest, io) => {
    if (rest.includes("--remote")) return await runRemote(rest, io);
    await runLocally(rest, io);
    return 0;
  },
  logs: (rest, io) => logs(rest, io),
  pull: (rest, io) => pull(rest, io),
  dev: async (rest, io) => {
    await dev(rest, io);
    return 0;
  },
  deploy: async (rest, io) => {
    await deploy(rest, io);
    return 0;
  },
  promote: (rest, io) => promote(rest, io),
  rollback: (rest, io) => rollback(rest, io),
  tenant: async (rest, io) => {
    await tenant(rest, io);
    return 0;
  },
  runs: async (rest, io) => {
    if (rest[0] === "cancel") await cancelInBulk(rest.slice(1), io);
    else await runs(rest, io);
    return 0;
  },
};

/** Runs the command line. Returns the process exit code. */
export async function run(given: string[], first: Io): Promise<number> {
  let argv = given;
  let io = first;
  try {
    // `--profile <name>` before the command, or anywhere after it, picks the saved sign-in.
    const at = argv.indexOf("--profile");
    if (at >= 0) {
      const name = argv[at + 1];
      if (!name || name.startsWith("-")) throw new CliError("--profile needs a name.");
      argv = [...argv.slice(0, at), ...argv.slice(at + 2)];
      io = { ...first, env: { ...first.env, VOLVEL_PROFILE: name } };
    }
    const [command, ...rest] = argv;
    if (command === undefined || command === "help" || command === "--help" || command === "-h") {
      io.out(usage());
      return 0;
    }
    if (command === "--version" || command === "-v" || command === "version") {
      io.out(`volvel ${await cliVersion()}`);
      return 0;
    }
    if (Object.hasOwn(HANDLERS, command) && (rest.includes("--help") || rest.includes("-h"))) {
      io.out(usage(command as CommandName));
      return 0;
    }
    if (!Object.hasOwn(HANDLERS, command)) {
      io.err(`Unknown command "${command}".\n\n${usage()}`);
      return 2;
    }
    return await HANDLERS[command as CommandName](rest, io);
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
    // Anything else is a fault of the CLI or a reply it did not expect: one line, and the trace on request.
    const fault = error as Error;
    io.err(
      io.env.VOLVEL_DEBUG
        ? (fault.stack ?? String(fault))
        : `Unexpected: ${fault.message ?? String(fault)}. Run again with VOLVEL_DEBUG=1 for the trace.`,
    );
    return 1;
  }
}

/** The version of this CLI, from the package.json beside `dist`. */
async function cliVersion(): Promise<string> {
  try {
    const text = await readFile(new URL("../package.json", import.meta.url), "utf8");
    return (JSON.parse(text) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}
