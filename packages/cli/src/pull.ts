/**
 * `volvel pull`: the workspace's console resources, drafts included, written
 * as the files `platform/` holds, so a change made in the console reaches the
 * repository. A resource whose file the repository keeps somewhere else is
 * written there. What was written is remembered, so a file changed here since
 * is never overwritten without `--force`.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  isFolderResourceFile,
  ontoWritten,
  RESOURCE_FOLDER,
  resourceOfFile,
  sameResourceFile,
} from "@volvel/manifest";
import { readRepositoryConfig } from "./build.js";
import { CliError, type Io, loadSettings, locate, refusal, request } from "./cli.js";

/** What the last pull wrote, by path under `platform/`. */
export interface Pulled {
  workspace: string;
  at: string;
  files: Record<string, string>;
  /**
   * The console's drafts this folder now holds, at the revision taken: a
   * deploy of it says so, and the drafts are cleared.
   */
  drafts?: Record<string, number>;
  /** What it wrote outside `platform/`, by path from the repository's root. */
  elsewhere?: Record<string, string>;
}

/** Where a repository keeps what its last pull wrote. */
export const pulledFile = (directory: string): string =>
  join(directory, ".platform", "pulled.json");

export async function readPulled(directory: string): Promise<Pulled | undefined> {
  return readState(pulledFile(directory));
}

/** What the last pull wrote. A record that cannot be read is said so, with how to start it afresh. */
async function readState(file: string): Promise<Pulled | undefined> {
  const text = await readText(file);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as Pulled;
  } catch {
    throw new CliError(
      `${file} is not valid JSON, so the files the last pull wrote are not known. Delete it and run pull again: files that differ will be kept, and pull --force takes the console's.`,
    );
  }
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

async function walk(root: string, dir = root): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(root, full)));
    else {
      const file = relative(root, full).split(sep).join("/");
      if (isFolderResourceFile(file)) found.push(file);
    }
  }
  return found;
}

const readText = (file: string) => readFile(file, "utf8").catch(() => undefined);

/** What to write over a file that is here: the change, put into the file as it was written. */
const asWritten = (path: string, here: string | undefined, content: string) =>
  here !== undefined && path.endsWith(".yaml") ? ontoWritten(here, content) : content;

export interface PullReport {
  written: { path: string; how: "new" | "updated" }[];
  removed: string[];
  unchanged: number;
  /** Changed here and not overwritten. */
  kept: { path: string; why: string }[];
}

/** Works out and does what a pull changes in `folder`. Exported for its tests. */
export async function pullInto(
  folder: string,
  stateFile: string,
  workspace: string,
  files: { path: string; content: string }[],
  force: boolean,
  drafts: { path: string; revision: number }[] = [],
  /**
   * The files of resources the repository keeps outside `platform/`, by path from
   * `directory`. Each is written where it is. One that already says the same thing is
   * left as its author wrote it.
   */
  elsewhere?: {
    directory: string;
    files: { path: string; content: string; resource?: string }[];
  },
): Promise<PullReport> {
  const before = await readState(stateFile);
  // What another workspace's pull wrote says nothing about this one's files.
  const last = before?.workspace === workspace ? before.files : {};
  const report: PullReport = { written: [], removed: [], unchanged: 0, kept: [] };
  const next: Record<string, string> = {};
  const wanted = new Map(files.map((file) => [file.path, file.content]));

  for (const [path, content] of wanted) {
    const target = join(folder, ...path.split("/"));
    const here = await readText(target);
    // A file that says the same is left as it is written here, comments and all.
    if (here !== undefined && sameResourceFile(path, here, content)) {
      report.unchanged += 1;
      next[path] = sha(here);
      continue;
    }
    const untouched = here === undefined || last[path] === sha(here);
    if (!untouched && !force) {
      report.kept.push({ path, why: "changed here since it was pulled" });
      if (last[path]) next[path] = last[path];
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    const writing = asWritten(path, here, content);
    await writeFile(target, writing);
    next[path] = sha(writing);
    report.written.push({ path, how: here === undefined ? "new" : "updated" });
  }
  // What the console no longer has goes, unless it was changed here.
  for (const path of await walk(folder)) {
    if (wanted.has(path)) continue;
    const here = (await readText(join(folder, ...path.split("/")))) ?? "";
    // Only a file a pull wrote is the pull's to remove, `--force` or not.
    if (last[path] === sha(here) || (force && path in last)) {
      await rm(join(folder, ...path.split("/")));
      report.removed.push(path);
    } else {
      report.kept.push({
        path,
        why: last[path]
          ? "removed in the console, and changed here since it was pulled"
          : "not in the console: a deploy of this folder would add it",
      });
    }
  }
  const lastElsewhere = before?.workspace === workspace ? (before.elsewhere ?? {}) : {};
  const nextElsewhere: Record<string, string> = {};
  const keptResources = new Set<string>();
  for (const { path, content, resource } of elsewhere?.files ?? []) {
    const target = join(elsewhere?.directory ?? "", ...path.split("/"));
    const here = await readText(target);
    if (here !== undefined && sameResourceFile(path, here, content)) {
      report.unchanged += 1;
      nextElsewhere[path] = sha(here);
      continue;
    }
    const untouched = here === undefined || lastElsewhere[path] === sha(here);
    if (!untouched && !force) {
      report.kept.push({
        path: `/${path}`,
        why: lastElsewhere[path]
          ? "changed here since it was pulled"
          : "changed in the console, and not the same here",
      });
      if (resource) keptResources.add(resource);
      if (lastElsewhere[path]) nextElsewhere[path] = lastElsewhere[path];
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    const writing = asWritten(path, here, content);
    await writeFile(target, writing);
    nextElsewhere[path] = sha(writing);
    report.written.push({ path: `/${path}`, how: here === undefined ? "new" : "updated" });
  }
  // Only what a pull wrote is ever removed out there: the rest is the repository's own.
  for (const path of Object.keys(lastElsewhere)) {
    if (path in nextElsewhere || (elsewhere?.files ?? []).some((file) => file.path === path)) {
      continue;
    }
    const target = join(elsewhere?.directory ?? "", ...path.split("/"));
    const here = await readText(target);
    if (here === undefined) continue;
    if (lastElsewhere[path] === sha(here) || force) {
      await rm(target);
      report.removed.push(`/${path}`);
    } else {
      report.kept.push({
        path: `/${path}`,
        why: "removed or moved in the console, and changed here since it was pulled",
      });
      nextElsewhere[path] = lastElsewhere[path] as string;
    }
  }
  // A draft whose file was kept as it is here was not taken, and a deploy must not clear it.
  const keptStems = new Set([
    ...report.kept.map((one) => resourceOfFile(one.path)),
    ...keptResources,
  ]);
  const taken = Object.fromEntries(
    drafts
      .filter((draft) => !keptStems.has(draft.path))
      .map((draft) => [draft.path, draft.revision]),
  );
  await mkdir(dirname(stateFile), { recursive: true });
  const state: Pulled = {
    workspace,
    at: new Date().toISOString(),
    files: next,
    drafts: taken,
    ...(Object.keys(nextElsewhere).length > 0 ? { elsewhere: nextElsewhere } : {}),
  };
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  return report;
}

export async function pull(args: string[], io: Io): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      dir: { type: "string" },
      resources: { type: "string" },
      tenant: { type: "string" },
      workspace: { type: "string" },
      deployed: { type: "boolean" },
      force: { type: "boolean" },
    },
  });
  const directory = resolve(values.dir ?? ".");
  // A file under one of the repository's roots is named for its path, and is not made to say it.
  const config = await readRepositoryConfig(directory);
  const resources = values.resources ?? config.resources ?? RESOURCE_FOLDER;
  const settings = await loadSettings(io.env);
  const { base, workspace } = await locate(settings, values.tenant, values.workspace);
  const query = new URLSearchParams({
    ...(values.deployed ? { drafts: "false" } : {}),
    ...(config.roots.length > 0 ? { roots: config.roots.join(",") } : {}),
  }).toString();
  const reply = await request(
    settings.url,
    `${base}/resource-files${query ? `?${query}` : ""}`,
    settings.token,
  );
  if (reply.status !== 200) throw refusal(reply, "read the workspace's console resources");
  const { files, elsewhere, drafts, bundleVersion } = reply.body as {
    files: { path: string; content: string }[];
    /** Not sent by a server from before files were kept anywhere. */
    elsewhere?: { path: string; content: string; resource?: string }[];
    drafts: { path: string; revision: number; deleted: boolean }[];
    bundleVersion: number | null;
  };
  const folder = join(directory, resources);
  // From the repository's root: a file in the folder, or one kept anywhere, written `/so`.
  const shown = (path: string) => (path.startsWith("/") ? path.slice(1) : `${resources}/${path}`);
  const report = await pullInto(
    folder,
    pulledFile(directory),
    workspace.id,
    files,
    values.force === true,
    drafts,
    { directory, files: elsewhere ?? [] },
  );
  for (const file of report.written) io.out(`  ${file.how.padEnd(8)} ${shown(file.path)}`);
  for (const path of report.removed) io.out(`  removed  ${shown(path)}`);
  const from = [
    bundleVersion !== null ? `version ${bundleVersion}` : "nothing deployed",
    values.deployed ? "" : `${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"}`,
  ]
    .filter(Boolean)
    .join(" and ");
  io.out(
    `Pulled ${files.length + (elsewhere?.length ?? 0)} ${files.length + (elsewhere?.length ?? 0) === 1 ? "file" : "files"} from ${values.workspace} (${from}): ` +
      `${report.written.filter((one) => one.how === "new").length} new, ` +
      `${report.written.filter((one) => one.how === "updated").length} updated, ` +
      `${report.removed.length} removed, ${report.unchanged} unchanged.`,
  );
  if (report.kept.length > 0) {
    io.err(
      [
        `${report.kept.length} ${report.kept.length === 1 ? "file was" : "files were"} not overwritten:`,
        ...report.kept.map((one) => `  ${shown(one.path)}: ${one.why}`),
        "Keep your change, or run pull again with --force to take the console's.",
      ].join("\n"),
    );
    return 1;
  }
  if (files.length > 0) {
    io.out(
      `${resources}/ holds the workspace's whole set of console resources: a deploy of this repository replaces the set with it.`,
    );
  }
  return 0;
}
