import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  isTenantFile,
  ontoWritten,
  parseTenantFiles,
  type ResourceFile,
  renderTenantFiles,
  sameResourceFile,
  TENANT_FOLDER,
  type TenantResource,
} from "@volvel/manifest";
import type { ApiReply, Io, Settings } from "./cli.js";
import { CliError } from "./errors.js";

/** Folders that are never a repository's own: nothing in them is read. */
const SKIPPED = new Set(["node_modules", "dist", "build"]);

/**
 * The files of the tenant's access, wherever the repository keeps them: any
 * file named `<key>.<kind>.yaml` for one of the kinds a tenant's access is made
 * of. Paths are relative to the repository.
 */
export async function tenantFiles(directory: string): Promise<ResourceFile[]> {
  const files: ResourceFile[] = [];
  const walk = async (folder: string) => {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !SKIPPED.has(entry.name)) await walk(path);
      } else if (entry.isFile()) {
        const name = relative(directory, path).split(sep).join("/");
        if (isTenantFile(name)) files.push({ path: name, content: await readFile(path, "utf8") });
      }
    }
  };
  await walk(directory);
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** What the repository says the tenant's access is. */
export async function readAccess(directory: string): Promise<TenantResource[]> {
  const parsed = parseTenantFiles(await tenantFiles(directory));
  if (parsed.problems.length > 0) {
    throw new CliError(
      ["The tenant's access cannot be read.", ...parsed.problems.map((one) => `  - ${one}`)].join(
        "\n",
      ),
    );
  }
  return parsed.resources;
}

/**
 * What makes a resource the one it is. A binding is what it gives to whom, and
 * where: the name of its file is only a name for that.
 */
const identity = (resource: TenantResource): string => {
  if (resource.kind !== "tenant_binding") return `${resource.kind} ${resource.key}`;
  const principal = resource.body.principal as { type?: string; key?: string } | undefined;
  return `tenant_binding ${resource.body.role} ${principal?.type} ${principal?.key} ${resource.body.workspace ?? ""}`;
};

interface Summary {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  changes: { change: string; kind: string; key: string; label: string }[];
  warnings: string[];
}
const counts = (summary: Summary) =>
  `${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted, ${summary.unchanged} unchanged`;
const lines = (summary: Summary) => [
  ...summary.changes.map(
    (one) =>
      `  ${one.change.padEnd(8)} ${one.kind.padEnd(16)} ${one.key}${one.label && one.label !== one.key ? `  (${one.label})` : ""}`,
  ),
  ...summary.warnings.map((warning) => `  Note: ${warning}`),
];

type Call = (path: string, send?: { method: string; body?: unknown }) => Promise<ApiReply>;

/**
 * `volvel tenant plan | release | pull | releases | approve | decline |
 * withdraw | rollback`: the tenant's groups, service accounts, roles and what
 * they are given, as the repository has them.
 */
export async function tenantAccess(
  action: string,
  args: string[],
  io: Io,
  settings: Settings,
  api: {
    request: (
      url: string,
      path: string,
      token?: string,
      send?: { method: string; body?: unknown },
    ) => Promise<ApiReply>;
    refusal: (reply: ApiReply, doing: string) => CliError;
    findTenant: (settings: Settings, slug: string) => Promise<{ id: string; slug: string }>;
  },
): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      tenant: { type: "string" as const },
      dir: { type: "string" as const },
      message: { type: "string" as const },
      comment: { type: "string" as const },
      "allow-delete": { type: "string" as const, multiple: true as const },
      yes: { type: "boolean" as const },
    },
  });
  if (!values.tenant) throw new CliError("This needs --tenant <slug>.");
  const call: Call = (path, options) => api.request(settings.url, path, settings.token, options);
  const found = await api.findTenant(settings, values.tenant);
  const base = `/tenants/${found.id}/access`;
  const directory = resolve(values.dir ?? ".");
  const allowDelete: string[] = values["allow-delete"] ?? [];

  if (action === "plan" || action === "release") {
    const resources = await readAccess(directory);
    if (resources.length === 0) {
      throw new CliError(
        `No file of the tenant's access was found under ${directory}. They are named <key>.<kind>.yaml, such as ${TENANT_FOLDER}/groups/tech-desk.group.yaml. Run "volvel tenant pull" to write what the tenant has now.`,
      );
    }
    const body = { resources, ...(allowDelete.length > 0 ? { allowDelete } : {}) };
    if (action === "plan") {
      const plan = await call(`${base}/plan`, { method: "POST", body });
      if (plan.status !== 200) throw api.refusal(plan, `plan the access of ${values.tenant}`);
      if (!plan.body.possible) {
        throw new CliError(
          [
            `It cannot be released. ${plan.body.refusal.detail}`,
            ...(plan.body.refusal.errors as { message: string }[]).map(
              (one) => `  - ${one.message}`,
            ),
          ].join("\n"),
        );
      }
      io.out(`Releasing would leave ${values.tenant} with: ${counts(plan.body.summary)}.`);
      for (const line of lines(plan.body.summary)) io.out(line);
      io.out(
        plan.body.waits
          ? "Nothing was changed. This tenant asks for a second person: an access change would wait for one."
          : 'Nothing was changed. Run "volvel tenant release" to do it.',
      );
      return;
    }
    const released = await call(`${base}/releases`, {
      method: "POST",
      body: { ...body, ...(values.message ? { message: values.message } : {}) },
    });
    if (released.status >= 300)
      throw api.refusal(released, `change the access of ${values.tenant}`);
    if (released.status === 202) {
      io.out(
        `Access change ${released.body.number} of ${values.tenant}'s access waits for a second person: ${counts(released.body.summary)}.`,
      );
      for (const line of lines(released.body.summary)) io.out(line);
      io.out(
        `Nothing changed yet. Someone else approves it with: volvel tenant approve ${released.body.number} --tenant ${values.tenant}`,
      );
      return;
    }
    io.out(
      `Changed ${values.tenant}'s access as access change ${released.body.number}: ${counts(released.body.summary)}.`,
    );
    for (const line of lines(released.body.summary)) io.out(line);
    return;
  }

  if (action === "pull") {
    const now = await call(base);
    if (now.status !== 200) throw api.refusal(now, `read the access of ${values.tenant}`);
    const resources = now.body.resources as TenantResource[];
    // A resource the repository already has a file for is written there, wherever that is.
    const existing = new Map<string, string>();
    const here = await tenantFiles(directory);
    for (const file of here) {
      const [one] = parseTenantFiles([file]).resources;
      if (one) existing.set(identity(one), file.path);
    }
    let written = 0;
    for (const resource of resources) {
      const [rendered] = renderTenantFiles([resource]);
      if (!rendered) continue;
      const target = existing.get(identity(resource)) ?? `${now.body.folder}/${rendered.path}`;
      // A file named otherwise than its key says its key, or it would be read as another.
      const named = target.split("/").at(-1)?.split(".")[0] === resource.key;
      const content =
        named || resource.kind === "tenant_binding"
          ? rendered.content
          : `key: ${resource.key}\n${rendered.content}`;
      const before = here.find((one) => one.path === target)?.content;
      // A file that says the same is left as it is written, and a change is written into it:
      // the comments and the order its author gave it stay.
      if (before !== undefined && sameResourceFile(target, before, content)) continue;
      await mkdir(dirname(join(directory, target)), { recursive: true });
      await writeFile(
        join(directory, target),
        before === undefined ? content : ontoWritten(before, content),
      );
      written += 1;
      io.out(`  ${before === undefined ? "new    " : "changed"} ${target}`);
    }
    const files = resources;
    const has = new Set(resources.map(identity));
    const extra = [...existing].filter(([name]) => !has.has(name));
    io.out(
      written === 0
        ? `The repository already has ${values.tenant}'s access as it is: ${files.length} files.`
        : `Wrote ${written} of ${files.length} files of ${values.tenant}'s access.`,
    );
    for (const [, path] of extra) {
      io.out(
        `  ${path} is in the repository and not in the tenant: an access change would make it.`,
      );
    }
    return;
  }

  const list = async () => {
    const releases = await call(`${base}/releases`);
    if (releases.status !== 200) throw api.refusal(releases, "list the access changes");
    return releases.body.items as {
      id: string;
      number: number;
      status: string;
      origin: string;
      message: string | null;
      createdBy: string | null;
      createdAt: string;
      summary: Summary;
    }[];
  };
  if (action === "releases") {
    for (const one of await list()) {
      io.out(
        `${String(one.number).padStart(4)}  ${one.status.replaceAll("_", " ").padEnd(17)} ${one.createdAt.slice(0, 16).replace("T", " ")}  ${(one.createdBy ?? one.origin).padEnd(16)} ${one.message ?? counts(one.summary)}`,
      );
    }
    return;
  }

  if (action === "approval") {
    const which = positionals[0];
    if (which !== undefined && which !== "on" && which !== "off") {
      throw new CliError("Say on or off: volvel tenant approval on|off --tenant <slug>");
    }
    if (which === undefined) {
      const now = await call(base);
      if (now.status !== 200) throw api.refusal(now, `read the access of ${values.tenant}`);
      io.out(
        now.body.approval
          ? `${values.tenant} asks for a second person to approve a change to its access.`
          : `${values.tenant} does not ask for a second person: a change to its access applies at once.`,
      );
      return;
    }
    const set = await call(`${base}/approval`, {
      method: "PUT",
      body: { required: which === "on" },
    });
    if (set.status !== 200) throw api.refusal(set, `turn approval ${which} for ${values.tenant}`);
    io.out(
      which === "on"
        ? `${values.tenant} now asks for a second person to approve a change to its access.`
        : `${values.tenant} no longer asks for a second person: a change to its access applies at once.`,
    );
    return;
  }

  if (["approve", "decline", "withdraw", "rollback"].includes(action)) {
    const number = Number(positionals[0]);
    if (!Number.isInteger(number)) {
      throw new CliError(
        `Say which access change, by its number: volvel tenant ${action} <number>`,
      );
    }
    const release = (await list()).find((one) => one.number === number);
    if (!release)
      throw new CliError(`${values.tenant} has no access change ${number} of its access.`);
    if (action === "rollback") {
      // What going back takes away is said first, and asked about: a group made since is deleted.
      const would = await call(`${base}/releases/${release.id}/rollback`);
      if (would.status !== 200)
        throw api.refusal(would, `read what going back to access change ${number} does`);
      const removes = would.body.removes as { kind: string; key: string; label: string }[];
      const warnings = would.body.warnings as string[];
      if (removes.length > 0) {
        io.out(`Going back to access change ${number} removes what was made since:`);
        for (const one of removes) {
          io.out(
            `  deleted  ${one.kind.padEnd(16)} ${one.key}${one.label && one.label !== one.key ? `  (${one.label})` : ""}`,
          );
        }
      }
      for (const warning of warnings) io.out(`  Note: ${warning}`);
      if (removes.length > 0 && !values.yes) {
        if (!io.confirm) {
          throw new CliError(
            `Nothing was changed. Run it again with --yes to go back to access change ${number} and remove ${removes.length === 1 ? "that" : "those"}.`,
          );
        }
        if (
          !(await io.confirm(`Go back to access change ${number} of ${values.tenant}'s access?`))
        ) {
          io.out("Nothing was changed.");
          return;
        }
      }
      const back = await call(`${base}/releases/${release.id}/rollback`, {
        method: "POST",
        body: {},
      });
      if (back.status >= 300) throw api.refusal(back, `go back to access change ${number}`);
      io.out(
        back.status === 202
          ? `Going back to access change ${number} waits for a second person, as access change ${back.body.number}.`
          : `${values.tenant}'s access is what access change ${number} left, as access change ${back.body.number}: ${counts(back.body.summary)}.`,
      );
      for (const line of lines(back.body.summary)) io.out(line);
      return;
    }
    // Whoever answers sees what it is they are answering.
    if (action === "approve" || action === "decline") {
      io.out(`Access change ${number} of ${values.tenant}'s access: ${counts(release.summary)}.`);
      for (const line of lines(release.summary)) io.out(line);
    }
    const decided = await call(`${base}/releases/${release.id}/decision`, {
      method: "POST",
      body: { decision: action, ...(values.comment ? { comment: values.comment } : {}) },
    });
    if (decided.status >= 300) throw api.refusal(decided, `${action} access change ${number}`);
    io.out(`Access change ${number} of ${values.tenant}'s access is ${decided.body.status}.`);
    return;
  }

  throw new CliError(
    "Usage: volvel tenant plan | release | pull | releases | approve <n> | decline <n> | withdraw <n> | rollback <n> [--yes] | approval [on|off], with --tenant <slug>",
  );
}

export const ACCESS_ACTIONS = [
  "plan",
  "release",
  "pull",
  "releases",
  "approve",
  "decline",
  "withdraw",
  "rollback",
  "approval",
];
