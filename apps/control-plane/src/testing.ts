import { randomBytes } from "node:crypto";
import { Database, sql } from "@vynxlabs/db";
import { createTestDatabase } from "@vynxlabs/db/testing";
import type { RouteOptions } from "fastify";
import { buildApp } from "./app.js";
import type { Config } from "./config.js";
import { recentAuthLog } from "./kernel/auth.js";
import { bootstrapAdmin } from "./kernel/bootstrap.js";
import { MemoryObjectStore, type ObjectStore } from "./storage.js";

export const ADMIN = { email: "operator@example.com", password: "operator-password-1" };

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: "",
    s3: {
      endpoint: undefined,
      region: "us-east-1",
      bucket: "test",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true,
    },
    host: "127.0.0.1",
    port: 0,
    logLevel: "silent",
    publicUrl: "http://localhost:8080",
    authSecret: randomBytes(32).toString("hex"),
    masterKey: randomBytes(32),
    bootstrapAdmin: ADMIN,
    managedWorkers: false,
    consoleDir: undefined,
    screensDir: undefined,
    appsUrl: undefined,
    mail: undefined,
    ...overrides,
  };
}

export interface ApiResponse {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
  body: any;
  headers: Record<string, unknown>;
  /** The response exactly as sent, for answers that are not JSON. */
  bytes: Buffer;
}

export interface Client {
  get(url: string): Promise<ApiResponse>;
  post(url: string, body?: unknown): Promise<ApiResponse>;
  put(url: string, body?: unknown): Promise<ApiResponse>;
  patch(url: string, body?: unknown): Promise<ApiResponse>;
  delete(url: string): Promise<ApiResponse>;
  /** Sends bytes as the request body, as a file upload does. */
  upload(
    url: string,
    content: Buffer | string,
    contentType: string,
    extraHeaders?: Record<string, string>,
    method?: "POST" | "PUT",
  ): Promise<ApiResponse>;
}

/** A running app on a throwaway database, with the first operator admin created. */
export async function startTestApp(
  options: {
    storage?: ObjectStore;
    config?: Partial<Config>;
    /** The core version the instance reports. Default 1.2.3. */
    version?: string;
    /** Faster queue supervision, for tests that wait on timeouts. */
    queue?: { superviseIntervalSeconds?: number; heartbeatSeconds?: number };
    /**
     * Runs on the empty database before it is migrated: for tests that start
     * from the database an earlier version left behind.
     */
    prepare?: (database: Database) => Promise<void>;
    /** The size of the platform's connection pool. Default 6. */
    maxConnections?: number;
  } = {},
) {
  const testDb = await createTestDatabase();
  const database = new Database({
    connectionString: testDb.connectionString,
    // Many test files run at once against one server, each with several pools.
    maxConnections: options.maxConnections ?? 6,
    ...(options.queue ? { queue: options.queue } : {}),
  });
  await options.prepare?.(database);
  await database.migrate();
  await database.queue.start();
  const routes: RouteOptions[] = [];
  const config = testConfig(options.config);
  const storage = options.storage ?? new MemoryObjectStore();
  const app = await buildApp({
    database,
    storage,
    version: options.version ?? "1.2.3",
    config,
    onRoute: (route) => routes.push(route),
  });
  await bootstrapAdmin(app.kernel, app.log);
  await app.kernel.data.platform();
  await app.ready();
  const db = database.router.platform();

  /** Mutating routes that were called successfully and left an audit entry. */
  const audited = new Set<string>();
  /** Mutating calls that succeeded without leaving an audit entry. Must stay empty. */
  const unaudited: string[] = [];

  async function auditCount() {
    const result = await sql<{ count: string }>`select count(*) from audit_entry`.execute(db);
    return Number(result.rows[0]?.count);
  }

  function client(headers: Record<string, string>): Client {
    const call = async (
      method: string,
      url: string,
      body?: unknown,
      contentType?: string,
      extraHeaders: Record<string, string> = {},
    ): Promise<ApiResponse> => {
      // Webhooks are public and are recorded on the run they start, not in the audit log.
      const mutating = method !== "GET" && !url.startsWith("/hooks/");
      const before = mutating ? await auditCount() : 0;
      const response = await app.inject({
        method: method as "GET",
        url: `/api/v1${url}`,
        headers: {
          origin: config.publicUrl,
          ...headers,
          ...(contentType ? { "content-type": contentType } : {}),
          ...extraHeaders,
        },
        ...(body === undefined ? {} : { payload: body as object }),
      });
      if (mutating && response.statusCode < 400) {
        const route = `${method} ${response.raw.req.url}`;
        const pattern = `${method} ${matchedRoute(method, `/api/v1${url}`)}`;
        if ((await auditCount()) > before) audited.add(pattern);
        else unaudited.push(route);
      }
      let parsed: unknown = null;
      if (response.body !== "") {
        try {
          parsed = response.json();
        } catch {
          parsed = response.body;
        }
      }
      return {
        status: response.statusCode,
        body: parsed,
        headers: response.headers,
        bytes: response.rawPayload,
      };
    };
    return {
      get: (url) => call("GET", url),
      post: (url, body) => call("POST", url, body ?? {}),
      put: (url, body) => call("PUT", url, body),
      patch: (url, body) => call("PATCH", url, body ?? {}),
      delete: (url) => call("DELETE", url),
      upload: (url, content, contentType, extraHeaders, method = "POST") =>
        call(method, url, content, contentType, extraHeaders),
    };
  }

  /** The registered route pattern a URL falls under. */
  function matchedRoute(method: string, url: string): string {
    const path = url.split("?")[0] as string;
    const match = routes.find((route) => {
      if (!([] as string[]).concat(route.method).includes(method)) return false;
      const pattern = route.url
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/:\w+/g, "[^/]+")
        .replace(/\*$/, ".+");
      return new RegExp(`^${pattern}$`).test(path);
    });
    return match?.url ?? path;
  }

  async function signIn(email: string, password: string): Promise<Client> {
    let response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-in/email",
      headers: { origin: config.publicUrl },
      payload: { email, password },
    });
    if (response.statusCode !== 200) {
      // A correct password has been refused under load, rarely. Say all that can be known of it.
      const stored = await sql<{ password: string | null; n: string }>`
        select a.password, (select count(*) from member_account b where b.member_id = m.id) as n
        from member m left join member_account a on a.member_id = m.id and a.provider_id = 'credential'
        where m.email = ${email.toLowerCase()}
      `.execute(db);
      const hash = stored.rows[0]?.password ?? "";
      const hasher = (await app.kernel.auth.$context).password;
      const again = await Promise.all(
        [1, 2, 3].map(() => hasher.verify({ hash, password }).catch((error) => String(error))),
      );
      const retry = await app.inject({
        method: "POST",
        url: "/api/v1/auth/sign-in/email",
        headers: { origin: config.publicUrl },
        payload: { email, password },
      });
      const said = `Sign-in failed for ${email}: ${response.statusCode} ${response.body}. The authentication library said: ${recentAuthLog().join(" | ") || "nothing"}. Stored hash: ${hash.length} characters, ${hash
        .split(":")
        .map((part) => part.length)
        .join(
          "+",
        )}, accounts ${stored.rows[0]?.n}. Checked again directly: ${again.join(", ")}. Tried again over HTTP: ${retry.statusCode}. Password sent: ${password.length} characters.`;
      if (retry.statusCode !== 200) throw new Error(said);
      // Under the full run a correct password is refused once in a great while, and taken a
      // moment later. Why is not known: the hash on record is right, and hashing gives the same
      // answer however many run at once. The second answer is used, and this is said out loud so
      // that it is seen and counted. It is an open finding in the phase record.
      console.warn(`\nA CORRECT PASSWORD WAS REFUSED ONCE, THEN TAKEN. ${said}\n`);
      response = retry;
    }
    const cookies = ([] as string[]).concat(response.headers["set-cookie"] ?? []);
    return client({ cookie: cookies.map((cookie) => cookie.split(";")[0]).join("; ") });
  }

  return {
    app,
    kernel: app.kernel,
    database,
    db,
    config,
    routes,
    audited,
    unaudited,
    anonymous: client({}),
    admin: await signIn(ADMIN.email, ADMIN.password),
    signIn,
    withKey: (token: string) => client({ authorization: `Bearer ${token}` }),
    /** A client that sends these headers, for callers that are neither a member nor a key. */
    withHeaders: (headers: Record<string, string>) => client(headers),
    /** Every mutating route under `prefixes` that no test called successfully with an audit entry. */
    unexercised(include: (route: string) => boolean) {
      return routes
        .filter((route) => route.url.startsWith("/api/v1/"))
        .flatMap((route) =>
          ([] as string[]).concat(route.method).map((method) => `${method} ${route.url}`),
        )
        .filter((route) => !/^(GET|HEAD|OPTIONS) /.test(route))
        .filter(include)
        .filter((route) => !audited.has(route));
    },
    async stop() {
      await app.close();
      await database.close();
      await testDb.drop();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;
