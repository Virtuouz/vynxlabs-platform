import { createReadStream, createWriteStream } from "node:fs";
import { open, rename, rm, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import type { ApiReply, Io, Settings } from "./cli.js";
import { CliError } from "./errors.js";

/** How many times an export that is told to wait is asked for again before the command gives up. */
export const EXPORT_TRIES = 10;
/** Used when the instance says to wait and does not say how long. */
const WAIT_SECONDS = 30;
/** The tar archive ends with two empty blocks. */
const TAR_END = 1024;

interface Api {
  failure: (response: Response, doing: string) => Promise<CliError>;
  refusal: (reply: ApiReply, doing: string) => CliError;
  findTenant: (settings: Settings, slug: string) => Promise<{ id: string; slug: string }>;
  request: (
    url: string,
    path: string,
    token?: string,
    send?: { method: string; body?: unknown },
  ) => Promise<ApiReply>;
}

/** The passphrase for an export file. Kept out of the command line, where it would be visible to others. */
export function passphrase(io: Io): string {
  const value = io.env.VOLVEL_EXPORT_PASSPHRASE;
  if (!value) {
    throw new CliError(
      "Set VOLVEL_EXPORT_PASSPHRASE to the passphrase for the export file. It protects every secret the tenant has: make it long, and pass it on separately from the file.",
    );
  }
  return value;
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const duration = (seconds: number) =>
  seconds < 60
    ? `${Math.round(seconds)} s`
    : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;

/** Counts the bytes that pass, and says so once a second where there is a terminal. */
function counting(io: Io, verb: string, total?: number) {
  const started = Date.now();
  let bytes = 0;
  let shown = 0;
  const show = () => {
    const seconds = Math.max(1, (Date.now() - started) / 1000);
    const of = total ? ` of ${megabytes(total)}` : "";
    io.progress?.(
      `${verb} ${megabytes(bytes)}${of}, ${megabytes(bytes / seconds)}/s, ${duration(seconds)}`,
    );
  };
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (Date.now() - shown >= 1000) {
        shown = Date.now();
        show();
      }
      done(null, chunk);
    },
  });
  return {
    stream,
    bytes: () => bytes,
    seconds: () => (Date.now() - started) / 1000,
    done: () => io.progress?.(""),
  };
}

/** What the instance says its export limits are, from the header it sends with an export. */
export function limitsOf(
  response: Response,
): { maxMinutes: number; stallSeconds: number } | undefined {
  const text = response.headers.get("x-export-limits");
  const maxMinutes = /max-minutes=(\d+)/.exec(text ?? "")?.[1];
  const stallSeconds = /stall-seconds=(\d+)/.exec(text ?? "")?.[1];
  return maxMinutes && stallSeconds
    ? { maxMinutes: Number(maxMinutes), stallSeconds: Number(stallSeconds) }
    : undefined;
}

/** Why an export that was being written stopped, as far as the command can tell. */
export function endedBecause(
  reason: string,
  limits: ReturnType<typeof limitsOf>,
  seconds: number,
  bytes: number,
): CliError {
  const where = `after ${megabytes(bytes)} and ${duration(seconds)}`;
  if (limits && limits.maxMinutes > 0 && seconds >= limits.maxMinutes * 60 - 15) {
    return new CliError(
      `The export was ended ${where}: one export may take ${limits.maxMinutes} minutes on this instance (its setting EXPORT_MAX_MINUTES). Ask whoever runs the instance to raise it, or to set it to 0 for no limit. The partial file was removed.`,
    );
  }
  const stall = limits
    ? ` An export is also ended when its reader takes nothing for ${limits.stallSeconds} seconds (EXPORT_STALL_SECONDS): check that the disk was not full or stuck.`
    : "";
  return new CliError(
    `The export stopped ${where}: ${reason}. It was not ended by the time limit.${stall} The partial file was removed. Nothing is resumed: run it again.`,
  );
}

/** Whether the file ends as a complete archive does: with its two empty blocks. */
async function endsWholly(path: string): Promise<boolean> {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    if (size < TAR_END) return false;
    const end = Buffer.alloc(TAR_END);
    await file.read(end, 0, TAR_END, size - TAR_END);
    return end.every((byte) => byte === 0);
  } finally {
    await file.close();
  }
}

export async function tenantExport(
  args: string[],
  io: Io,
  settings: Settings,
  api: Api,
): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      tenant: { type: "string" as const },
      out: { type: "string" as const },
      history: { type: "boolean" as const },
    },
  });
  const slug = values.tenant ?? positionals[0];
  if (!slug || !values.out) {
    throw new CliError("This needs --tenant <slug> and --out <file>.");
  }
  const secret = passphrase(io);
  const base = `${settings.url.replace(/\/+$/, "")}/api/v1`;
  const found = await api.findTenant(settings, slug);
  const pause = io.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));

  let response: Response | undefined;
  for (let attempt = 1; attempt <= EXPORT_TRIES; attempt++) {
    response = await fetch(`${base}/tenants/${found.id}/exports`, {
      method: "POST",
      headers: { authorization: `Bearer ${settings.token}`, "content-type": "application/json" },
      body: JSON.stringify({ passphrase: secret, history: values.history ?? false }),
    }).catch(() => {
      throw new CliError(
        `Could not reach ${settings.url}. Check the URL and that the instance is running.`,
      );
    });
    if (response.status !== 429) break;
    const detail = ((await response.json().catch(() => null)) as { detail?: string } | null)
      ?.detail;
    if (attempt === EXPORT_TRIES) {
      throw new CliError(
        `Could not export ${slug}. The instance still answered "${detail ?? "try again later"}" after ${EXPORT_TRIES} tries. Try again later, or ask whoever runs the instance to raise EXPORTS_AT_ONCE or EXPORTS_PER_TENANT.`,
      );
    }
    const seconds = Number(response.headers.get("retry-after")) || WAIT_SECONDS;
    io.err(
      `${detail ?? "The instance is busy with other exports."} Waiting ${seconds} s (try ${attempt} of ${EXPORT_TRIES}).`,
    );
    await pause(seconds * 1000);
  }
  if (!response || !response.ok || !response.body) {
    throw await api.failure(response as Response, `export ${slug}`);
  }

  const file = resolve(values.out);
  // The archive is written beside its final name and moved there when it is whole, so that
  // a file that was cut short is never taken for an export.
  const partial = `${file}.part`;
  const limits = limitsOf(response);
  const counted = counting(io, "Writing");
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      counted.stream,
      createWriteStream(partial, { mode: 0o600 }),
    );
  } catch (error) {
    counted.done();
    await rm(partial, { force: true });
    const cause = (error as { cause?: Error }).cause;
    throw endedBecause(
      cause?.message ?? (error as Error).message,
      limits,
      counted.seconds(),
      counted.bytes(),
    );
  }
  counted.done();
  if (!(await endsWholly(partial))) {
    await rm(partial, { force: true });
    throw endedBecause(
      "the archive does not end as a whole one does",
      limits,
      counted.seconds(),
      counted.bytes(),
    );
  }
  await rename(partial, file);
  const { size } = await stat(file);
  io.out(
    `Exported ${slug} to ${file} (${megabytes(size)}, ${megabytes(size / Math.max(1, counted.seconds()))}/s).`,
  );
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
}

interface Inspection {
  problem: string | null;
  tenant: { id: string; slug: string; name: string } | null;
  exportedAt: string | null;
  coreVersion: string | null;
  levelMatches: boolean;
  history: boolean;
  workspaces: { name: string; type: string }[];
  rows: number;
  members: number;
  pendingRuns: number;
  notCarried: string[];
  passphraseOk: boolean | null;
  authenticated: boolean | null;
  tenantPresent: boolean;
  slugTaken: boolean;
}
interface Staged {
  id: string;
  sizeBytes: number;
  inspection: Inspection;
}

/** The sentence that says an export cannot come in here, or undefined when it can. */
function whyNot(inspection: Inspection, slug: string | undefined): string | undefined {
  if (inspection.problem) return inspection.problem;
  if (inspection.passphraseOk === false) return "The passphrase does not open this export.";
  if (inspection.authenticated === false)
    return "The export's list of contents is not signed under its key.";
  if (!inspection.levelMatches)
    return "The instance this export came from is at another database level than this one. Bring both to the same version, then export again.";
  if (inspection.tenantPresent) return "This tenant is already on this instance.";
  if (inspection.slugTaken) {
    return `The name "${slug ?? inspection.tenant?.slug}" is taken here. Choose another with --slug.`;
  }
  return undefined;
}

export async function tenantImport(
  args: string[],
  io: Io,
  settings: Settings,
  api: Api,
): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      slug: { type: "string" as const },
      location: { type: "string" as const },
      yes: { type: "boolean" as const },
    },
  });
  const [path] = positionals;
  if (!path) throw new CliError("This needs the export file: volvel tenant import <file>");
  const secret = passphrase(io);
  const file = resolve(path);
  const { size } = await stat(file).catch(() => {
    throw new CliError(`There is no file at ${file}.`);
  });
  const base = `${settings.url.replace(/\/+$/, "")}/api/v1`;
  const headers = { authorization: `Bearer ${settings.token}` };
  // Asked first, because a key that is refused while a file is being sent cannot be told apart from a broken connection.
  const me = await api.request(settings.url, "/me", settings.token);
  if (me.status !== 200) throw api.refusal(me, "import the tenant");

  // The file goes up as a stream, from disk, to be kept and looked at before anything is written.
  const counted = counting(io, "Sending", size);
  const reading = createReadStream(file);
  reading.on("error", (error) => counted.stream.destroy(error));
  reading.pipe(counted.stream);
  const sent = await fetch(
    `${base}/instance/tenant-imports/staged?name=${encodeURIComponent(basename(file))}`,
    {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/x-tar",
        "content-length": String(size),
        "x-export-passphrase": secret,
      },
      body: Readable.toWeb(counted.stream) as never,
      // Node needs this said to send a body as it is read.
      duplex: "half",
    } as RequestInit,
  ).catch((error: Error) => {
    counted.done();
    throw new CliError(
      `The file could not be sent to ${settings.url}. ${(error.cause as Error | undefined)?.message ?? error.message}`,
    );
  });
  counted.done();
  if (!sent.ok) throw await api.failure(sent, "import the tenant");
  let staged = (await sent.json()) as Staged;
  const discard = () =>
    fetch(`${base}/instance/tenant-imports/staged/${staged.id}`, {
      method: "DELETE",
      headers,
    }).catch(() => undefined);

  if (values.slug) {
    // A name of its own is tried against what is here before anything is asked.
    const again = await fetch(
      `${base}/instance/tenant-imports/staged/${staged.id}?slug=${encodeURIComponent(values.slug)}`,
      { headers: { ...headers, "x-export-passphrase": secret } },
    );
    if (!again.ok) throw await api.failure(again, "look at the export again");
    staged = (await again.json()) as Staged;
  }
  const seen = staged.inspection;
  const refused = whyNot(seen, values.slug);
  if (refused) {
    await discard();
    throw new CliError(`Could not import the tenant. ${refused} Nothing was imported.`);
  }

  io.out(
    `${basename(file)} holds ${seen.tenant?.name} (${seen.tenant?.slug}), exported ${seen.exportedAt} by core ${seen.coreVersion}.`,
  );
  io.out(
    `${seen.rows} rows, ${seen.members} members, ${seen.workspaces.length} workspaces (${seen.workspaces.map((one) => `${one.name}, ${one.type}`).join("; ")}). ${seen.history ? "It includes run, flow and event history." : "It has no run, flow or event history."}`,
  );
  if (seen.pendingRuns > 0) {
    io.out(`${seen.pendingRuns} runs were unfinished in it and will be recorded as canceled.`);
  }
  io.out(`It comes in as "${values.slug ?? seen.tenant?.slug}".`);

  if (!values.yes) {
    if (!io.confirm) {
      await discard();
      throw new CliError(
        "Nothing was imported. Run it again with --yes to import it where nobody can be asked.",
      );
    }
    if (!(await io.confirm(`Import ${seen.tenant?.slug} into ${settings.url}?`))) {
      await discard();
      io.out("Nothing was imported.");
      return;
    }
  }

  const query = new URLSearchParams();
  if (values.slug) query.set("slug", values.slug);
  if (values.location) query.set("dataLocation", values.location);
  io.out(
    "Importing. This can take a long time for a large tenant; the instance answers when it is done.",
  );
  const response = await fetch(
    `${base}/instance/tenant-imports/staged/${staged.id}/import?${query}`,
    {
      method: "POST",
      headers: { ...headers, "x-export-passphrase": secret },
    },
  ).catch(() => {
    throw new CliError(
      `The connection to ${settings.url} ended while the tenant was being imported. The import is all or nothing: check the tenants list before trying again.`,
    );
  });
  if (!response.ok) throw await api.failure(response, "import the tenant");
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
}
