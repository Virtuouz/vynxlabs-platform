import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { fireDueSchedules } from "./kernel/execution/triggers.js";
import { advanceDueFlows, startFlowRun } from "./kernel/flows/engine.js";
import { publishEvent } from "./kernel/flows/events.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let url: string;
let tenant: string;
let other: Client; // admin of another tenant
let otherTenant: string;
let dev: string;
let alice: Client;
let bob: Client; // developer: may start flows, may not approve
let worker: Worker;
let working: Promise<unknown>;
let roles: Record<string, string>;
let chat: ReturnType<typeof createServer>;
const notified: string[] = [];

const object = (properties: Record<string, object> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});
const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
const script = (path: string, entry: string, extra: Record<string, unknown> = {}) =>
  manifest("script", path, {
    entry,
    input: object(),
    output: object(),
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    ...extra,
  });
type Edge = [string, string] | [string, string, { output?: string; error?: boolean }];
const flow = (path: string, nodes: Record<string, object>, edges: Edge[]) =>
  manifest("flow", path, {
    nodes,
    edges: edges.map(([from, to, extra]) => ({ from, to, ...extra })),
  });
const manual = { type: "trigger", trigger: { type: "manual" } };
const run = (path: string, input?: string) => ({
  type: "script",
  script: path,
  ...(input ? { input } : {}),
});
const set = (values: Record<string, string>) => ({ type: "set", values });

const code = (label: string) => `
const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
export const double = { execute: async (input, ctx) => { ctx.log.info("Doubling", { n: input.n }); return { n: input.n * 2 }; } };
export const risky = { execute: async (input) => { if (input.fail) throw new Error("The ERP said no"); return { ok: true }; } };
export const slow = { execute: async (input, ctx) => { await wait(input.ms, ctx.signal); return { label: "${label}" }; } };
export const sink = { execute: async (input) => ({ got: input }) };
export const publisher = { execute: async (input, ctx) => { await ctx.events.publish(input.event, input.payload); return { published: true }; } };
export const big = { execute: async () => ({ blob: "x".repeat(300 * 1024) }) };
`;

function bundle(
  label = "one",
  change: (manifests: BundleManifest[]) => BundleManifest[] = (m) => m,
): Bundle {
  const manifests = change([
    manifest("connection", "chat", { connector: "http" }),
    manifest("event", "orders/placed", {
      payload: object({ id: { type: "string" }, total: { type: "number" } }, ["id", "total"]),
    }),
    script("double", "double", { input: object({ n: { type: "number" } }, ["n"]) }),
    script("risky", "risky"),
    script("slow", "slow"),
    script("sink", "sink"),
    script("publisher", "publisher", {
      uses: { connections: [], secrets: [], variables: [], events: ["orders/placed"] },
    }),
    script("big", "big"),
    manifest("trigger", "big-orders", {
      type: "event",
      script: "sink",
      event: "orders/placed",
      filter: "event.payload.total > 100.0",
    }),
    manifest("trigger", "on-failure", {
      type: "event",
      script: "sink",
      event: "platform/run-failed",
    }),
    flow(
      "linear",
      {
        start: manual,
        a: run("double", "{'n': trigger.n}"),
        b: run("double", "{'n': steps.a.output.n}"),
        c: set({ result: "steps.b.output.n", label: `'${label}'` }),
      },
      [
        ["start", "a"],
        ["a", "b"],
        ["b", "c"],
      ],
    ),
    flow(
      "branching",
      {
        start: manual,
        size: { type: "branch", cases: [{ name: "large", when: "trigger.total > 100.0" }] },
        large_path: set({ kind: "'large'" }),
        small_path: set({ kind: "'small'" }),
        together: { type: "join" },
        done: set({
          kind: "has(steps.large_path) ? steps.large_path.output.kind : steps.small_path.output.kind",
        }),
      },
      [
        ["start", "size"],
        ["size", "large_path", { output: "large" }],
        ["size", "small_path", { output: "otherwise" }],
        ["large_path", "together"],
        ["small_path", "together"],
        ["together", "done"],
      ],
    ),
    flow(
      "parallel",
      {
        start: manual,
        left: run("double", "{'n': trigger.a}"),
        right: run("double", "{'n': trigger.b}"),
        both: { type: "join" },
        total: set({ sum: "steps.left.output.n + steps.right.output.n" }),
      },
      [
        ["start", "left"],
        ["start", "right"],
        ["left", "both"],
        ["right", "both"],
        ["both", "total"],
      ],
    ),
    flow(
      "looping",
      {
        start: manual,
        each: {
          type: "foreach",
          items: "trigger.numbers",
          script: "double",
          input: "{'n': item + double(index)}",
          concurrency: 2,
        },
        done: set({ out: "steps.each.output.map(o, o.n)" }),
      },
      [
        ["start", "each"],
        ["each", "done"],
      ],
    ),
    flow(
      "recovering",
      {
        start: manual,
        attempt: run("risky", "{'fail': trigger.fail}"),
        fine: set({ outcome: "'fine'" }),
        recovered: set({ outcome: "'recovered'", why: "steps.attempt.error.message" }),
      },
      [
        ["start", "attempt"],
        ["attempt", "fine"],
        ["attempt", "recovered", { error: true }],
      ],
    ),
    flow(
      "unhandled",
      { start: manual, attempt: run("risky", "{'fail': true}"), never: set({ x: "1" }) },
      [
        ["start", "attempt"],
        ["attempt", "never"],
      ],
    ),
    flow(
      "stopping",
      { start: manual, stop: { type: "fail", message: "'Stopped: ' + trigger.reason" } },
      [["start", "stop"]],
    ),
    flow(
      "waiting",
      { start: manual, pause: { type: "delay", seconds: 3600 }, after: set({ done: "true" }) },
      [
        ["start", "pause"],
        ["pause", "after"],
      ],
    ),
    flow(
      "approving",
      {
        start: manual,
        gate: {
          type: "approval",
          title: "Approve the order",
          detail: "{'order': trigger.id, 'total': trigger.total}",
        },
        send: set({ sent: "trigger.id" }),
        refused: set({ why: "steps.gate.error.message" }),
      },
      [
        ["start", "gate"],
        ["gate", "send"],
        ["gate", "refused", { error: true }],
      ],
    ),
    flow(
      "impatient",
      {
        start: manual,
        gate: { type: "approval", title: "Quick", timeoutSeconds: 3600 },
        send: set({ sent: "true" }),
      },
      [
        ["start", "gate"],
        ["gate", "send"],
      ],
    ),
    flow(
      "parent",
      {
        start: manual,
        child: { type: "subflow", flow: "linear", input: "{'n': trigger.n}" },
        wrap: set({ from_child: "steps.child.output.c.result" }),
      },
      [
        ["start", "child"],
        ["child", "wrap"],
      ],
    ),
    flow(
      "chooser",
      {
        start: manual,
        child: {
          type: "subflow",
          flowFrom: "trigger.which",
          allow: ["linear", "impatient"],
          input: "{'n': trigger.n}",
        },
        wrap: set({ from_child: "steps.child.output" }),
      },
      [
        ["start", "child"],
        ["child", "wrap"],
      ],
    ),
    flow(
      "fanout-chosen",
      {
        start: manual,
        each: {
          type: "foreach",
          items: "trigger.jobs",
          flowFrom: "item.flow",
          allow: ["linear"],
          input: "{'n': item.n}",
        },
        done: set({ results: "steps.each.output.map(o, o.c.result)" }),
      },
      [
        ["start", "each"],
        ["each", "done"],
      ],
    ),
    flow(
      "fanout",
      {
        start: manual,
        each: {
          type: "foreach",
          items: "trigger.numbers",
          flow: "linear",
          input: "{'n': item}",
          concurrency: 3,
        },
        done: set({ results: "steps.each.output.map(o, o.c.result)" }),
      },
      [
        ["start", "each"],
        ["each", "done"],
      ],
    ),
    flow(
      "many-triggers",
      {
        by_hand: manual,
        by_hook: { type: "trigger", trigger: { type: "webhook" } },
        by_event: { type: "trigger", trigger: { type: "event", event: "orders/placed" } },
        nightly: { type: "trigger", trigger: { type: "schedule", cron: "0 2 * * *" } },
        hand_path: set({ via: "'hand'" }),
        hook_path: set({ via: "'hook'", name: "trigger.name" }),
        event_path: set({ via: "'event'", order: "trigger.id" }),
        night_path: set({ via: "'schedule'" }),
      },
      [
        ["by_hand", "hand_path"],
        ["by_hook", "hook_path"],
        ["by_event", "event_path"],
        ["nightly", "night_path"],
      ],
    ),
    flow(
      "slow-flow",
      {
        start: manual,
        work: run("slow", "{'ms': trigger.ms}"),
        after: set({ label: "steps.work.output.label", version: `'${label}'` }),
      },
      [
        ["start", "work"],
        ["work", "after"],
      ],
    ),
    flow(
      "heavy",
      { start: manual, make: run("big"), use: set({ note: "steps.make.output.note" }) },
      [
        ["start", "make"],
        ["make", "use"],
      ],
    ),
  ]);
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: code(label),
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;
async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  seconds = 15,
): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await sleep(100);
  }
}
// biome-ignore lint/suspicious/noExplicitAny: flow run bodies are inspected freely
type Any = any;
const read = async (id: string): Promise<Any> => (await alice.get(`${ws()}/flow-runs/${id}`)).body;
const finished = (id: string, seconds = 20): Promise<Any> =>
  until(
    () => read(id),
    (r) => r.status !== "running",
    seconds,
  );
async function start(path: string, input: unknown = {}, as = alice): Promise<string> {
  const response = await as.post(`${ws()}/flow-runs`, { flow: path, input });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.id;
}
const step = (flowRun: Any, node: string, item = "") =>
  flowRun.steps.find((s: Any) => s.node === node && s.item === item);
async function deploy(content: Bundle) {
  const uploaded = await alice.post(`${ws()}/bundles`, content);
  if (uploaded.status >= 300) return uploaded;
  return alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
}

beforeAll(async () => {
  t = await startTestApp();
  url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  chat = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      notified.push(body);
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => chat.listen(0, "127.0.0.1", resolve));

  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const seed = async (slug: string, email: string) => {
    const id = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
    const grant = await t.admin.post(`/tenants/${id}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    const member = await t.admin.post(`/tenants/${id}/members`, {
      email,
      name: email,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${id}/bindings`, {
      principalType: "member",
      principalId: member.body.id,
      roleId: roles.tenant_admin,
    });
    await t.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
    return { id, client: await t.signIn(email, PASSWORD) };
  };
  const acme = await seed("acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
  const globex = await seed("globex", "gina@globex.example");
  other = globex.client;
  otherTenant = globex.id;
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
    })
  ).body.id;

  const member = await alice.post(`/tenants/${tenant}/members`, {
    email: "bob@acme.example",
    name: "Bob",
    password: PASSWORD,
  });
  await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: dev,
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.developer,
  });
  bob = await t.signIn("bob@acme.example", PASSWORD);

  await alice.put(`${ws()}/connection-bindings/chat`, {
    config: { baseUrl: `http://127.0.0.1:${(chat.address() as AddressInfo).port}/hook` },
  });
  await alice.patch(ws(), { failureAlert: { notify: "chat" } });
  expect((await deploy(bundle())).status).toBe(201);

  const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "flows" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1, concurrency: 6 });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker?.stop();
  await working;
  chat.closeAllConnections();
  await new Promise((resolve) => chat.close(resolve));
  await t.stop();
});

describe("a bundle with a broken flow is refused at upload, with the flow, node and field named", () => {
  const problems = async (broken: BundleManifest) => {
    const response = await alice.post(
      `${ws()}/bundles`,
      bundle("broken", (m) => [...m, broken]),
    );
    expect(response.status).toBe(400);
    return (response.body.errors as { path: string; message: string }[]).map(
      (e) => `${e.path}: ${e.message}`,
    );
  };

  test("graph mistakes", async () => {
    expect(
      await problems(
        flow("bad", { start: manual, a: set({ x: "1" }), b: set({ y: "2" }) }, [
          ["start", "a"],
          ["a", "b"],
          ["b", "a"],
        ]),
      ),
    ).toEqual([
      "bad (flow): /body/nodes/a the flow loops back on itself: a -> b -> a. Use a foreach to repeat",
    ]);
    expect(
      await problems(
        flow("bad", { start: manual, a: set({ x: "1" }), lonely: set({ y: "2" }) }, [
          ["start", "a"],
          ["a", "ghost"],
        ]),
      ),
    ).toEqual([
      'bad (flow): /body/edges/1/to there is no node "ghost"',
      "bad (flow): /body/nodes/lonely no trigger leads to this node",
    ]);
    expect(
      await problems(flow("bad", { start: manual, j: { type: "join" } }, [["start", "j"]])),
    ).toEqual([
      "bad (flow): /body/nodes/j a join waits for several paths, so it needs at least two incoming edges",
    ]);
    expect(await problems(flow("bad", { a: set({ x: "1" }) }, []))).toEqual([
      "bad (flow): /body/nodes a flow needs at least one trigger node",
      "bad (flow): /body/nodes/a no trigger leads to this node",
    ]);
  });

  test("expressions that do not parse, and references to things that are not there", async () => {
    expect(
      (
        await problems(
          flow("bad", { start: manual, a: set({ x: "trigger.n >" }) }, [["start", "a"]]),
        )
      )[0],
    ).toMatch(/^bad \(flow\): \/body\/nodes\/a\/values\/x is not a valid expression: /);
    expect(
      await problems(
        flow(
          "bad",
          {
            start: manual,
            a: run("no-such-script"),
            b: { type: "subflow", flow: "many-triggers-x" },
          },
          [
            ["start", "a"],
            ["a", "b"],
          ],
        ),
      ),
    ).toEqual([
      'bad (flow): /body/nodes/a/script refers to "no-such-script", which is not a script in this repository.',
      'bad (flow): /body/nodes/b/flow refers to "many-triggers-x", which is not a flow in this repository.',
    ]);
    expect(
      await problems(
        flow(
          "bad",
          {
            start: { type: "trigger", trigger: { type: "webhook" } },
            sub: { type: "subflow", flow: "bad" },
          },
          [["start", "sub"]],
        ),
      ),
    ).toEqual([
      'bad (flow): /body/nodes/sub/flow uses the flow "bad", which has no manual trigger to start it from.',
      "bad (flow): flows use each other in a circle: bad -> bad.",
    ]);
  });
});

describe("running a flow", () => {
  test("steps run in order, each using what the ones before produced", async () => {
    const id = await start("linear", { n: 3 });
    const done = await finished(id);
    expect(done).toMatchObject({
      status: "succeeded",
      flow: "linear",
      triggerNode: "start",
      trigger: { type: "manual" },
      output: { c: { result: 12, label: "one" } },
    });
    expect(done.steps.map((s: Any) => [s.node, s.status])).toEqual([
      ["start", "succeeded"],
      ["a", "succeeded"],
      ["b", "succeeded"],
      ["c", "succeeded"],
    ]);
    expect(step(done, "a").output).toEqual({ n: 6 });
    expect(step(done, "b").output).toEqual({ n: 12 });

    // A code step is an ordinary run, linked to its flow, with its own logs.
    const stepRun = (await alice.get(`${ws()}/runs/${step(done, "a").runId}`)).body;
    expect(stepRun).toMatchObject({
      script: "double",
      status: "succeeded",
      input: { n: 3 },
      trigger: { type: "flow", flowRunId: id, node: "a" },
    });
    const logs = await until(
      async () => (await alice.get(`${ws()}/runs/${stepRun.id}/logs`)).body,
      (l) => l.items.length > 0,
    );
    expect(logs.items[0]).toMatchObject({ message: "Doubling", fields: { n: 3 } });
    expect((await alice.get(`${ws()}/flow-runs?flow=linear`)).body.items[0].id).toBe(id);
    const audit = await alice.get(`/tenants/${tenant}/audit?action=flow_run.started`);
    expect(audit.body.items[0]).toMatchObject({ targetId: id, details: { flow: "linear" } });
  });

  test("a branch follows one case, and a join does not wait for the path not taken", async () => {
    expect((await finished(await start("branching", { total: 500 }))).output).toEqual({
      done: { kind: "large" },
    });
    const small = await finished(await start("branching", { total: 5 }));
    expect(small.output).toEqual({ done: { kind: "small" } });
    expect(step(small, "size")).toMatchObject({ outputName: "otherwise" });
    expect(step(small, "large_path").status).toBe("skipped");
    expect(step(small, "small_path").status).toBe("succeeded");
  });

  test("parallel paths both run, and the join waits for both", async () => {
    const done = await finished(await start("parallel", { a: 1, b: 10 }));
    expect(done.output).toEqual({ total: { sum: 22 } });
    const [left, right] = [step(done, "left"), step(done, "right")];
    // Both were started before either finished.
    expect(Date.parse(left.startedAt)).toBeLessThan(Date.parse(right.finishedAt));
    expect(Date.parse(right.startedAt)).toBeLessThan(Date.parse(left.finishedAt));
  });

  test("a foreach runs once per item and gives the results in order", async () => {
    const done = await finished(await start("looping", { numbers: [1, 2, 3, 4, 5] }));
    expect(done.output).toEqual({ done: { out: [2, 6, 10, 14, 18] } });
    expect(done.steps.filter((s: Any) => s.node === "each" && s.item !== "")).toHaveLength(5);
    expect((await finished(await start("looping", { numbers: [] }))).output).toEqual({
      done: { out: [] },
    });

    const notList = await finished(await start("looping", { numbers: "seven" }));
    expect(notList.status).toBe("failed");
    expect(notList.error.message).toContain('"items" must give a list');
  });

  test("a failed step takes its error path when it has one", async () => {
    const fine = await finished(await start("recovering", { fail: false }));
    expect(fine.output).toEqual({ fine: { outcome: "fine" } });
    expect(step(fine, "recovered").status).toBe("skipped");

    const recovered = await finished(await start("recovering", { fail: true }));
    expect(recovered.status).toBe("succeeded");
    expect(recovered.output).toEqual({
      recovered: { outcome: "recovered", why: "The ERP said no" },
    });
    expect(step(recovered, "attempt")).toMatchObject({
      status: "failed",
      handled: true,
      error: { message: "The ERP said no" },
    });
    expect(step(recovered, "fine").status).toBe("skipped");
  });

  test("a failed step with no error path fails the flow, and the workspace is alerted once", async () => {
    const before = notified.length;
    const id = await start("unhandled");
    const failed = await finished(id);
    expect(failed).toMatchObject({
      status: "failed",
      error: { message: 'The step "attempt" failed: The ERP said no' },
    });
    expect(step(failed, "never")).toBeUndefined();
    await until(
      async () => notified.length,
      (n) => n > before,
    );
    const alerts = notified.slice(before).map((body) => JSON.parse(body));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ run: { id, script: "unhandled" } });

    const stopped = await finished(await start("stopping", { reason: "out of stock" }));
    expect(stopped.error.message).toBe('The step "stop" failed: Stopped: out of stock');
  });

  test("a mistake in an expression fails its step with a message for the author", async () => {
    const failed = await finished(await start("linear", { wrong: 1 }));
    expect(failed.status).toBe("failed");
    expect(failed.error.message).toBe(
      'The step "a" failed: The expression for "input" could not be evaluated: No such key: n',
    );
    // Input that does not fit the script fails the step too.
    const bad = await finished(await start("linear", { n: "three" }));
    expect(bad.error.message).toContain(
      "The input does not match the script's schema. /input/n must be number",
    );
  });

  test("an output too large to hold is kept out of flow state, and expressions see a note in its place", async () => {
    const done = await finished(await start("heavy"));
    expect(done.status).toBe("succeeded");
    expect(done.output.use.note).toMatch(/too large to use in an expression/);
    expect(step(done, "make").output).toEqual({
      stored: expect.stringMatching(/^runs\/.+\/output\.json$/),
    });
  });

  test("a sub-flow runs as a step, and a foreach can run a flow per item", async () => {
    const parent = await finished(await start("parent", { n: 5 }));
    expect(parent.output).toEqual({ wrap: { from_child: 20 } });
    const child = await read(step(parent, "child").childFlowRunId);
    expect(child).toMatchObject({
      flow: "linear",
      status: "succeeded",
      parentFlowRunId: parent.id,
      trigger: { type: "flow" },
    });
    // Sub-flow runs are left out of the list unless asked for.
    const listed = (await alice.get(`${ws()}/flow-runs?flow=linear&limit=200`)).body.items.map(
      (r: Any) => r.id,
    );
    expect(listed).not.toContain(child.id);
    expect(
      (await alice.get(`${ws()}/flow-runs?flow=linear&limit=200&all=true`)).body.items.map(
        (r: Any) => r.id,
      ),
    ).toContain(child.id);

    const fanout = await finished(await start("fanout", { numbers: [1, 2, 3] }), 40);
    expect(fanout.output).toEqual({ done: { results: [4, 8, 12] } });
  }, 60_000);
});

describe("a flow chosen when the step runs", () => {
  test("the expression chooses one of the flows written beside it, and that flow runs", async () => {
    const chosen = await finished(await start("chooser", { which: "linear", n: 5 }));
    expect(chosen.status).toBe("succeeded");
    expect(chosen.output).toMatchObject({ wrap: { from_child: { c: { result: 20 } } } });
    expect((await read(step(chosen, "child").childFlowRunId)).flow).toBe("linear");

    // In a foreach, each item may choose.
    const fanout = await finished(
      await start("fanout-chosen", {
        jobs: [
          { flow: "linear", n: 1 },
          { flow: "linear", n: 2 },
        ],
      }),
      40,
    );
    expect(fanout.output).toEqual({ done: { results: [4, 8] } });
  }, 60_000);

  test("a flow that is not on the list is not started, whatever the data says", async () => {
    const refused = await finished(await start("chooser", { which: "parent", n: 5 }));
    expect(refused.status).toBe("failed");
    expect(step(refused, "child").error.message).toBe(
      '"flowFrom" gave "parent", which is not a flow this step may start. It may start: linear, impatient.',
    );
    expect(step(refused, "child").childFlowRunId).toBeNull();
    const notText = await finished(await start("chooser", { which: 7, n: 5 }));
    expect(step(notText, "child").error.message).toContain('"flowFrom" gave 7');
  });

  test("the list is checked when the bundle is built, like a flow named outright", async () => {
    const problems = async (node: object) => {
      const response = await alice.post(
        `${ws()}/bundles`,
        bundle("broken", (m) => [
          ...m,
          flow("bad", { start: manual, sub: node }, [["start", "sub"]]),
        ]),
      );
      expect(response.status).toBe(400);
      return (response.body.errors as { path: string; message: string }[]).map(
        (e) => `${e.path}: ${e.message}`,
      );
    };
    expect(await problems({ type: "subflow", flowFrom: "trigger.which" })).toEqual([
      "bad (flow): /body/nodes/sub/allow `flowFrom` and `allow` go together: the expression chooses, and the list says what it may choose",
    ]);
    expect(
      await problems({
        type: "subflow",
        flow: "linear",
        flowFrom: "trigger.which",
        allow: ["linear"],
      }),
    ).toEqual([
      "bad (flow): /body/nodes/sub/flowFrom name the flow with `flow`, or choose it with `flowFrom`: not both",
    ]);
    expect(await problems({ type: "subflow" })).toEqual([
      "bad (flow): /body/nodes/sub/flow a subflow names a flow, or chooses one with `flowFrom`",
    ]);
    expect(
      (
        await problems({
          type: "subflow",
          flowFrom: "trigger.which",
          allow: ["linear", "no-such-flow"],
        })
      ).join("\n"),
    ).toContain("no-such-flow");
    expect(
      (await problems({ type: "subflow", flowFrom: "trigger.which >", allow: ["linear"] }))[0],
    ).toMatch(/\/body\/nodes\/sub\/flowFrom is not a valid expression/);
  });
});

describe("starting one flow and no other", () => {
  test("someone allowed to start a single flow starts it, reads how it ended, and nothing else", async () => {
    const role = await alice.post(`/tenants/${tenant}/roles`, {
      name: "flow_starter",
      description: "Starts flows it is bound to.",
      permissions: ["flow_run:write"],
    });
    const member = await alice.post(`/tenants/${tenant}/members`, {
      email: "petra@acme.example",
      name: "Petra",
      password: PASSWORD,
    });
    expect(member.status, JSON.stringify(member.body)).toBe(201);
    const linear = (await alice.get(`${ws()}/resources/linear`)).body;
    await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: dev,
      resourceId: linear.id,
      principalType: "member",
      principalId: member.body.id,
      roleId: role.body.id,
    });
    const petra = await t.signIn("petra@acme.example", PASSWORD);

    const started = await petra.post(`${ws()}/flow-runs`, { flow: "linear", input: { n: 3 } });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    // A flow she was not given, and one that does not exist, answer the same.
    expect(
      (await petra.post(`${ws()}/flow-runs`, { flow: "parent", input: { n: 1 } })).status,
    ).toBe(403);
    expect(
      (await petra.post(`${ws()}/flow-runs`, { flow: "no-such-flow", input: {} })).status,
    ).toBe(403);

    await finished(started.body.id);
    const hers = await petra.get(`${ws()}/flow-runs/${started.body.id}`);
    expect(hers.status).toBe(200);
    expect(hers.body.status).toBe("succeeded");
    expect(hers.body.output).toMatchObject({ c: { result: 12 } });
    // What each step produced is not hers to read.
    expect(hers.body.steps).toEqual([]);
    expect(
      (await alice.get(`${ws()}/flow-runs/${started.body.id}`)).body.steps.length,
    ).toBeGreaterThan(0);

    // Someone else's run does not exist for her, and neither does the list.
    const aliceRun = await start("linear", { n: 1 });
    expect((await petra.get(`${ws()}/flow-runs/${aliceRun}`)).status).toBe(403);
    expect((await petra.get(`${ws()}/flow-runs`)).status).toBe(403);
    expect((await petra.post(`${ws()}/flow-runs/${started.body.id}/cancel`)).status).toBe(403);
  });
});

describe("waiting", () => {
  test("a delay holds the flow until its time comes", async () => {
    const id = await start("waiting");
    const paused = await until(
      () => read(id),
      (r) => step(r, "pause")?.status === "waiting",
    );
    expect(paused.status).toBe("running");
    expect(Date.parse(step(paused, "pause").wakeAt)).toBeGreaterThan(Date.now() + 3000_000);
    expect(await advanceDueFlows(t.kernel)).toBe(0);

    await t.db
      .updateTable("step_run")
      .set({ wake_at: new Date(Date.now() - 1000) })
      .where("flow_run_id", "=", id)
      .where("node_id", "=", "pause")
      .execute();
    expect(await advanceDueFlows(t.kernel)).toBe(1);
    expect((await read(id)).output).toEqual({ after: { done: true } });
  });

  test("an approval waits for a person, and only someone permitted may decide", async () => {
    const id = await start("approving", { id: "1001", total: 1250 }, bob);
    await until(
      () => read(id),
      (r) => step(r, "gate")?.status === "waiting",
    );

    const pending = (await alice.get(`${ws()}/approvals`)).body.items;
    expect(pending).toEqual([
      expect.objectContaining({
        flowRunId: id,
        flow: "approving",
        node: "gate",
        title: "Approve the order",
        detail: { order: "1001", total: 1250 },
      }),
    ]);
    expect((await alice.get(`/tenants/${tenant}/approvals`)).body.items).toHaveLength(1);
    // A developer started it, sees it, but cannot approve it.
    expect((await bob.get(`${ws()}/approvals`)).status).toBe(200);
    expect((await bob.get(`/tenants/${tenant}/approvals`)).status).toBe(403);
    expect(
      (await bob.post(`${ws()}/flow-runs/${id}/approvals/gate`, { decision: "approve" })).status,
    ).toBe(403);

    expect(
      (
        await alice.post(`${ws()}/flow-runs/${id}/approvals/gate`, {
          decision: "approve",
          comment: "Known customer",
        })
      ).status,
    ).toBe(204);
    const done = await finished(id);
    expect(done.output).toEqual({ send: { sent: "1001" } });
    expect(step(done, "gate").output).toEqual({ approved: true, comment: "Known customer" });
    // Deciding twice is refused.
    expect(
      (await alice.post(`${ws()}/flow-runs/${id}/approvals/gate`, { decision: "reject" })).status,
    ).toBe(409);
    expect(
      (await alice.post(`${ws()}/flow-runs/${id}/approvals/start`, { decision: "approve" })).status,
    ).toBe(404);

    const audit = await alice.get(`/tenants/${tenant}/audit?action=approval.approved`);
    expect(audit.body.items[0]).toMatchObject({
      targetId: id,
      details: { node: "gate", title: "Approve the order", comment: "Known customer" },
    });
    expect((await alice.get(`${ws()}/approvals`)).body.items).toEqual([]);
  });

  test("a rejection fails the step, which takes its error path", async () => {
    const id = await start("approving", { id: "1002", total: 9000 });
    await until(
      () => read(id),
      (r) => step(r, "gate")?.status === "waiting",
    );
    await alice.post(`${ws()}/flow-runs/${id}/approvals/gate`, {
      decision: "reject",
      comment: "Over the limit",
    });
    const done = await finished(id);
    expect(done.status).toBe("succeeded");
    expect(done.output).toEqual({ refused: { why: "Rejected: Over the limit" } });
    expect(step(done, "send").status).toBe("skipped");
  });

  test("an approval nobody decides times out and fails", async () => {
    const id = await start("impatient");
    await until(
      () => read(id),
      (r) => step(r, "gate")?.status === "waiting",
    );
    await t.db
      .updateTable("step_run")
      .set({ wake_at: new Date(Date.now() - 1000) })
      .where("flow_run_id", "=", id)
      .where("node_id", "=", "gate")
      .execute();
    await advanceDueFlows(t.kernel);
    expect((await read(id)).error.message).toBe(
      'The step "gate" failed: Nobody decided before the approval timed out.',
    );
  });

  test("a flow run can be cancelled, and its running step is cancelled with it", async () => {
    const id = await start("slow-flow", { ms: 20_000 });
    const running = await until(
      () => read(id),
      (r) => step(r, "work")?.runId != null,
    );
    await until(
      async () => (await alice.get(`${ws()}/runs/${step(running, "work").runId}`)).body,
      (r) => r.status === "running",
    );
    expect((await alice.post(`${ws()}/flow-runs/${id}/cancel`)).body.status).toBe("cancelled");
    expect((await alice.get(`${ws()}/runs/${step(running, "work").runId}`)).body.status).toBe(
      "cancelled",
    );
    expect(step(await read(id), "work").status).toBe("cancelled");
    expect((await alice.post(`${ws()}/flow-runs/${id}/cancel`)).status).toBe(409);
  });
});

describe("events and triggers", () => {
  test("a flow with several triggers: each one walks only its own part of the graph", async () => {
    const byHand = await finished(await start("many-triggers"));
    expect(byHand.output).toEqual({ hand_path: { via: "hand" } });
    expect(byHand.steps.map((s: Any) => s.node).sort()).toEqual(["by_hand", "hand_path"]);

    const detail = (await alice.get(`${ws()}/flows/many-triggers`)).body;
    expect(detail.triggers.map((x: Any) => [x.node, x.type]).sort()).toEqual([
      ["by_event", "event"],
      ["by_hook", "webhook"],
      ["nightly", "schedule"],
    ]);
    const hook = detail.triggers.find((x: Any) => x.type === "webhook");
    expect(
      (await bob.get(`${ws()}/flows/many-triggers`)).body.triggers.find(
        (x: Any) => x.type === "webhook",
      ).url,
    ).toBeNull();

    const delivered = await t.anonymous.post(new URL(hook.url).pathname.replace("/api/v1", ""), {
      name: "Ada",
    });
    expect(delivered.status).toBe(202);
    const byHook = await finished(delivered.body.runId);
    expect(byHook).toMatchObject({
      triggerNode: "by_hook",
      trigger: { type: "webhook", trigger: "many-triggers#by_hook" },
      output: { hook_path: { via: "hook", name: "Ada" } },
    });

    const night = new Date(detail.triggers.find((x: Any) => x.type === "schedule").nextFireAt);
    expect(night.getUTCHours()).toBe(2);
    expect(await fireDueSchedules(t.kernel, new Date(night.getTime() + 1000))).toBe(1);
    const scheduled = await until(
      async () => (await alice.get(`${ws()}/flow-runs?flow=many-triggers`)).body.items,
      (items) => items.some((r: Any) => r.triggerNode === "nightly"),
    );
    expect(
      (await finished(scheduled.find((r: Any) => r.triggerNode === "nightly").id)).output,
    ).toEqual({ night_path: { via: "schedule" } });
  });

  test("publishing an event starts every subscriber once, and a filter decides who hears it", async () => {
    const small = await alice.post(`${ws()}/events`, {
      name: "orders/placed",
      payload: { id: "o-1", total: 20 },
    });
    // The flow listens to every order. The script trigger only to large ones.
    expect(small.body).toMatchObject({ started: 1 });
    const large = await alice.post(`${ws()}/events`, {
      name: "orders/placed",
      payload: { id: "o-2", total: 900 },
    });
    expect(large.body).toMatchObject({ started: 2 });

    const flows = await until(
      async () =>
        (await alice.get(`${ws()}/flow-runs?flow=many-triggers&limit=50`)).body.items.filter(
          (r: Any) => r.triggerNode === "by_event",
        ),
      (items) => items.length === 2 && items.every((r: Any) => r.status !== "running"),
    );
    expect(flows.map((r: Any) => r.trigger.eventId).sort()).toEqual(
      [small.body.id, large.body.id].sort(),
    );
    expect(
      (await read(flows.find((r: Any) => r.trigger.eventId === large.body.id).id)).output,
    ).toEqual({ event_path: { via: "event", order: "o-2" } });

    const sinks = (await alice.get(`${ws()}/runs?script=sink`)).body.items.filter(
      (r: Any) => r.trigger.type === "event" && r.trigger.event === "orders/placed",
    );
    expect(sinks).toHaveLength(1);
    expect(sinks[0].trigger).toMatchObject({
      event: "orders/placed",
      eventId: large.body.id,
      depth: 1,
    });

    const listed = (await alice.get(`${ws()}/events?name=orders/placed`)).body.items;
    expect(listed.map((e: Any) => e.payload.id)).toEqual(["o-2", "o-1"]);
    expect(listed[0].source).toMatchObject({ type: "api" });
  });

  test("a payload that breaks the schema, an unknown event and a platform name are refused", async () => {
    const wrong = await alice.post(`${ws()}/events`, {
      name: "orders/placed",
      payload: { id: "o-3" },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors).toEqual([
      { path: "/payload", message: "must have required property 'total'" },
    ]);
    expect(
      (await alice.post(`${ws()}/events`, { name: "orders/unknown", payload: {} })).status,
    ).toBe(404);
    expect(
      (await alice.post(`${ws()}/events`, { name: "platform/run-failed", payload: {} })).status,
    ).toBe(400);
  });

  test("a script publishes the events it declared, and no others", async () => {
    const before = (await alice.get(`${ws()}/events?name=orders/placed`)).body.items.length;
    const publish = (event: string) =>
      alice.post(`${ws()}/runs`, {
        script: "publisher",
        input: { event, payload: { id: "o-9", total: 150 } },
      });
    const ended = (id: string) =>
      until(
        async () => (await alice.get(`${ws()}/runs/${id}`)).body,
        (r) => r.status !== "queued" && r.status !== "running",
      );
    const ok = await ended((await publish("orders/placed")).body.id);
    expect(ok.status).toBe("succeeded");
    const after = (await alice.get(`${ws()}/events?name=orders/placed`)).body.items;
    expect(after).toHaveLength(before + 1);
    expect(after[0].source).toEqual({ type: "script", id: ok.id });

    const denied = await ended((await publish("orders/secret")).body.id);
    expect(denied.status).toBe("failed");
    expect(denied.error.message).toContain('a declared use of the event "orders/secret"');
  });

  test("a publish that rolls back starts nothing", async () => {
    const count = async () =>
      (await alice.get(`${ws()}/events?name=orders/placed&limit=200`)).body.items.length;
    const runs = async () =>
      (await alice.get(`${ws()}/flow-runs?flow=many-triggers&limit=200`)).body.items.length;
    const [events, flows] = [await count(), await runs()];
    await expect(
      t.db.transaction().execute(async (trx) => {
        await publishEvent(t.kernel, trx, {
          tenantId: tenant,
          workspaceId: dev,
          name: "orders/placed",
          payload: { id: "o-x", total: 1 },
          source: { type: "api" },
        });
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");
    expect([await count(), await runs()]).toEqual([events, flows]);
  });

  test("an event too deep in a chain of events is stored but starts nothing", async () => {
    const published = await t.db.transaction().execute((trx) =>
      publishEvent(t.kernel, trx, {
        tenantId: tenant,
        workspaceId: dev,
        name: "orders/placed",
        payload: { id: "deep", total: 999 },
        source: { type: "api" },
        depth: 10,
      }),
    );
    expect(published.started).toEqual([]);
    expect((await alice.get(`${ws()}/events?name=orders/placed`)).body.items[0].payload.id).toBe(
      "deep",
    );
  });

  test("the platform's own events reach their subscribers", async () => {
    const failing = (await alice.post(`${ws()}/runs`, { script: "risky", input: { fail: true } }))
      .body.id;
    // Other runs have failed in this suite too, each with its own event. Find the one for this run.
    const detail = await until(
      async () => {
        const heard = (await alice.get(`${ws()}/runs?script=sink&limit=100`)).body.items.filter(
          (r: Any) => r.trigger.event === "platform/run-failed" && r.status === "succeeded",
        );
        for (const candidate of heard) {
          const found = (await alice.get(`${ws()}/runs/${candidate.id}`)).body;
          if (found.input.runId === failing) return found;
        }
        return undefined;
      },
      (found) => found !== undefined,
    );
    expect(detail.input).toMatchObject({
      runId: failing,
      script: "risky",
      error: "The ERP said no",
    });
    expect(detail.trigger).toMatchObject({ type: "event", event: "platform/run-failed" });
    // Nothing listens for runs that succeed, so no such event is stored.
    expect((await alice.get(`${ws()}/events?name=platform/run-succeeded`)).body.items).toEqual([]);
  });
});

describe("durability", () => {
  const runsOf = async (flowRunId: string) =>
    (
      await t.db
        .selectFrom("run")
        .select(["step_node", "id"])
        .where("flow_run_id", "=", flowRunId)
        .execute()
    )
      .map((r) => r.step_node)
      .sort();

  test("a flow run that was started when the control plane stopped is picked up when it starts again", async () => {
    // The run is committed, and then nothing advances it: the process is gone.
    const started = await t.db.transaction().execute((trx) =>
      startFlowRun(t.kernel, trx, {
        tenantId: tenant,
        workspaceId: dev,
        flow: "linear",
        input: { n: 1 },
        trigger: { type: "manual" },
        startedBy: { type: "system", id: null },
      }),
    );
    await sleep(500);
    expect((await read(started.flowRun.id)).steps.map((s: Any) => s.node)).toEqual(["start"]);
    // On start, the control plane looks for flow runs with something to do.
    expect(await advanceDueFlows(t.kernel)).toBeGreaterThanOrEqual(1);
    expect((await finished(started.flowRun.id)).output).toEqual({ c: { result: 4, label: "one" } });
    expect(await runsOf(started.flowRun.id)).toEqual(["a", "b"]);
  });

  test("a step that finished while nothing was watching is noticed, and no step runs twice", async () => {
    const id = await start("slow-flow", { ms: 20_000 });
    const running = await until(
      () => read(id),
      (r) => step(r, "work")?.runId != null,
    );
    const runId = step(running, "work").runId;
    await until(
      async () => (await alice.get(`${ws()}/runs/${runId}`)).body,
      (r) => r.status === "running",
    );
    // The step's result reaches the database, and the control plane dies before acting on it.
    await t.db
      .updateTable("run")
      .set({
        status: "succeeded",
        output: JSON.stringify({ label: "recorded" }),
        finished_at: new Date(),
      })
      .where("id", "=", runId)
      .execute();
    expect(step(await read(id), "work").status).toBe("running");

    expect(await advanceDueFlows(t.kernel)).toBe(1);
    const done = await read(id);
    expect(done).toMatchObject({
      status: "succeeded",
      output: { after: { label: "recorded", version: "one" } },
    });
    // Advancing again, any number of times, changes nothing and starts nothing.
    await advanceDueFlows(t.kernel);
    await advanceDueFlows(t.kernel);
    expect(await runsOf(id)).toEqual(["work"]);
    expect((await read(id)).steps).toHaveLength(3);
  });

  test("a flow run in progress finishes on the bundle it started with", async () => {
    const id = await start("slow-flow", { ms: 2500 });
    await until(
      () => read(id),
      (r) => step(r, "work")?.runId != null,
    );
    expect((await deploy(bundle("two"))).status).toBe(201);
    const done = await finished(id);
    expect(done.output).toEqual({ after: { label: "one", version: "one" } });
    expect((await finished(await start("slow-flow", { ms: 10 }))).output).toEqual({
      after: { label: "two", version: "two" },
    });
  }, 60_000);
});

describe("layout, isolation and guards", () => {
  test("moving nodes saves their positions and changes nothing about the flow", async () => {
    const before = (await alice.get(`${ws()}/flows/linear`)).body;
    expect(before.layout).toEqual({});
    expect(Object.keys(before.nodes).sort()).toEqual(["a", "b", "c", "start"]);
    const saved = await alice.put(`${ws()}/flow-layouts/linear`, {
      positions: { a: { x: 120, y: 40 }, gone: { x: 1, y: 1 } },
    });
    expect(saved.status).toBe(204);
    const after = (await alice.get(`${ws()}/flows/linear`)).body;
    expect(after.layout).toEqual({ a: { x: 120, y: 40 } });
    expect(after.version).toBe(before.version);
    expect((await alice.get(`${ws()}/resources/linear`)).body.version).toBe(before.version);
    expect((await bob.put(`${ws()}/flow-layouts/linear`, { positions: {} })).status).toBe(403);
    expect((await alice.put(`${ws()}/flow-layouts/nope`, { positions: {} })).status).toBe(404);
  });

  test("the flow list shows each flow with its triggers and latest run", async () => {
    const flows = (await alice.get(`${ws()}/flows`)).body.items;
    const many = flows.find((f: Any) => f.path === "many-triggers");
    expect(many).toMatchObject({
      nodeCount: 8,
      triggers: ["event", "manual", "schedule", "webhook"],
    });
    expect(many.lastRun.status).toBe("succeeded");
  });

  test("another tenant sees none of it", async () => {
    for (const path of ["flows", "flow-runs", "approvals", "events", "flows/linear"]) {
      expect((await other.get(`${ws()}/${path}`)).status, path).toBe(404);
    }
    expect((await other.post(`${ws()}/flow-runs`, { flow: "linear" })).status).toBe(404);
    expect((await other.get(`/tenants/${otherTenant}/approvals`)).body.items).toEqual([]);
  });

  test("every change by a principal left an audit entry, and every such route was exercised", () => {
    expect(t.unaudited, JSON.stringify(t.unaudited)).toEqual([]);
    const flows = /\/(flow-runs|flow-layouts|events)(\/|$)/;
    expect(t.unexercised((route) => flows.test(route) && !route.includes("/worker/"))).toEqual([]);
  });
});
