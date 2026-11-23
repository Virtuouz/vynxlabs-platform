import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Message } from "./kernel/mail.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let alice: Client; // tenant admin
let ids: Record<string, string>;
const sent: Message[] = [];

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;
const flow = (approvers?: { groups?: string[]; roles?: string[] }) => ({
  nodes: {
    start: { type: "trigger", trigger: { type: "manual" } },
    ask: {
      type: "approval",
      title: "Refund the Brooks family",
      detail: "{'amount': trigger.amount}",
      surface: "tenant",
      ...(approvers ? { approvers } : {}),
    },
    done: { type: "set", values: { refunded: "trigger.amount" } },
  },
  edges: [
    { from: "start", to: "ask" },
    { from: "ask", to: "done" },
  ],
});
const linkOf = (message: Message) =>
  /\/approve\/([A-Za-z0-9_-]+)/.exec(message.text)?.[1] as string;
const mailTo = (email: string) => sent.filter((message) => message.to === email);

// biome-ignore lint/suspicious/noExplicitAny: run bodies are inspected freely
async function flowRun(id: string, until: (run: any) => boolean): Promise<any> {
  for (let i = 0; i < 150; i++) {
    const body = (await alice.get(`${ws()}/flow-runs/${id}`)).body;
    if (until(body)) return body;
    await sleep(50);
  }
  throw new Error("The flow run did not get there.");
}
async function waitForMail(count: number) {
  for (let i = 0; i < 100 && sent.length < count; i++) await sleep(50);
}
/** Deploys the flow with these approvers, runs it, and waits for its mail. */
async function asking(
  approvers: { groups?: string[]; roles?: string[] } | undefined,
  expected: number,
) {
  sent.length = 0;
  await alice.put(`${ws()}/drafts/refunds/approve`, {
    kind: "flow",
    schemaVersion: 1,
    body: flow(approvers),
  });
  expect((await alice.post(`${ws()}/changes/deploy`, {})).status).toBeLessThan(300);
  const started = await alice.post(`${ws()}/flow-runs`, {
    flow: "refunds/approve",
    input: { amount: 120 },
  });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  await flowRun(started.body.id, (run) => run.state === "waiting_approval");
  await waitForMail(expected);
  await sleep(100);
  return started.body.id as string;
}

beforeAll(async () => {
  t = await startTestApp();
  t.kernel.mail.deliver = async (message) => {
    sent.push(message);
  };
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  ids = {};
  const member = async (key: string, role?: string) => {
    const created = await t.admin.post(`/tenants/${tenant}/members`, {
      email: `${key}@acme.example`,
      name: key[0]?.toUpperCase() + key.slice(1),
      password: PASSWORD,
    });
    ids[key] = created.body.id;
    if (role) {
      await t.admin.post(`/tenants/${tenant}/bindings`, {
        principalType: "member",
        principalId: created.body.id,
        roleId: role,
      });
    }
  };
  await member("alice", roles.tenant_admin);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  const approver = (
    await alice.post(`/tenants/${tenant}/roles`, {
      name: "refund_approver",
      permissions: ["approval:*", "flow_run:read"],
    })
  ).body.id;
  ids.approverRole = approver;
  await member("bob", approver);
  await member("carol", roles.viewer);
  await member("dave", approver);
  const finance = (await alice.post(`/tenants/${tenant}/groups`, { name: "Finance" })).body.id;
  await alice.put(`/tenants/${tenant}/groups/${finance}/members/${ids.bob}`, {});
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  // Dave is suspended: he is asked nothing.
  await alice.patch(`/tenants/${tenant}/members/${ids.dave}`, { suspended: true });
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

describe("approval mail", () => {
  test("goes to each member who may decide, with a link of their own, and to nobody else", async () => {
    await asking(undefined, 2);
    expect(sent.map((message) => message.to).sort()).toEqual([
      "alice@acme.example",
      "bob@acme.example",
    ]);
    const mail = mailTo("bob@acme.example")[0] as Message;
    expect(mail.subject).toBe("Approval needed: Refund the Brooks family");
    expect(mail.text).toContain("The flow refunds/approve in Dev (Acme) waits for a decision:");
    expect(mail.text).toContain('"amount": 120');
    expect(mail.text).toMatch(/It works once, until .*GMT, or until someone decides/);
    expect(linkOf(mail)).not.toBe(linkOf(mailTo("alice@acme.example")[0] as Message));
    const stored = await t.db.selectFrom("approval_link").select(["token_hash"]).execute();
    expect(stored.every((row) => row.token_hash !== linkOf(mail))).toBe(true);
  });

  test("shows what the queue shows: a secret-looking value is masked in the mail and on the link's page", async () => {
    sent.length = 0;
    const body = flow();
    body.nodes.ask.detail = "{'amount': trigger.amount, 'apiKey': trigger.key, 'note': 'ok'}";
    await alice.put(`${ws()}/drafts/refunds/secret`, { kind: "flow", schemaVersion: 1, body });
    expect((await alice.post(`${ws()}/changes/deploy`, {})).status).toBeLessThan(300);
    const started = await alice.post(`${ws()}/flow-runs`, {
      flow: "refunds/secret",
      input: { amount: 120, key: "k-live-98765" },
    });
    await flowRun(started.body.id, (run) => run.state === "waiting_approval");
    await waitForMail(2);
    const mail = mailTo("bob@acme.example")[0] as Message;
    expect(mail.text).not.toContain("k-live-98765");
    expect(mail.text).toContain('"apiKey": "[redacted]"');
    const page = await t.anonymous.get(`/approval-links/${linkOf(mail)}`);
    expect(JSON.stringify(page.body)).not.toContain("k-live-98765");
    expect(page.body.detail).toEqual({ amount: 120, apiKey: "[redacted]", note: "ok" });
    const queue = await alice.get(`/tenants/${tenant}/approvals`);
    expect(JSON.stringify(queue.body)).not.toContain("k-live-98765");
  });

  test("a detail written as a text from a secret field is masked in the mail, the link's page and the queue", async () => {
    sent.length = 0;
    const body = flow();
    body.nodes.ask.detail = "'Pay with ' + trigger.apiKey + ' now'";
    await alice.put(`${ws()}/drafts/refunds/text`, { kind: "flow", schemaVersion: 1, body });
    expect((await alice.post(`${ws()}/changes/deploy`, {})).status).toBeLessThan(300);
    const started = await alice.post(`${ws()}/flow-runs`, {
      flow: "refunds/text",
      input: { amount: 120, apiKey: "k-live-98765" },
    });
    await flowRun(started.body.id, (run) => run.state === "waiting_approval");
    await waitForMail(2);
    const mail = mailTo("bob@acme.example")[0] as Message;
    expect(mail.text).not.toContain("k-live-98765");
    expect(mail.text).toContain("Pay with [redacted] now");
    const page = await t.anonymous.get(`/approval-links/${linkOf(mail)}`);
    expect(page.body.detail).toBe("Pay with [redacted] now");
    const queue = await alice.get(`/tenants/${tenant}/approvals`);
    expect(JSON.stringify(queue.body)).not.toContain("k-live-98765");
    expect(JSON.stringify(queue.body)).toContain("Pay with [redacted] now");
  });

  test("goes to the named approvers alone when the step names them", async () => {
    await asking({ groups: ["Finance"] }, 1);
    expect(sent.map((message) => message.to)).toEqual(["bob@acme.example"]);
    await asking({ roles: ["refund_approver"] }, 1);
    // Bob holds the role; Dave holds it too, and is suspended.
    expect(sent.map((message) => message.to)).toEqual(["bob@acme.example"]);
  });

  test("is not sent, and no link made, when the instance sends no mail", async () => {
    const deliver = t.kernel.mail.deliver;
    t.kernel.mail.deliver = undefined;
    const before = Number(
      (
        await t.db
          .selectFrom("approval_link")
          .select((eb) => eb.fn.countAll().as("n"))
          .executeTakeFirst()
      )?.n,
    );
    await asking(undefined, 0);
    const after = Number(
      (
        await t.db
          .selectFrom("approval_link")
          .select((eb) => eb.fn.countAll().as("n"))
          .executeTakeFirst()
      )?.n,
    );
    expect(after).toBe(before);
    t.kernel.mail.deliver = deliver;
  });
});

describe("deciding from the link", () => {
  test("reading changes nothing; approving records the member and the comment, and the flow goes on", async () => {
    const run = await asking(undefined, 2);
    const bob = linkOf(mailTo("bob@acme.example")[0] as Message);
    const alices = linkOf(mailTo("alice@acme.example")[0] as Message);
    const read = await t.anonymous.get(`/approval-links/${bob}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body).toMatchObject({
      title: "Refund the Brooks family",
      detail: { amount: 120 },
      flow: "refunds/approve",
      workspace: { name: "Dev", type: "dev" },
      tenant: { name: "Acme" },
      approver: { name: "Bob" },
      test: false,
    });
    // Read again: a scanner opening it decides nothing.
    expect((await t.anonymous.get(`/approval-links/${bob}`)).status).toBe(200);

    const decided = await t.anonymous.post(`/approval-links/${bob}`, {
      decision: "approve",
      comment: "Receipt checked",
    });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    expect(decided.body).toMatchObject({ decision: "approve", approver: { name: "Bob" } });
    const done = await flowRun(run, (body) => body.status === "succeeded");
    const step = done.steps.find((one: { node: string }) => one.node === "ask");
    expect(step.output).toEqual({ approved: true, comment: "Receipt checked" });
    const audit = await t.db
      .selectFrom("audit_entry")
      .select(["action", "actor_type", "actor_id", "details"])
      .where("action", "=", "approval.approved")
      .execute();
    expect(audit).toEqual([
      expect.objectContaining({
        actor_type: "member",
        actor_id: ids.bob,
        details: expect.objectContaining({ comment: "Receipt checked", via: "email" }),
      }),
    ]);
    const listed = (await alice.get(`/tenants/${tenant}/approvals/decided`)).body.items[0];
    expect(listed).toMatchObject({
      comment: "Receipt checked",
      via: "email",
      decidedBy: { id: ids.bob },
    });
    // Once: the link is spent, and Alice's went stale when Bob decided.
    expect((await t.anonymous.post(`/approval-links/${bob}`, { decision: "approve" })).status).toBe(
      410,
    );
    expect((await t.anonymous.get(`/approval-links/${alices}`)).status).toBe(410);
  });

  test("rejecting needs a comment; a decision in the console makes every link stale", async () => {
    const run = await asking(undefined, 2);
    const bob = linkOf(mailTo("bob@acme.example")[0] as Message);
    expect((await t.anonymous.post(`/approval-links/${bob}`, { decision: "reject" })).status).toBe(
      400,
    );
    expect(
      (
        await alice.post(`${ws()}/flow-runs/${run}/approvals/ask`, {
          decision: "reject",
          comment: "No receipt",
        })
      ).status,
    ).toBe(204);
    expect((await t.anonymous.get(`/approval-links/${bob}`)).status).toBe(410);
    const rejected = await flowRun(run, (body) => body.status === "failed");
    expect(rejected.error.message).toContain("No receipt");
    expect((await alice.get(`/tenants/${tenant}/approvals/decided`)).body.items[0]).toMatchObject({
      via: "console",
    });
  });

  test("a member who may no longer decide is refused, and their link still works if they may again", async () => {
    await asking(undefined, 2);
    const bob = linkOf(mailTo("bob@acme.example")[0] as Message);
    await alice.patch(`/tenants/${tenant}/members/${ids.bob}`, { suspended: true });
    const refused = await t.anonymous.post(`/approval-links/${bob}`, { decision: "approve" });
    expect(refused.status).toBe(403);
    expect(refused.body.detail).toMatch(/no longer decide/);
    await alice.patch(`/tenants/${tenant}/members/${ids.bob}`, { suspended: false });
    expect((await t.anonymous.post(`/approval-links/${bob}`, { decision: "approve" })).status).toBe(
      200,
    );
  });

  test("a link runs out, never later than the step's own timeout", async () => {
    sent.length = 0;
    await alice.put(`${ws()}/drafts/refunds/quick`, {
      kind: "flow",
      schemaVersion: 1,
      body: {
        ...flow(),
        nodes: { ...flow().nodes, ask: { ...flow().nodes.ask, timeoutSeconds: 600 } },
      },
    });
    await alice.post(`${ws()}/changes/deploy`, {});
    const started = await alice.post(`${ws()}/flow-runs`, {
      flow: "refunds/quick",
      input: { amount: 5 },
    });
    await flowRun(started.body.id, (run) => run.state === "waiting_approval");
    await waitForMail(2);
    const link = linkOf(mailTo("bob@acme.example")[0] as Message);
    const shown = (await t.anonymous.get(`/approval-links/${link}`)).body;
    expect(Date.parse(shown.expiresAt)).toBeLessThanOrEqual(Date.now() + 601_000);
    await t.db
      .updateTable("approval_link")
      .set({ expires_at: new Date(Date.now() - 1000) })
      .execute();
    expect((await t.anonymous.get(`/approval-links/${link}`)).status).toBe(410);
    expect(
      (await t.anonymous.post(`/approval-links/${link}`, { decision: "approve" })).status,
    ).toBe(410);
    expect((await t.anonymous.get("/approval-links/not-a-real-token-at-all-really")).status).toBe(
      410,
    );
  });

  test("a test run's mail says it is a test", async () => {
    // A test run runs the drafts.
    await alice.put(`${ws()}/drafts/refunds/approve`, {
      kind: "flow",
      schemaVersion: 1,
      body: flow(),
    });
    sent.length = 0;
    const started = await alice.post(`${ws()}/test-runs`, {
      flow: "refunds/approve",
      input: { amount: 1 },
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    await waitForMail(2);
    expect(sent[0]?.subject).toBe("[Test] Approval needed: Refund the Brooks family");
    expect(sent[0]?.text).toContain("A test run of the flow");
    const link = linkOf(sent[0] as Message);
    expect((await t.anonymous.get(`/approval-links/${link}`)).body.test).toBe(true);
  });
});

describe("the write path", () => {
  test("every change left an audit entry, and deciding by link was exercised", () => {
    expect(t.unexercised((route) => route.includes("/approval-links"))).toEqual([]);
    expect(t.unaudited).toEqual([]);
  });
});
