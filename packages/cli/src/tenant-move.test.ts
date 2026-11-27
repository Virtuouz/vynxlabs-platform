import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type Io, run } from "./cli.js";
import { endedBecause } from "./tenant-move.js";

/**
 * Moving a tenant from the command line: an export is written to disk as it arrives and says why
 * it stopped, and an import is sent as a stream, looked at, and made on confirmation. The
 * instance here is a stand-in that answers as the routes do.
 */

const SECRET = { VOLVEL_EXPORT_PASSPHRASE: "a passphrase long enough" };
const ARCHIVE = Buffer.concat([
  Buffer.from("an archive of some size ".repeat(100)),
  Buffer.alloc(1024),
]);

let server: Server;
let home: string;
let url: string;
let exportAnswers: ((res: ServerResponse) => void)[];
let uploaded: Buffer | undefined;
let calls: string[];
let inspection: Record<string, unknown>;
let importQuery: string | undefined;

const good = {
  problem: null,
  tenant: { id: "t1", slug: "big", name: "Big" },
  exportedAt: "2026-11-26T10:00:00.000Z",
  coreVersion: "1.0.0",
  levelMatches: true,
  history: false,
  workspaces: [{ name: "main", type: "production" }],
  rows: 1234,
  members: 3,
  accountsToCreate: 2,
  pendingRuns: 0,
  notCarried: [],
  passphraseOk: true,
  authenticated: true,
  tenantPresent: false,
  slugTaken: false,
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

async function body(req: IncomingMessage) {
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "cli-move-"));
  server = createServer(async (req, res) => {
    const path = `${req.method} ${req.url?.split("?")[0]}`;
    calls.push(path);
    if (path === "GET /api/v1/tenants")
      return json(res, 200, { items: [{ id: "t1", slug: "big" }] });
    if (path === "GET /api/v1/me") return json(res, 200, {});
    if (path === "POST /api/v1/tenants/t1/exports") {
      const answer = exportAnswers.shift();
      if (!answer) return json(res, 500, { detail: "no answer set" });
      return answer(res);
    }
    if (path === "POST /api/v1/instance/tenant-imports/staged") {
      uploaded = await body(req);
      return json(res, 201, {
        id: "s1",
        fileName: "x.tar",
        sizeBytes: uploaded.length,
        inspection,
      });
    }
    if (path === "GET /api/v1/instance/tenant-imports/staged/s1") {
      return json(res, 200, { id: "s1", fileName: "x.tar", sizeBytes: 1, inspection });
    }
    if (path === "DELETE /api/v1/instance/tenant-imports/staged/s1") {
      res.writeHead(204);
      return res.end();
    }
    if (path === "POST /api/v1/instance/tenant-imports/staged/s1/import") {
      importQuery = req.url?.split("?")[1];
      return json(res, 201, {
        tenant: { slug: "big", dataLocation: null },
        counts: { a: 1234 },
        objects: 2,
        members: { created: 3, linked: 0, withPassword: 0, withoutPassword: 3 },
        pausedWorkspaces: 1,
        cancelled: { runs: 0, flowRuns: 0 },
        notCarried: [],
      });
    }
    return json(res, 404, { detail: path });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));
beforeEach(() => {
  exportAnswers = [];
  uploaded = undefined;
  importQuery = undefined;
  calls = [];
  inspection = good;
});

async function cli(args: string[], extra: Partial<Io> = {}, env: Record<string, string> = SECRET) {
  const out: string[] = [];
  const err: string[] = [];
  const waits: number[] = [];
  const code = await run(args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: { XDG_CONFIG_HOME: home, VOLVEL_URL: url, VOLVEL_TOKEN: "key", ...env },
    sleep: async (ms) => {
      waits.push(ms);
    },
    ...extra,
  });
  return { code, out: out.join("\n"), err: err.join("\n"), waits };
}

const sendArchive = (res: ServerResponse, headers: Record<string, string> = {}) => {
  res.writeHead(200, { "content-type": "application/x-tar", ...headers });
  res.end(ARCHIVE);
};

describe("tenant export", () => {
  test("is written to disk as it arrives, shows progress, and is moved to its name when whole", async () => {
    const file = join(home, "a.tar");
    exportAnswers.push((res) => sendArchive(res));
    const lines: string[] = [];
    const done = await cli(["tenant", "export", "--tenant", "big", "--out", file], {
      progress: (line) => lines.push(line),
    });
    expect(done.err).toBe("");
    expect(done.out).toMatch(/Exported big to .*a\.tar \(0\.0 MB, /);
    expect((await readFile(file)).equals(ARCHIVE)).toBe(true);
    // The partial file is gone: only the finished one is left.
    expect((await readdir(home)).filter((name) => name.endsWith(".part"))).toEqual([]);
    expect(lines.at(-1)).toBe("");
    // Said as the tenant's name too, as the routes name it.
    exportAnswers.push((res) => sendArchive(res));
    const positional = await cli(["tenant", "export", "big", "--out", file]);
    expect(positional.code).toBe(0);
  });

  test("never prints the passphrase, and does not run without one", async () => {
    const file = join(home, "b.tar");
    exportAnswers.push((res) => sendArchive(res));
    const done = await cli(["tenant", "export", "--tenant", "big", "--out", file]);
    expect(done.out + done.err).not.toContain(SECRET.VOLVEL_EXPORT_PASSPHRASE);
    const none = await cli(["tenant", "export", "--tenant", "big", "--out", file], {}, {});
    expect(none.code).toBe(1);
    expect(none.err).toContain("Set VOLVEL_EXPORT_PASSPHRASE");
  });

  test("an instance that is writing as many exports as it allows is waited for, by the time it says", async () => {
    const file = join(home, "c.tar");
    const busy = (res: ServerResponse) => {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "7" });
      res.end(JSON.stringify({ detail: "This tenant is already being exported." }));
    };
    exportAnswers.push(busy, busy, (res) => sendArchive(res));
    const done = await cli(["tenant", "export", "--tenant", "big", "--out", file]);
    expect(done.code).toBe(0);
    expect(done.waits).toEqual([7000, 7000]);
    expect(done.err).toContain("This tenant is already being exported. Waiting 7 s (try 1 of 10).");
    expect(done.err).toContain("(try 2 of 10)");
  });

  test("gives up after ten tries and says which settings to raise", async () => {
    const busy = (res: ServerResponse) => {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
      res.end(JSON.stringify({ detail: "Busy." }));
    };
    for (let i = 0; i < 10; i++) exportAnswers.push(busy);
    const failed = await cli(["tenant", "export", "--tenant", "big", "--out", join(home, "d.tar")]);
    expect(failed.code).toBe(1);
    expect(failed.waits).toHaveLength(9);
    expect(failed.err).toContain("after 10 tries");
    expect(failed.err).toContain("EXPORTS_AT_ONCE or EXPORTS_PER_TENANT");
  });

  test("an export that stopped for another reason than time says so, and leaves no file", async () => {
    const file = join(home, "e.tar");
    exportAnswers.push((res) => {
      res.writeHead(200, {
        "content-type": "application/x-tar",
        "x-export-limits": "max-minutes=0; stall-seconds=60",
      });
      res.write(ARCHIVE.subarray(0, 500));
      setTimeout(() => res.destroy(), 20);
    });
    // The time limit is read from the instance's own header: 0 is no limit, so it was not that.
    const stopped = await cli(["tenant", "export", "--tenant", "big", "--out", file]);
    expect(stopped.code).toBe(1);
    expect(stopped.err).toContain("It was not ended by the time limit.");
    expect(stopped.err).toContain("EXPORT_STALL_SECONDS");
    expect(stopped.err).toContain("Nothing is resumed");
    expect(
      await readdir(home).then((names) => names.includes("e.tar") || names.includes("e.tar.part")),
    ).toBe(false);
  });

  test("an export ended near the instance's time limit names EXPORT_MAX_MINUTES", () => {
    const limits = { maxMinutes: 30, stallSeconds: 60 };
    expect(endedBecause("terminated", limits, 1799, 9e9).message).toContain("EXPORT_MAX_MINUTES");
    expect(endedBecause("terminated", limits, 1799, 9e9).message).toContain("30 minutes");
    expect(endedBecause("terminated", limits, 600, 9e9).message).not.toContain(
      "EXPORT_MAX_MINUTES",
    );
    expect(endedBecause("terminated", { ...limits, maxMinutes: 0 }, 9999, 1).message).not.toContain(
      "EXPORT_MAX_MINUTES",
    );
  });

  test("a file that does not end as an archive does is not kept", async () => {
    const file = join(home, "f.tar");
    exportAnswers.push((res) => {
      res.writeHead(200, { "content-type": "application/x-tar" });
      res.end(Buffer.from("cut short"));
    });
    const stopped = await cli(["tenant", "export", "--tenant", "big", "--out", file]);
    expect(stopped.code).toBe(1);
    expect(stopped.err).toContain("does not end as a whole one does");
    expect((await readdir(home)).includes("f.tar")).toBe(false);
  });
});

describe("tenant import", () => {
  const file = () => join(home, "in.tar");
  beforeEach(async () => {
    await writeFile(file(), ARCHIVE);
  });

  test("sends the file as it is, says what it holds, and imports with --yes", async () => {
    const lines: string[] = [];
    const done = await cli(["tenant", "import", file(), "--yes"], {
      progress: (line) => lines.push(line),
    });
    expect(done.err).toBe("");
    expect(uploaded?.equals(ARCHIVE)).toBe(true);
    expect(done.out).toContain("holds Big (big)");
    expect(done.out).toContain("1234 rows, 3 members, 1 workspaces (main, production)");
    expect(done.out).toContain("Imported big: 1234 rows, 2 stored objects");
    expect(calls).toContain("POST /api/v1/instance/tenant-imports/staged/s1/import");
    expect(lines.length).toBeGreaterThan(0);
    expect(done.out + done.err).not.toContain(SECRET.VOLVEL_EXPORT_PASSPHRASE);
  });

  test("says before asking that the accounts it creates have no password, and keeps none by default (p35)", async () => {
    const done = await cli(["tenant", "import", file(), "--yes"]);
    expect(done.out).toContain("2 accounts will be created here");
    expect(done.out).toContain("no password");
    expect(done.out).toContain("--keep-sign-ins");
    expect(new URLSearchParams(importQuery).has("keepSignIns")).toBe(false);
    expect(done.out).toContain("3 of the accounts created have no password");
  });

  test("--keep-sign-ins reaches the import, and the inspection says the passwords come with it (p35)", async () => {
    const done = await cli(["tenant", "import", file(), "--yes", "--keep-sign-ins"]);
    expect(new URLSearchParams(importQuery).get("keepSignIns")).toBe("true");
    expect(done.out).toContain(
      "2 accounts will be created here with the password the export holds",
    );
  });

  test("with nobody to ask and no --yes, imports nothing and throws the upload away", async () => {
    const done = await cli(["tenant", "import", file()]);
    expect(done.code).toBe(1);
    expect(done.err).toContain("Nothing was imported. Run it again with --yes");
    expect(calls).toContain("DELETE /api/v1/instance/tenant-imports/staged/s1");
    expect(calls).not.toContain("POST /api/v1/instance/tenant-imports/staged/s1/import");
  });

  test("asks first where someone can answer, and a no imports nothing", async () => {
    const no = await cli(["tenant", "import", file()], { confirm: async () => false });
    expect(no.code).toBe(0);
    expect(no.out).toContain("Nothing was imported.");
    expect(calls).not.toContain("POST /api/v1/instance/tenant-imports/staged/s1/import");
    calls = [];
    const yes = await cli(["tenant", "import", file()], { confirm: async () => true });
    expect(yes.out).toContain("Imported big");
  });

  test("an export that cannot come in is said so before anything is asked, with --yes too", async () => {
    inspection = { ...good, passphraseOk: false };
    const wrong = await cli(["tenant", "import", file(), "--yes"]);
    expect(wrong.code).toBe(1);
    expect(wrong.err).toContain("The passphrase does not open this export.");
    inspection = { ...good, slugTaken: true };
    const taken = await cli(["tenant", "import", file(), "--yes", "--slug", "other"]);
    expect(taken.err).toContain('The name "other" is taken here.');
    inspection = {
      ...good,
      problem: "The export is damaged: manifest.json is not what was written.",
    };
    const damaged = await cli(["tenant", "import", file(), "--yes"]);
    expect(damaged.err).toContain("The export is damaged");
    expect(calls).not.toContain("POST /api/v1/instance/tenant-imports/staged/s1/import");
  });
});
