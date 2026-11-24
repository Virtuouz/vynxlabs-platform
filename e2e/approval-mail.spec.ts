import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { signInAs } from "./as.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * Approving from a mail, in a browser (phase 10, milestone 7): a flow waits for
 * an approval, its approvers are mailed links of their own, one approves on a
 * phone-sized screen with no sign-in, the other's link then says so, and the
 * console names who decided, with the comment.
 *
 * The instance must keep its mail as files (MAIL_CAPTURE_DIR), and the test
 * reads them from E2E_MAIL_DIR, the same folder as the test sees it.
 */

const MAIL_DIR = process.env.E2E_MAIL_DIR;
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
const call = (page: Page, method: string, path: string, body?: unknown): Promise<any> =>
  page.evaluate(
    async ([method, path, body]) => {
      // A draft save names the draft it saw: its revision now, or none when there is none.
      if (
        method === "PUT" &&
        String(path).includes("/drafts/") &&
        body &&
        typeof body === "object" &&
        !("revision" in body) &&
        !("create" in body)
      ) {
        const seen = await fetch(`/api/v1${path}`);
        if (seen.ok) body = { ...body, revision: (await seen.json()).revision };
      }
      const response = await fetch(`/api/v1${path}`, {
        method: method as string,
        headers: body ? { "content-type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      if (response.status >= 300) throw new Error(`${method} ${path}: ${response.status} ${text}`);
      return text ? JSON.parse(text) : null;
    },
    [method, path, body] as const,
  );

/** The approval link mailed to `to`, once it has been written. */
async function linkFor(to: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    for (const name of (await readdir(MAIL_DIR as string).catch(() => [])).sort().reverse()) {
      const text = await readFile(join(MAIL_DIR as string, name), "utf8").catch(() => "");
      if (text.startsWith(`To: ${to}\n`)) {
        const link = /(https?:\/\/\S+\/approve\/[A-Za-z0-9_-]+)/.exec(text)?.[1];
        if (link) return new URL(link).pathname;
      }
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`No approval mail to ${to} in ${MAIL_DIR}.`);
}

test.skip(!MAIL_DIR, "Set E2E_MAIL_DIR to where the instance keeps its mail (MAIL_CAPTURE_DIR).");

test("an approver approves from the mail on a phone, and the console says who and why @access", async ({
  browser,
}) => {
  const errors: string[] = [];
  const admin = await (await browser.newContext()).newPage();
  admin.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  await signInAs(admin, "operator");

  const tenant = await call(admin, "POST", "/tenants", { slug: `mail-${stamp}`, name: "Fernhill" });
  await call(admin, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The approval mail e2e test",
    roleId: TENANT_ADMIN,
  });
  const role = await call(admin, "POST", `/tenants/${tenant.id}/roles`, {
    name: "refund_approver",
    permissions: ["approval:*", "flow_run:read"],
  });
  const approvers = [];
  for (const name of ["bob", "carol"]) {
    const member = await call(admin, "POST", `/tenants/${tenant.id}/members`, {
      email: `${name}-${stamp}@fernhill.example`,
      name: name === "bob" ? "Bob Reyes" : "Carol Lin",
      password: `${name}-a-long-password`,
    });
    await call(admin, "POST", `/tenants/${tenant.id}/bindings`, {
      principalType: "member",
      principalId: member.id,
      roleId: role.id,
    });
    approvers.push(member);
  }
  const dev = await call(admin, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Clinics",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await call(admin, "PUT", `${W}/drafts/refunds/approve`, {
    kind: "flow",
    schemaVersion: 1,
    body: {
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        ask: {
          type: "approval",
          title: "Refund the Brooks family",
          detail: "{'amount': trigger.amount, 'reason': trigger.reason}",
        },
        done: { type: "set", values: { refunded: "trigger.amount" } },
      },
      edges: [
        { from: "start", to: "ask" },
        { from: "ask", to: "done" },
      ],
    },
  });
  await call(admin, "POST", `${W}/changes/deploy`, {});
  const run = await call(admin, "POST", `${W}/flow-runs`, {
    flow: "refunds/approve",
    input: { amount: 120, reason: "Charged twice" },
  });

  // Bob opens his link on a phone, with no session, and approves.
  const bobLink = await linkFor(approvers[0].email);
  const carolLink = await linkFor(approvers[1].email);
  const phone = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  phone.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  await phone.goto(bobLink);
  await expect(phone.getByRole("heading", { name: "Refund the Brooks family" })).toBeVisible();
  await expect(phone.getByText(/Asked of Bob Reyes/)).toBeVisible();
  await expectNoAxeViolations(phone, "the approval page on a phone");
  expect(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await phone.getByLabel("Comment (needed to reject)").fill("Receipt checked");
  await phone.getByRole("button", { name: "Approve" }).click();
  await expect(
    phone.getByRole("heading", { name: "Approved. Thank you, Bob Reyes." }),
  ).toBeVisible();

  // Carol's link is spent: someone decided.
  await phone.goto(carolLink);
  await expect(phone.getByRole("heading", { name: "Nothing to decide here" })).toBeVisible();

  // The flow carried on, and the console names Bob, with his comment, by email.
  await expect
    .poll(async () => (await call(admin, "GET", `${W}/flow-runs/${run.id}`)).status, {
      timeout: 15_000,
    })
    .toBe("succeeded");
  // An approval is its workspace's (phase 18): the tenant's page lists only a step that asks for it.
  await admin.goto(`/t/${tenant.id}/workspaces/${dev.id}/approvals`);
  await admin.getByRole("radio", { name: /Decided/ }).click();
  await expect(admin.getByText(/Receipt checked/)).toBeVisible();
  await expect(admin.getByText(/decided from the mail/)).toBeVisible();
  const audit = await call(admin, "GET", `/tenants/${tenant.id}/audit?limit=50`);
  expect(
    audit.items.find((entry: { action: string }) => entry.action === "approval.approved"),
  ).toMatchObject({ details: { comment: "Receipt checked", via: "email" } });
  expect(errors).toEqual([]);
});
