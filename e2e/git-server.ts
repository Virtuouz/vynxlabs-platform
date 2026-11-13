import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A git repository served over HTTP by git's own backend, behind a token: what
 * a tenant connects the platform to, and what a developer clones.
 */
export class GitServer {
  readonly token = "e2e-access-token";
  readonly root = mkdtempSync(join(tmpdir(), "vx-e2e-git-"));
  url = "";
  #server: Server | undefined;

  git(args: string[], cwd = this.root): string {
    return execFileSync("git", args, { cwd, encoding: "utf8" });
  }

  get bare() {
    return join(this.root, "repo.git");
  }

  async start() {
    this.git(["init", "-q", "--bare", "-b", "main", "repo.git"]);
    this.git(["config", "http.receivepack", "true"], this.bare);
    const seed = join(this.root, "seed");
    mkdirSync(join(seed, "src"), { recursive: true });
    this.git(["init", "-q", "-b", "main"], seed);
    writeFileSync(join(seed, "src/index.ts"), "export {};\n");
    this.git(["add", "."], seed);
    this.git(
      ["-c", "user.name=Seed", "-c", "user.email=seed@acme.example", "commit", "-q", "-m", "Start"],
      seed,
    );
    this.git(["push", "-q", this.bare, "main"], seed);

    const expected = `Basic ${Buffer.from(`x-access-token:${this.token}`).toString("base64")}`;
    this.#server = createServer((request, response) => {
      if (request.headers.authorization !== expected) {
        response.writeHead(401, { "www-authenticate": "Basic" }).end();
        return;
      }
      const [path = "", query = ""] = (request.url ?? "").split("?");
      const cgi = spawn("git", ["http-backend"], {
        env: {
          ...process.env,
          GIT_PROJECT_ROOT: this.root,
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: path,
          QUERY_STRING: query,
          REQUEST_METHOD: request.method ?? "GET",
          CONTENT_TYPE: request.headers["content-type"] ?? "",
          HTTP_CONTENT_ENCODING: request.headers["content-encoding"] ?? "",
          REMOTE_USER: "token",
        },
      });
      request.pipe(cgi.stdin);
      let pending = Buffer.alloc(0);
      let headed = false;
      cgi.stdout.on("data", (chunk: Buffer) => {
        if (headed) return void response.write(chunk);
        pending = Buffer.concat([pending, chunk]);
        const end = pending.indexOf("\r\n\r\n");
        if (end < 0) return;
        let status = 200;
        const headers: Record<string, string> = {};
        for (const line of pending.subarray(0, end).toString().split("\r\n")) {
          const [name = "", ...value] = line.split(": ");
          if (name.toLowerCase() === "status") status = Number(value.join(": ").split(" ")[0]);
          else headers[name] = value.join(": ");
        }
        response.writeHead(status, headers);
        response.write(pending.subarray(end + 4));
        headed = true;
      });
      cgi.stdout.on("end", () => response.end());
    });
    await new Promise<void>((resolve) => this.#server?.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}/repo.git`;
  }

  /** The files on a branch, as a developer who clones it would see them. */
  files(branch: string): string[] {
    return this.git(["ls-tree", "-r", "--name-only", branch], this.bare).trim().split("\n");
  }

  /** Changes one file on a branch as a developer would, and pushes. */
  edit(branch: string, path: string, change: (text: string) => string, message: string) {
    const clone = join(this.root, `clone-${Date.now()}`);
    this.git(["clone", "-q", "--branch", branch, this.bare, clone]);
    const file = join(clone, path);
    const text = execFileSync("cat", [file], { encoding: "utf8" });
    writeFileSync(file, change(text));
    this.git(["add", "-A"], clone);
    this.git(
      ["-c", "user.name=Dev", "-c", "user.email=dev@acme.example", "commit", "-q", "-m", message],
      clone,
    );
    this.git(["push", "-q", "origin", branch], clone);
  }

  async stop() {
    await new Promise((resolve) => this.#server?.close(resolve));
    rmSync(this.root, { recursive: true, force: true });
  }
}
