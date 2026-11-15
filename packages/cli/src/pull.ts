/**
 * `platform pull`: the workspace's console resources, drafts included, written
 * as the files `platform/` holds, so a change made in the console reaches the
 * repository. What was written is remembered, so a file changed here since is
 * never overwritten without `--force`.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { RESOURCE_FOLDER } from "@vynxlabs/manifest";
import { type Io, loadSettings, locate, refusal, request } from "./cli.js";

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
}

/** Where a repository keeps what its last pull wrote. */
export const pulledFile = (directory: string): string =>
  join(directory, ".platform", "pulled.json");

export async function readPulled(directory: string): Promise<Pulled | undefined> {
  const text = await readText(pulledFile(directory));
  return text ? (JSON.parse(text) as Pulled) : undefined;
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
    else if (/\.(yaml|ts)$/.test(entry.name)) found.push(relative(root, full).split(sep).join("/"));
  }
  return found;
}

const readText = (file: string) => readFile(file, "utf8").catch(() => undefined);
/** A resource's path from one of its files: `orders/sync.script.ts` → `orders/sync`. */
const stem = (file: string) => file.replace(/\.[a-z_]+\.(yaml|ts)$/, "");

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
): Promise<PullReport> {
  const before: Pulled | undefined = await readText(stateFile).then((text) =>
    text ? (JSON.parse(text) as Pulled) : undefined,
  );
  // What another workspace's pull wrote says nothing about this one's files.
  const last = before?.workspace === workspace ? before.files : {};
  const report: PullReport = { written: [], removed: [], unchanged: 0, kept: [] };
  const next: Record<string, string> = {};
  const wanted = new Map(files.map((file) => [file.path, file.content]));

  for (const [path, content] of wanted) {
    const target = join(folder, ...path.split("/"));
    const here = await readText(target);
    if (here === content) {
      report.unchanged += 1;
      next[path] = sha(content);
      continue;
    }
    const untouched = here === undefined || last[path] === sha(here);
    if (!untouched && !force) {
      report.kept.push({ path, why: "changed here since it was pulled" });
      if (last[path]) next[path] = last[path];
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    next[path] = sha(content);
    report.written.push({ path, how: here === undefined ? "new" : "updated" });
  }
  // What the console no longer has goes, unless it was changed here.
  for (const path of await walk(folder)) {
    if (wanted.has(path)) continue;
    const here = (await readText(join(folder, ...path.split("/")))) ?? "";
    if (last[path] === sha(here) || force) {
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
  // A draft whose file was kept as it is here was not taken, and a deploy must not clear it.
  const keptStems = new Set(report.kept.map((one) => stem(one.path)));
  const taken = Object.fromEntries(
    drafts
      .filter((draft) => !keptStems.has(draft.path))
      .map((draft) => [draft.path, draft.revision]),
  );
  await mkdir(dirname(stateFile), { recursive: true });
  const state: Pulled = { workspace, at: new Date().toISOString(), files: next, drafts: taken };
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  return report;
}

export async function pull(args: string[], io: Io): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      dir: { type: "string" },
      tenant: { type: "string" },
      workspace: { type: "string" },
      deployed: { type: "boolean" },
      force: { type: "boolean" },
    },
  });
  const settings = await loadSettings(io.env);
  const { base, workspace } = await locate(settings, values.tenant, values.workspace);
  const reply = await request(
    settings.url,
    `${base}/resource-files${values.deployed ? "?drafts=false" : ""}`,
    settings.token,
  );
  if (reply.status !== 200) throw refusal(reply, "read the workspace's console resources");
  const { files, drafts, bundleVersion } = reply.body as {
    files: { path: string; content: string }[];
    drafts: { path: string; revision: number; deleted: boolean }[];
    bundleVersion: number | null;
  };
  const directory = resolve(values.dir ?? ".");
  const folder = join(directory, RESOURCE_FOLDER);
  const report = await pullInto(
    folder,
    pulledFile(directory),
    workspace.id,
    files,
    values.force === true,
    drafts,
  );
  for (const file of report.written)
    io.out(`  ${file.how.padEnd(8)} ${RESOURCE_FOLDER}/${file.path}`);
  for (const path of report.removed) io.out(`  removed  ${RESOURCE_FOLDER}/${path}`);
  const from = [
    bundleVersion !== null ? `version ${bundleVersion}` : "nothing deployed",
    values.deployed ? "" : `${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"}`,
  ]
    .filter(Boolean)
    .join(" and ");
  io.out(
    `Pulled ${files.length} ${files.length === 1 ? "file" : "files"} from ${values.workspace} (${from}): ` +
      `${report.written.filter((one) => one.how === "new").length} new, ` +
      `${report.written.filter((one) => one.how === "updated").length} updated, ` +
      `${report.removed.length} removed, ${report.unchanged} unchanged.`,
  );
  if (report.kept.length > 0) {
    io.err(
      [
        `${report.kept.length} ${report.kept.length === 1 ? "file was" : "files were"} not overwritten:`,
        ...report.kept.map((one) => `  ${RESOURCE_FOLDER}/${one.path}: ${one.why}`),
        "Keep your change, or run pull again with --force to take the console's.",
      ].join("\n"),
    );
    return 1;
  }
  if (files.length > 0) {
    io.out(
      `${RESOURCE_FOLDER}/ holds the workspace's whole set of console resources: a deploy of this repository replaces the set with it.`,
    );
  }
  return 0;
}
