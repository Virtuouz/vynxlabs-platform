import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { type Client, startTestApp, type TestApp } from "@vynxlabs/control-plane/testing";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { run } from "./cli.js";
import { startDevServer } from "./dev.js";

/**
 * The phase 2 story end to end, with the real pieces: the example tenant
 * repository is built and deployed by the CLI, and a real worker runs it
 * against stand-ins for the shop and the ERP.
 */

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const PASSWORD = "a-good-long-password";

let t: TestApp;
let url: string;
let alice: Client;
let tenantId: string;
let token: string;
let base: string;
let home: string;
let worker: Worker;
let working: Promise<unknown>;
let outside: ReturnType<typeof createServer>;
let outsideUrl: string;
const erpImports: { order: { id: string }; key: string | undefined; auth: string | undefined }[] =
  [];
const shopQueries: string[] = [];

async function cli(args: string[], env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: { XDG_CONFIG_HOME: home, ...env },
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

async function finished(id: string) {
  for (let i = 0; i < 150; i++) {
    const run = (await alice.get(`${base}/runs/${id}`)).body;
    if (!["queued", "running"].includes(run.status)) return run;
    await sleep(100);
  }
  throw new Error(`Run ${id} did not finish.`);
}

beforeAll(async () => {
  t = await startTestApp({ version: "0.4.0" });
  url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  home = await mkdtemp(join(tmpdir(), "cli-example-"));

  // Stand-ins for the systems the integration connects.
  outside = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      if (request.url?.startsWith("/shop/orders")) {
        shopQueries.push(request.url);
        response.end(
          JSON.stringify([
            { id: "1001", total: 49.5, currency: "EUR" },
            { id: "1002", total: 120, currency: "EUR" },
            { id: "1003", total: 8.25, currency: "EUR" },
          ]),
        );
      } else if (request.url === "/erp/import/orders") {
        const order = JSON.parse(body);
        const key = request.headers["idempotency-key"] as string | undefined;
        // The ERP has seen order 1002 before.
        const duplicate = order.id === "1002" || erpImports.some((entry) => entry.key === key);
        erpImports.push({ order, key, auth: request.headers.authorization });
        response.statusCode = duplicate ? 409 : 201;
        response.end("{}");
      } else {
        response.end("{}");
      }
    });
  });
  await new Promise<void>((resolve) => outside.listen(0, "127.0.0.1", resolve));
  outsideUrl = `http://127.0.0.1:${(outside.address() as AddressInfo).port}`;

  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  tenantId = tenant;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "Alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  const workspace = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  base = `/tenants/${tenant}/workspaces/${workspace}`;
  token = (await alice.post("/api-keys", { name: "cli" })).body.token;
  expect((await cli(["login", "--url", url, "--token", token])).code).toBe(0);

  const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "example" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1 });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker.stop();
  await working;
  outside.closeAllConnections();
  await new Promise((resolve) => outside.close(resolve));
  await t.stop();
  await rm(home, { recursive: true });
  await rm(join(example, ".platform"), { recursive: true, force: true });
});

describe("the example integration", () => {
  test("build lists what the repository contains", async () => {
    const built = await cli(["build", "--dir", example]);
    expect(built.code).toBe(0);
    expect(built.out).toContain("script     orders/sync");
    expect(built.out).toContain("schedule   orders/sync-every-five-minutes");
    expect(
      JSON.parse(await readFile(join(example, ".platform", "bundle.json"), "utf8")).manifests,
    ).toHaveLength(36);
  });

  test("deploy says exactly what the workspace is missing", async () => {
    const refused = await cli([
      "deploy",
      "--dir",
      example,
      "--tenant",
      "acme",
      "--workspace",
      "main",
    ]);
    expect(refused.code).toBe(1);
    expect(refused.err).toBe(
      [
        "Could not deploy to main. The workspace is missing something this bundle needs. Bind each one, then deploy again.",
        '  - the connection "alerts" is not bound in this workspace',
        '  - the connection "erp" is not bound in this workspace',
        '  - the connection "shop" is not bound in this workspace',
        '  - the secret "SHOP_WEBHOOK_SECRET" is not set in this workspace',
      ].join("\n"),
    );
    expect(
      (await cli(["deploy", "--dir", example, "--tenant", "nope", "--workspace", "main"])).err,
    ).toContain('no access to a tenant called "nope"');
    expect((await cli(["deploy", "--dir", example])).err).toContain(
      "--tenant <slug> and --workspace <slug>",
    );
  });

  test("once bound, deploy activates the bundle", async () => {
    await alice.put(`${base}/connection-bindings/shop`, {
      config: { baseUrl: `${outsideUrl}/shop` },
    });
    await alice.put(`${base}/connection-bindings/erp`, {
      config: { baseUrl: `${outsideUrl}/erp`, auth: { type: "bearer" } },
      credential: "erp-api-key",
    });
    await alice.put(`${base}/connection-bindings/alerts`, {
      config: { baseUrl: `${outsideUrl}/chat` },
    });
    await alice.put(`${base}/secrets/SHOP_WEBHOOK_SECRET`, { value: "shared-with-the-shop" });

    const deployed = await cli([
      "deploy",
      "--dir",
      example,
      "--tenant",
      "acme",
      "--workspace",
      "main",
    ]);
    expect(deployed.err).toBe("");
    expect(deployed.out).toContain(
      "Deployed version 1 to main (production): 36 created, 0 updated, 0 deleted, 0 unchanged.",
    );

    // Deploying the same code again changes nothing.
    const again = await cli([
      "deploy",
      "--dir",
      example,
      "--tenant",
      "acme",
      "--workspace",
      "main",
    ]);
    expect(again.out).toContain(
      "Deployed version 1 to main (production): 0 created, 0 updated, 0 deleted, 36 unchanged.",
    );
  });

  test("the sync copies orders from the shop to the ERP", async () => {
    const started = await alice.post(`${base}/runs`, { script: "orders/sync", input: {} });
    const run = await finished(started.body.id);
    expect(run).toMatchObject({
      status: "succeeded",
      output: { sent: 2, skipped: 1 },
      bundleVersion: 1,
    });
    // The batch size came from the variable's default, and the ERP credential from the binding.
    expect(shopQueries).toEqual(["/shop/orders?limit=50"]);
    expect(erpImports.map((entry) => [entry.order.id, entry.key, entry.auth])).toEqual([
      ["1001", "order-1001", "Bearer erp-api-key"],
      ["1002", "order-1002", "Bearer erp-api-key"],
      ["1003", "order-1003", "Bearer erp-api-key"],
    ]);

    await alice.put(`${base}/variable-values/orders/batch-size`, { value: "10" });
    await finished(
      (await alice.post(`${base}/runs`, { script: "orders/sync", input: {} })).body.id,
    );
    expect(shopQueries.at(-1)).toBe("/shop/orders?limit=10");
  });

  test("the schedule is in place, and the webhook imports an order as it arrives", async () => {
    const triggers = (await alice.get(`${base}/triggers`)).body.items;
    expect(triggers.find((trigger: { type: string }) => trigger.type === "schedule")).toMatchObject(
      {
        path: "orders/sync-every-five-minutes",
        script: "orders/sync",
        cron: "*/5 * * * *",
        timezone: "Europe/Madrid",
      },
    );
    const hook = triggers.find((trigger: { type: string }) => trigger.type === "webhook");
    const delivered = await fetch(hook.url.replace("http://localhost:8080", url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: "shared-with-the-shop",
        order: { id: "2001", total: 15, currency: "EUR" },
      }),
    });
    expect(delivered.status).toBe(202);
    const run = await finished(((await delivered.json()) as { runId: string }).runId);
    expect(run).toMatchObject({
      status: "succeeded",
      output: { imported: true },
      trigger: { type: "webhook" },
    });
    expect(erpImports.at(-1)?.order.id).toBe("2001");
  });

  test("the order flow asks for approval of a large order, then sends it to the ERP", async () => {
    interface FlowRunBody {
      status: string;
      error: { message: string } | null;
      steps: { node: string; status: string }[];
    }
    const flowRun = async (id: string): Promise<FlowRunBody> =>
      (await alice.get(`${base}/flow-runs/${id}`)).body;
    const settled = async (id: string, done: (run: FlowRunBody) => boolean) => {
      for (let i = 0; i < 150; i++) {
        const current = await flowRun(id);
        if (done(current)) return current;
        await sleep(100);
      }
      throw new Error(`Flow run ${id} did not get there.`);
    };
    const latest = async () =>
      (await alice.get(`${base}/flow-runs?flow=orders/handle`)).body.items[0].id as string;

    // A small order goes straight through.
    await alice.post(`${base}/events`, {
      name: "orders/received",
      payload: { id: "3001", total: 80, currency: "EUR" },
    });
    const small = await settled(await latest(), (run) => run.status !== "running");
    expect(small.status).toBe("succeeded");
    expect(small.steps.find((s) => s.node === "approve")?.status).toBe("skipped");
    expect(erpImports.at(-1)?.order.id).toBe("3001");

    // A large one waits for a person.
    await alice.post(`${base}/events`, {
      name: "orders/received",
      payload: { id: "3002", total: 4200, currency: "EUR" },
    });
    const waiting = await settled(await latest(), (run) =>
      run.steps.some((s) => s.node === "approve" && s.status === "waiting"),
    );
    expect(erpImports.at(-1)?.order.id).toBe("3001");
    const approvals = (await alice.get(`${base}/approvals`)).body.items;
    expect(approvals[0]).toMatchObject({
      title: "Approve a large order",
      detail: { order: "3002", total: 4200, currency: "EUR" },
    });
    await alice.post(`${base}/flow-runs/${approvals[0].flowRunId}/approvals/approve`, {
      decision: "approve",
    });
    const approved = await settled(approvals[0].flowRunId, (run) => run.status !== "running");
    expect(approved.status).toBe("succeeded");
    expect(erpImports.at(-1)?.order.id).toBe("3002");
    expect(waiting.steps.find((s) => s.node === "refuse")?.status).toBe("skipped");

    // One the check refuses fails the flow with the reason.
    await alice.post(`${base}/events`, {
      name: "orders/received",
      payload: { id: "3003", total: 50, currency: "USD" },
    });
    const refused = await settled(await latest(), (run) => run.status !== "running");
    expect(refused).toMatchObject({
      status: "failed",
      error: {
        message: 'The step "refuse" failed: Order 3003 was refused: Only EUR orders are handled.',
      },
    });

    // Each order that was sent is a row in the workspace's orders table. The refused one is not.
    const rows = (await alice.get(`${base}/rows/orders?sort=number`)).body.items;
    expect(rows.map((row: Record<string, unknown>) => [row.number, row.total, row.status])).toEqual(
      [
        ["3001", 80, "sent"],
        ["3002", 4200, "sent"],
      ],
    );
  });

  test("runs are listed and shown, with their logs, from the command line", async () => {
    const listed = await cli(["runs", "--tenant", "acme", "--workspace", "main"]);
    expect(listed.code).toBe(0);
    const lines = listed.out.split("\n");
    expect(lines.some((line) => /succeeded\s+webhook\s+orders\/receive/.test(line))).toBe(true);
    expect(lines.some((line) => /succeeded\s+flow\s+orders\/send-to-erp/.test(line))).toBe(true);
    const first = lines.findLast((line) =>
      /succeeded\s+manual\s+orders\/sync/.test(line),
    ) as string;

    const id = first.split(/\s+/).at(-1) as string;
    const shown = await cli(["runs", "--tenant", "acme", "--workspace", "main", id]);
    expect(shown.out).toContain("orders/sync: succeeded, attempt 1 of 4, bundle version 1");
    expect(shown.out).toContain('Output: {"sent":2,"skipped":1}');
    expect(shown.out).toMatch(/info\s+Fetched orders from the shop \{"count":3,"limit":50\}/);
    expect(shown.out).toMatch(/info\s+Sync finished \{"sent":2,"skipped":1\}/);

    const filtered = await cli([
      "runs",
      "--tenant",
      "acme",
      "--workspace",
      "main",
      "--script",
      "orders/receive",
    ]);
    expect(filtered.out.split("\n")).toHaveLength(1);
  });
  test("the contact form is a page anyone can send, and its flow of core nodes keeps the message", async () => {
    const listed = (await alice.get(`${base}/triggers`)).body.items.find(
      (item: { path: string }) => item.path === "contact",
    );
    expect(listed.type).toBe("form");
    const address = `${url}${new URL(listed.url).pathname}`;
    const page = await (await fetch(address)).text();
    expect(page).toContain("<h1>Get in touch</h1>");
    expect(page).toContain("We answer within two working days.");
    const key = /name="key" value="([0-9a-f-]{36})"/.exec(page)?.[1] ?? "";
    const sent = await fetch(address, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: url },
      body: new URLSearchParams({
        key,
        name: "Pat",
        about: "An order",
        message: "Where is order 1001?",
      }).toString(),
    });
    expect(sent.status).toBe(200);
    expect(await sent.text()).toContain("Thank you. Your message has reached us.");
    // The worker runs the two steps. The row and the event are what they leave.
    let rows: { name: string; about: string; message: string; email: string | null }[] = [];
    for (let i = 0; i < 100 && rows.length === 0; i++) {
      rows = (await alice.get(`${base}/rows/messages`)).body.items ?? [];
      if (rows.length === 0) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(rows).toMatchObject([
      { name: "Pat", about: "An order", message: "Where is order 1001?", email: null },
    ]);
    let events: unknown[] = [];
    for (let i = 0; i < 50 && events.length === 0; i++) {
      events = (await alice.get(`${base}/events?name=messages/received`)).body.items ?? [];
      if (events.length === 0) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(events).toHaveLength(1);
  });

  test("the portal serves staff and customers, each with their own orders, and anyone the notices", async () => {
    const host = new URL(url).host;
    /** A browser: it keeps the cookies it is given. */
    const visitor = () => {
      const jar = new Map<string, string>();
      return async (
        path: string,
        init: { method?: string; json?: unknown; form?: Record<string, string> } = {},
      ) => {
        const response = await fetch(`${url}${path}`, {
          method: init.method ?? (init.json || init.form ? "POST" : "GET"),
          redirect: "manual",
          headers: {
            cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
            ...(init.json ? { "content-type": "application/json", origin: url } : {}),
            ...(init.form
              ? { "content-type": "application/x-www-form-urlencoded", origin: url }
              : {}),
          },
          ...(init.json ? { body: JSON.stringify(init.json) } : {}),
          ...(init.form ? { body: new URLSearchParams(init.form).toString() } : {}),
        });
        for (const line of response.headers.getSetCookie()) {
          const [pair = ""] = line.split(";");
          jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
        }
        const text = await response.text();
        return { status: response.status, text, location: response.headers.get("location") };
      };
    };
    expect(host).toBeTruthy();

    // Anyone may open the public page and read the notices. Nothing else.
    await alice.post(`${base}/rows/notices`, {
      title: "Closed on Friday",
      body: "Back on Monday.",
    });
    const guest = visitor();
    const page = await guest("/apps/acme/main/public/");
    expect(page.status).toBe(200);
    expect(page.text).toContain('id="vx-context"');
    const script = /src="(\.\/assets\/[^"]+\.js)"/.exec(page.text)?.[1] as string;
    expect((await guest(`/apps/acme/main/public/${script.slice(2)}`)).status).toBe(200);
    const noticesSeen = JSON.parse((await guest(`/api/v1${base}/rows/notices`)).text);
    expect(noticesSeen.items.map((row: { title: string }) => row.title)).toEqual([
      "Closed on Friday",
    ]);
    expect((await guest(`/api/v1${base}/rows/orders`)).status).toBe(401);
    expect((await guest("/apps/acme/main/portal/")).status).toBe(303);

    // Two customers, each invited by staff.
    const customer = async (email: string) => {
      const invited = await alice.post(`/tenants/${tenantId}/end-users`, { email });
      const link = new URL(invited.body.invitation.url);
      const browse = visitor();
      const set = await browse(link.pathname, {
        form: { token: link.searchParams.get("token") as string, password: PASSWORD },
      });
      expect(set.status).toBe(303);
      return { id: invited.body.endUser.id as string, browse };
    };
    const carl = await customer("carl@customer.example");
    const dana = await customer("dana@customer.example");
    expect((await carl.browse("/apps/acme/main/portal/")).text).toContain('"type":"end_user"');

    // Carl asks for an order. The script writes it as his.
    const started = JSON.parse(
      (
        await carl.browse(`/api/v1${base}/runs`, {
          json: {
            script: "orders/request",
            input: { number: "C-1", total: 12.5, currency: "EUR" },
          },
        })
      ).text,
    );
    const run = await finished(started.id);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    const mine = JSON.parse((await carl.browse(`/api/v1${base}/rows/orders`)).text).items;
    expect(mine).toMatchObject([{ number: "C-1", status: "requested", owner_id: carl.id }]);
    expect(JSON.parse((await dana.browse(`/api/v1${base}/rows/orders`)).text).items).toEqual([]);
    expect((await dana.browse(`/api/v1${base}/row/${mine[0].id}/orders`)).status).toBe(404);
    // Staff see it among all the others.
    const all = (await alice.get(`${base}/rows/orders?limit=200`)).body.items as {
      number: string;
    }[];
    expect(all.length).toBeGreaterThan(1);
    expect(all.map((row) => row.number)).toContain("C-1");

    // The workspace's theme is over the kit's values.
    expect((await guest(`/api/v1${base}/theme.css`)).text).toContain("--vx-action: #0b6e4f;");
  });
});

describe("working locally", () => {
  test("promote previews, then activates the same bundle in the linked workspace", async () => {
    const [, , tenant, , workspace] = base.split("/");
    const dev = (
      await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
    ).body.id;
    const devBase = `/tenants/${tenant}/workspaces/${dev}`;
    const promote = (...more: string[]) =>
      cli(["promote", "--tenant", "acme", "--workspace", "dev", ...more]);
    expect((await promote()).err).toContain("This workspace is not linked to another one.");

    await alice.patch(devBase, { linkedWorkspaceId: workspace });
    for (const path of ["shop", "erp", "alerts"]) {
      await alice.put(`${devBase}/connection-bindings/${path}`, {
        config: { baseUrl: `${outsideUrl}/${path}` },
      });
    }
    await alice.put(`${devBase}/secrets/SHOP_WEBHOOK_SECRET`, { value: "dev-secret" });
    const deployed = await cli([
      "deploy",
      "--dir",
      example,
      "--tenant",
      "acme",
      "--workspace",
      "dev",
    ]);
    expect(deployed.err).toBe("");
    const digest = /Bundle ([0-9a-f]{12})/.exec(deployed.out)?.[1];

    const preview = await promote("--preview");
    expect(preview.err).toBe("");
    expect(preview.out).toContain(`Bundle ${digest}, version 1 here, to main (production).`);
    expect(preview.out).toContain(
      "Promoting would leave main (production) with: 0 created, 0 updated, 0 deleted, 36 unchanged.",
    );
    expect(preview.out).toContain("Nothing was changed.");

    const promoted = await promote();
    expect(promoted.err).toBe("");
    expect(promoted.out).toContain(
      "Promoted to main (production) as version 1: 0 created, 0 updated, 0 deleted, 36 unchanged.",
    );
    const latest = (await alice.get(`${base}/deployments`)).body.items[0];
    expect(latest.promotedFromWorkspaceId).toBe(dev);
  });

  test("tenant export writes the archive, and tenant import sends it to an instance", async () => {
    const file = join(home, "acme.tar");
    const secret = { PLATFORM_EXPORT_PASSPHRASE: "a passphrase long enough" };
    const unset = await cli(["tenant", "export", "--tenant", "acme", "--out", file]);
    expect(unset.code).toBe(1);
    expect(unset.err).toContain("Set PLATFORM_EXPORT_PASSPHRASE");

    const exported = await cli(
      ["tenant", "export", "--tenant", "acme", "--out", file, "--history"],
      secret,
    );
    expect(exported.err).toBe("");
    expect(exported.out).toMatch(/Exported acme to .*acme\.tar \(\d+\.\d MB\)\./);
    expect(exported.out).toContain("It includes run, flow and event history.");
    const bytes = await readFile(file);
    // A tar archive that ends with its list of contents.
    expect(bytes.subarray(257, 262).toString()).toBe("ustar");
    expect(bytes.toString("latin1")).toContain('"format": "vynxlabs-tenant-export"');

    // Importing is for operators: the tenant's own key is refused.
    const asTenant = await cli(["tenant", "import", file], secret);
    expect(asTenant.code).toBe(1);
    expect(asTenant.err).toContain("Could not import the tenant.");
    const operator = (await t.admin.post("/api-keys", { name: "import" })).body.token as string;
    const wrong = await cli(["tenant", "import", file], {
      PLATFORM_TOKEN: operator,
      PLATFORM_EXPORT_PASSPHRASE: "not the right passphrase",
    });
    expect(wrong.err).toContain("The passphrase does not open this export.");
    // The whole file arrived and was checked: the only objection is that the tenant is already here.
    const here = await cli(["tenant", "import", file, "--slug", "acme-copy"], {
      PLATFORM_TOKEN: operator,
      ...secret,
    });
    expect(here.err).toContain("This tenant is already on this instance.");
    expect((await cli(["tenant", "import", join(home, "missing.tar")], secret)).err).toContain(
      "There is no file at",
    );
  });

  test("dev serves an app from its source, with the platform's context and the instance's data", async () => {
    const server = await startDevServer({
      directory: example,
      app: "public",
      port: 0,
      instance: { url, token },
      tenant: { id: tenantId, slug: "acme", name: "Acme" },
      workspace: { id: base.split("/").at(-1) as string, slug: "main" },
      principal: { type: "member", id: null, name: "Alice", email: "alice@acme.example" },
    });
    try {
      const page = await (await fetch(server.url)).text();
      const context = JSON.parse(
        /<script type="application\/json" id="vx-context">(.*?)<\/script>/.exec(
          page,
        )?.[1] as string,
      );
      expect(context).toMatchObject({
        api: "/api/v1",
        base: "/",
        tenant: { slug: "acme" },
        app: { path: "public" },
        principal: { email: "alice@acme.example" },
      });
      expect(page).toContain("/theme.css");
      // The page's source is served as it is, compiled on the way.
      expect((await fetch(`${server.url}main.tsx`)).status).toBe(200);
      // Its API calls reach the instance as the developer.
      // biome-ignore lint/suspicious/noExplicitAny: replies are read field by field
      const read = async (path: string): Promise<any> =>
        (await fetch(`${server.url}${path}`)).json();
      const me = await read("api/v1/me");
      expect(me.principal.email).toBe("alice@acme.example");
      const rows = await read(`api/v1${base}/rows/notices`);
      expect(rows.items).toHaveLength(1);
    } finally {
      await server.close();
    }
    const which = await startDevServer({
      directory: example,
      app: undefined,
      port: 0,
      instance: { url, token },
      tenant: { id: tenantId, slug: "acme", name: "Acme" },
      workspace: { id: "x", slug: "main" },
      principal: { type: "member", name: null, email: null },
    }).catch((error) => error);
    expect(which.message).toContain("Say which app: portal, public.");
  }, 60_000);

  test("run executes one script on this machine with local bindings", async () => {
    const missing = await cli(["run", "orders/sync", "--dir", example]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain('The connection "shop" has no local value.');

    await mkdir(join(example, ".platform"), { recursive: true });
    await writeFile(
      join(example, ".platform", "local.json"),
      JSON.stringify({
        connections: {
          shop: { config: { baseUrl: `${outsideUrl}/shop` } },
          erp: { config: { baseUrl: `${outsideUrl}/erp` } },
        },
        variables: { "orders/batch-size": "2" },
      }),
    );
    const ran = await cli(["run", "orders/sync", "--dir", example, "--input", "{}"]);
    expect(ran.err).toBe("");
    expect(ran.out).toContain('info  Fetched orders from the shop {"count":3,"limit":2}');
    expect(ran.out).toMatch(/Output: \{"sent":\d,"skipped":\d\}/);

    expect((await cli(["run", "orders/unknown", "--dir", example])).err).toContain(
      'There is no script "orders/unknown". This repository has: alerts/run-failed, orders/check, orders/receive, orders/record, orders/request, orders/send-to-erp, orders/sync',
    );
    expect((await cli(["run", "orders/sync", "--dir", example, "--input", "{bad"])).err).toContain(
      "--input must be JSON",
    );
    expect(
      (await cli(["run", "orders/sync", "--dir", example, "--input", '{"since":5}'])).err,
    ).toContain("The script's input does not match its schema");
  });

  test("init writes a starter repository, and refuses a directory that is not empty", async () => {
    const directory = join(home, "new-tenant");
    const created = await cli(["init", directory]);
    expect(created.code).toBe(0);
    expect(await readFile(join(directory, "src", "index.ts"), "utf8")).toContain("defineScript");
    expect(
      JSON.parse(await readFile(join(directory, "package.json"), "utf8")).dependencies,
    ).toHaveProperty("@vynxlabs/sdk");
    expect((await cli(["init", directory])).err).toContain("is not empty");
  });
});
