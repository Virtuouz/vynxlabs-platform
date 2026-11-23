import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, startTestApp, type TestApp } from "@volvel/control-plane/testing";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { run } from "./cli.js";

/**
 * A tenant's access brought up from a repository: the files are released by the
 * CLI against a real instance, changed, pulled back and gone back on.
 */

const PASSWORD = "a-good-long-password";

let t: TestApp;
let alice: Client;
let home: string;
let repo: string;
let serverUrl: string;

async function cli(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: { XDG_CONFIG_HOME: home },
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}
const tenant = (...args: string[]) =>
  cli(["tenant", ...args, "--tenant", "lakeshore", "--dir", repo]);
const write = async (path: string, content: string) => {
  await mkdir(join(repo, path, ".."), { recursive: true });
  await writeFile(join(repo, path), content);
};

beforeAll(async () => {
  t = await startTestApp({ version: "0.5.0" });
  const url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  serverUrl = url;
  home = await mkdtemp(join(tmpdir(), "cli-access-"));
  repo = await mkdtemp(join(tmpdir(), "tenant-repo-"));
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const id = (await t.admin.post("/tenants", { slug: "lakeshore", name: "Lakeshore" })).body.id;
  const grant = await t.admin.post(`/tenants/${id}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${id}/members`, {
    email: "alice@lakeshore.example",
    name: "Alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${id}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@lakeshore.example", PASSWORD);
  await alice.post(`/tenants/${id}/workspaces`, { slug: "main", name: "Main", type: "dev" });
  const token = (await alice.post("/api-keys", { name: "cli" })).body.token;
  expect((await cli(["login", "--url", url, "--token", token])).code).toBe(0);

  await write(
    "tenant/groups/tech-desk.group.yaml",
    "title: Tech Desk\nschemaVersion: 1\nbody:\n  description: Lends and repairs devices.\n",
  );
  // Kept beside the feature it belongs to, not under tenant/: where a file is kept is the repository's business.
  await write(
    "src/helpdesk/helpdesk-assistant.service_account.yaml",
    "title: Helpdesk assistant\nschemaVersion: 1\n",
  );
  await write(
    "tenant/bindings/desk-develops.tenant_binding.yaml",
    "schemaVersion: 1\nbody:\n  role: developer\n  principal:\n    type: group\n    key: tech-desk\n  workspace: main\n",
  );
  // Files that are nobody's access are left alone, wherever they are.
  await write("platform/orders.table.yaml", "schemaVersion: 1\nbody:\n  columns: {}\n");
  await write("node_modules/dep/x.group.yaml", "not: [valid");
}, 60_000);

afterAll(async () => {
  await t.stop();
  await rm(home, { recursive: true });
  await rm(repo, { recursive: true });
});

describe("a tenant's access, from its repository", () => {
  test("the plan says what a release would make, and makes nothing", async () => {
    const planned = await tenant("plan");
    expect(planned.err).toBe("");
    expect(planned.out).toContain(
      "Releasing would leave lakeshore with: 3 created, 0 updated, 0 deleted, 0 unchanged.",
    );
    expect(planned.out).toContain("created  group            tech-desk  (Tech Desk)");
    expect(planned.out).toContain(
      "created  service_account  helpdesk-assistant  (Helpdesk assistant)",
    );
    expect(planned.out).toContain("developer to group tech-desk in main");
    expect(planned.out).toContain('Nothing was changed. Run "volvel tenant release" to do it.');
    expect((await tenant("releases")).out).toBe("");
  });

  test("a release brings the tenant up, and releasing again changes nothing", async () => {
    const released = await tenant("release", "--message", "Bring up the tenant");
    expect(released.err).toBe("");
    expect(released.out).toContain(
      "Released lakeshore's access as release 1: 3 created, 0 updated, 0 deleted, 0 unchanged.",
    );
    expect((await tenant("release")).out).toContain("0 created, 0 updated, 0 deleted, 3 unchanged");
    const listed = (await tenant("releases")).out.split("\n");
    expect(listed).toHaveLength(2);
    expect(listed[1]).toMatch(/^ {3}1 {2}applied .* Alice .* Bring up the tenant$/);
  });

  test("a new title is a change to the same group, and a file gone from the repository is not removed unasked", async () => {
    await write(
      "tenant/groups/tech-desk.group.yaml",
      "title: IT Service Desk\nschemaVersion: 1\nbody:\n  description: Lends and repairs devices.\n",
    );
    await rm(join(repo, "src/helpdesk/helpdesk-assistant.service_account.yaml"));
    const refused = await tenant("release");
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("would remove what the tenant has and the repository does not");
    expect(refused.err).toContain("--allow-delete service_account/helpdesk-assistant");
    const released = await tenant(
      "release",
      "--allow-delete",
      "service_account/helpdesk-assistant",
    );
    expect(released.err).toBe("");
    expect(released.out).toContain("0 created, 1 updated, 1 deleted, 1 unchanged");
    expect(released.out).toContain("updated  group            tech-desk  (IT Service Desk)");
  });

  test("what was made in the console is pulled into the repository, beside what is there", async () => {
    const tenantId = (await alice.get("/tenants?limit=200")).body.items[0].id;
    const made = await alice.post(`/tenants/${tenantId}/groups`, { name: "Night shift" });
    expect(made.status).toBe(201);
    const pulled = await tenant("pull");
    expect(pulled.err).toBe("");
    expect(pulled.out).toContain("new     tenant/groups/night-shift.group.yaml");
    expect(pulled.out).toContain("Wrote 1 of 3 files of lakeshore's access.");
    expect(await readFile(join(repo, "tenant/groups/night-shift.group.yaml"), "utf8")).toBe(
      "title: Night shift\nschemaVersion: 1\nbody: {}\n",
    );
    // What the repository had is as the tenant has it, so it is left as it is.
    expect((await tenant("pull")).out).toContain(
      "The repository already has lakeshore's access as it is: 3 files.",
    );
    expect((await tenant("plan")).out).toContain("0 created, 0 updated, 0 deleted, 3 unchanged");

    // A developer writes in the file. A later change in the console is written into it as
    // they wrote it, and a pull that changes nothing leaves it alone.
    const file = "tenant/groups/night-shift.group.yaml";
    await write(
      file,
      "# Covers the desk after 22:00.\ntitle: Night shift # for now\nschemaVersion: 1\nbody: {}\n",
    );
    expect((await tenant("pull")).out).toContain("already has lakeshore's access as it is");
    expect(
      (await alice.patch(`/tenants/${tenantId}/groups/${made.body.id}`, { name: "Late shift" }))
        .status,
    ).toBe(200);
    expect((await tenant("pull")).err).toBe("");
    expect(await readFile(join(repo, file), "utf8")).toBe(
      "# Covers the desk after 22:00.\ntitle: Late shift # for now\nschemaVersion: 1\nbody: {}\n",
    );
  });

  test("an earlier release is gone back to", async () => {
    // It says what it removes, and without a terminal to ask at, does nothing until told to.
    const asked = await tenant("rollback", "1");
    expect(asked.code).toBe(1);
    expect(asked.out).toContain("Going back to release 1 removes what was made since:");
    expect(asked.out).toContain("deleted  group            night-shift");
    expect(asked.err).toContain("Nothing was changed. Run it again with --yes");
    const back = await tenant("rollback", "1", "--yes");
    expect(back.err).toBe("");
    expect(back.out).toContain("lakeshore's access is what release 1 left, as release");
    expect(back.out).toContain("updated  group            tech-desk  (Tech Desk)");
    expect(back.out).toContain("created  service_account  helpdesk-assistant");
    expect(back.out).toContain("deleted  group            night-shift");
    expect((await tenant("rollback", "99", "--yes")).err).toContain("has no release 99");
    expect((await cli(["tenant", "plan", "--dir", repo])).err).toContain("--tenant <slug>");
  });

  test("approval is turned on and off, and approve shows the changes it answers", async () => {
    const tenantId = (await alice.get("/tenants?limit=200")).body.items[0].id;
    const roles = Object.fromEntries(
      (
        await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
      ).map((role) => [role.name, role.id]),
    );
    expect((await tenant("approval")).out).toContain("does not ask for a second person");
    // Two people must be able to release before it can be turned on.
    const alone = await tenant("approval", "on");
    expect(alone.code).toBe(1);
    expect(alone.err).toContain("Approval needs two people");
    const grant = await t.admin.post(`/tenants/${tenantId}/access-grants`, {
      reason: "Second",
      roleId: roles.tenant_admin,
    });
    const bob = await t.admin.post(`/tenants/${tenantId}/members`, {
      email: "bob@lakeshore.example",
      name: "Bob",
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${tenantId}/bindings`, {
      principalType: "member",
      principalId: bob.body.id,
      roleId: roles.tenant_admin,
    });
    await t.admin.delete(`/tenants/${tenantId}/access-grants/${grant.body.id}`);
    const on = await tenant("approval", "on");
    expect(on.err).toBe("");
    expect(on.out).toContain("now asks for a second person");
    expect((await tenant("approval")).out).toContain("asks for a second person");
    await write("tenant/groups/weekend.group.yaml", "title: Weekend\nschemaVersion: 1\nbody: {}\n");
    const waits = await tenant("release", "--allow-delete", "service_account/helpdesk-assistant");
    expect(waits.err, waits.out).toBe("");
    expect(waits.out).toContain("waits for a second person");
    const number = /Release (\d+) of/.exec(waits.out)?.[1] as string;
    const bobKey = await t.signIn("bob@lakeshore.example", PASSWORD);
    const token = (await bobKey.post("/api-keys", { name: "cli-bob" })).body.token;
    expect((await cli(["login", "--url", serverUrl, "--token", token])).code).toBe(0);
    const approved = await tenant("approve", number);
    expect(approved.err).toBe("");
    expect(approved.out).toContain(`Release ${number} of lakeshore's access:`);
    expect(approved.out).toContain("created  group            weekend  (Weekend)");
    expect(approved.out).toContain(`Release ${number} of lakeshore's access is applied.`);
    expect((await tenant("approval", "off")).out).toContain("no longer asks");
  });
});
