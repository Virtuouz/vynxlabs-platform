// Builds Fernhill Veterinary Group on a running instance, as its people would:
// the tenant and its members, two workspaces, the outside systems, the code
// deployed and promoted, a few weeks of data, and a morning's activity.
//
//   node setup/setup.mjs [--reset]
//
// PLATFORM_URL (default http://localhost:8080), and the instance's first
// operator in PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD. The stand-ins
// must be running: node stand-ins/server.mjs. --reset deletes an existing
// fernhill tenant first. What to sign in with is written to .platform/demo.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(HERE, "../../packages/cli/dist/bin.js");
const URL_ = (process.env.PLATFORM_URL ?? "http://localhost:8080").replace(/\/$/, "");
const ADMIN = {
  email: process.env.PLATFORM_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.PLATFORM_ADMIN_PASSWORD ?? "change-me-please",
};
const STAND_INS = process.env.STAND_INS ?? "http://127.0.0.1:4020";
const PASSWORD = "fernhill-demo-2026";
const SLUG = "fernhill";
const PAYFERN_SECRET = "whsec_fernhill_demo";

const step = (text) => console.log(`\n▸ ${text}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A signed-in client: a browser's session, as the console has. */
async function session(email, password, path = "/auth/sign-in/email") {
  const response = await fetch(`${URL_}/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: URL_ },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok)
    throw new Error(`Signing in as ${email}: ${response.status} ${await response.text()}`);
  return client(
    response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  );
}
function client(cookie) {
  const call = async (method, path, body, { allow = [] } = {}) => {
    const response = await fetch(`${URL_}/api/v1${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        origin: URL_,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const parsed = text
      ? (() => {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        })()
      : null;
    if (!response.ok && !allow.includes(response.status)) {
      throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 800)}`);
    }
    return parsed;
  };
  /** Sends a file as the request body, as an upload does. */
  const upload = async (path, content, type) => {
    const response = await fetch(`${URL_}/api/v1${path}`, {
      method: "PUT",
      headers: { ...(cookie ? { cookie } : {}), origin: URL_, "content-type": type },
      body: content,
    });
    if (!response.ok) throw new Error(`PUT ${path}: ${response.status} ${await response.text()}`);
  };
  return {
    upload,
    get: (path, options) => call("GET", path, undefined, options),
    post: (path, body = {}, options) => call("POST", path, body, options),
    put: (path, body = {}, options) => call("PUT", path, body, options),
    patch: (path, body = {}, options) => call("PATCH", path, body, options),
    delete: (path, options) => call("DELETE", path, undefined, options),
  };
}

const ready = await fetch(`${STAND_INS}/`).catch(() => null);
if (!ready?.ok) {
  console.error(
    `The stand-ins are not running at ${STAND_INS}. Start them: node stand-ins/server.mjs`,
  );
  process.exit(1);
}

step(`Signing in to ${URL_} as the operator`);
const admin = await session(ADMIN.email, ADMIN.password);

const existing = (await admin.get("/tenants?limit=200")).items.find((one) => one.slug === SLUG);
if (existing) {
  if (!process.argv.includes("--reset")) {
    console.error(`A tenant "${SLUG}" exists. Run again with --reset to delete it and start over.`);
    process.exit(1);
  }
  step("Deleting the existing fernhill tenant");
  const old = `/tenants/${existing.id}`;
  // A tenant with runs still going is not deleted: cancel them first, under an access grant.
  const opened = await admin.post(`${old}/access-grants`, {
    reason: "Resetting the Fernhill demo",
    roleId: "00000000-0000-7000-8000-000000000002",
    durationMinutes: 15,
  });
  for (const ws of (await admin.get(`${old}/workspaces`)).items) {
    const W = `${old}/workspaces/${ws.id}`;
    for (const status of ["queued", "running", "waiting"]) {
      for (const one of (
        await admin.get(`${W}/flow-runs?status=${status}&limit=200`, { allow: [400] })
      )?.items ?? []) {
        await admin.post(`${W}/flow-runs/${one.id}/cancel`, {}, { allow: [404, 409] });
      }
      for (const one of (await admin.get(`${W}/runs?status=${status}&limit=200`, { allow: [400] }))
        ?.items ?? []) {
        await admin.post(`${W}/runs/${one.id}/cancel`, {}, { allow: [404, 409] });
      }
    }
  }
  await admin.delete(`${old}/access-grants/${opened.id}`);
  for (let tries = 0; ; tries += 1) {
    const done = await admin.post(`${old}/deletion`, { confirm: SLUG }, { allow: [409] });
    if (!done?.status || done.status !== 409) break;
    if (tries > 20) throw new Error(`The old tenant could not be deleted: ${done.detail}`);
    await sleep(500);
  }
}

// ----- The tenant and its people -----

step("Creating the tenant, and opening operator access to set it up");
const tenant = await admin.post("/tenants", { slug: SLUG, name: "Fernhill Veterinary Group" });
const T = `/tenants/${tenant.id}`;
// Before a grant the operator sees nothing inside the tenant. The built-in admin role has a fixed ID.
let builtin = { tenant_admin: "00000000-0000-7000-8000-000000000002" };
const grant = await admin.post(`${T}/access-grants`, {
  reason: "Setting up the Fernhill demo tenant",
  roleId: builtin.tenant_admin,
  durationMinutes: 240,
});
builtin = Object.fromEntries((await admin.get(`${T}/roles`)).items.map((r) => [r.name, r.id]));

const PEOPLE = [
  {
    email: "maya.brooks@fernhill.example",
    name: "Maya Brooks",
    role: "tenant_admin",
    about: "Practice owner",
  },
  {
    email: "rowan.ellis@fernhill.example",
    name: "Rowan Ellis",
    role: "workspace_admin",
    about: "Group practice manager",
  },
  {
    email: "devi.shah@fernhill.example",
    name: "Devi Shah",
    role: "developer",
    about: "Contract developer",
  },
  {
    email: "amara.okafor@fernhill.example",
    name: "Dr. Amara Okafor",
    role: "viewer",
    about: "Clinical director",
  },
];
const members = {};
for (const person of PEOPLE) {
  const created = await admin.post(`${T}/members`, {
    email: person.email,
    name: person.name,
    password: PASSWORD,
  });
  members[person.email] = created.id;
  await admin.post(`${T}/bindings`, {
    principalType: "member",
    principalId: created.id,
    roleId: builtin[person.role],
  });
}
const managers = await admin.post(`${T}/groups`, {
  name: "Practice managers",
  description: "Decide stock orders over the threshold.",
});
for (const email of ["maya.brooks@fernhill.example", "rowan.ellis@fernhill.example"]) {
  await admin.put(`${T}/groups/${managers.id}/members/${members[email]}`);
}
// Devi deploys to the sandbox and promotes: the developer role writes deployments but not promotions.
await admin.post(`${T}/bindings`, {
  principalType: "member",
  principalId: members["devi.shah@fernhill.example"],
  roleId: builtin.deployer,
});

step("Creating the workspaces: clinics (production) and sandbox (dev)");
const prod = await admin.post(`${T}/workspaces`, {
  slug: "clinics",
  name: "Clinics",
  type: "production",
});
const dev = await admin.post(`${T}/workspaces`, {
  slug: "sandbox",
  name: "Sandbox",
  type: "dev",
  linkedWorkspaceId: prod.id,
});

step("Creating the phone assistant's service account and its key");
const assistant = await admin.post(`${T}/service-accounts`, {
  name: "phone-assistant",
  description: "The AI agent that answers the clinics' phones. Connects over MCP to Clinics.",
});
const assistantKey = await admin.post(`${T}/service-accounts/${assistant.id}/api-keys`, {
  name: "Phone line agent",
});

step("Creating end-user groups and front-desk accounts");
const euGroups = {};
for (const [name, description] of [
  ["Front desk", "Everyone on a front desk. Opens the Front desk app."],
  ["northside", "Northside clinic staff. Sees Northside's rows."],
  ["riverside", "Riverside clinic staff. Sees Riverside's rows."],
  ["hilltop", "Hilltop clinic staff. Sees Hilltop's rows."],
]) {
  euGroups[name] = (await admin.post(`${T}/end-user-groups`, { name, description })).id;
}
const anonymous = client("");
/** An end user with a password, through the invitation link as the person would. */
async function endUser(email, name, groups, attributes) {
  const made = await admin.post(`${T}/end-users`, { email, name });
  const token = new URL(made.invitation.url).searchParams.get("token");
  await anonymous.post(`${T}/end-user-auth/passwords`, { token, password: PASSWORD });
  for (const group of groups)
    await admin.put(`${T}/end-user-groups/${euGroups[group]}/members/${made.endUser.id}`);
  if (attributes) await admin.patch(`${T}/end-users/${made.endUser.id}`, { attributes });
  return made.endUser.id;
}
const desk = [
  ["jess.morgan@fernhill.example", "Jess Morgan", "northside"],
  ["omar.haddad@fernhill.example", "Omar Haddad", "riverside"],
  ["lena.fischer@fernhill.example", "Lena Fischer", "hilltop"],
];
for (const [email, name, clinic] of desk) await endUser(email, name, ["Front desk", clinic]);

// ----- The outside systems, per workspace -----

step("Connecting TextLine and VetSupply, and storing PayFern's signing secret");
for (const ws of [prod, dev]) {
  const W = `${T}/workspaces/${ws.id}`;
  await admin.put(`${W}/connection-bindings/sms`, {
    config: { baseUrl: `${STAND_INS}/textline`, auth: { type: "bearer" } },
    credential: "tl_demo_7f3a9c",
  });
  await admin.put(`${W}/connection-bindings/supplier`, {
    config: { baseUrl: `${STAND_INS}/vetsupply`, auth: { type: "bearer" } },
    credential: "vs_demo_51be22",
  });
  await admin.put(`${W}/secrets/PAYFERN_SIGNING_SECRET`, { value: PAYFERN_SECRET });
}

// ----- The code, as Devi ships it -----

step("Devi deploys the repository to the sandbox, and Maya promotes it to Clinics");
const devi = await session("devi.shah@fernhill.example", PASSWORD);
const deviKey = await devi.post("/api-keys", { name: "Devi's laptop" });
const maya = await session("maya.brooks@fernhill.example", PASSWORD);
const mayaKey = await maya.post("/api-keys", { name: "Maya's CLI" });
const cli = (args, token) =>
  execFileSync("node", [CLI, ...args], {
    cwd: HERE,
    env: { ...process.env, PLATFORM_URL: URL_, PLATFORM_TOKEN: token },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
console.log(
  cli(["deploy", "--tenant", SLUG, "--workspace", "sandbox"], deviKey.token)
    .trim()
    .split("\n")
    .slice(-3)
    .join("\n"),
);
console.log(
  cli(["promote", "--tenant", SLUG, "--workspace", "sandbox"], mayaKey.token)
    .trim()
    .split("\n")
    .slice(-3)
    .join("\n"),
);

// ----- Data -----

const P = `${T}/workspaces/${prod.id}`;
const D = `${T}/workspaces/${dev.id}`;
async function run(base, script, input = {}, who = admin) {
  const started = await who.post(`${base}/runs`, { script, input });
  for (;;) {
    const found = await who.get(`${base}/runs/${started.id}`);
    if (!["queued", "running"].includes(found.status)) return found;
    await sleep(400);
  }
}
async function flowRun(base, flow, input = {}, who = admin) {
  const started = await who.post(`${base}/flow-runs`, { flow, input });
  const id = started.id ?? started.flowRun?.id;
  for (let i = 0; i < 60; i += 1) {
    const found = await who.get(`${base}/flow-runs/${id}`);
    if (!["queued", "running", "pending"].includes(found.status)) return found;
    await sleep(500);
  }
  return who.get(`${base}/flow-runs/${id}`);
}

step("Seeding six weeks of history in Clinics, and a little in the sandbox");
const seeded = await run(P, "setup/seed-demo", { clientsPerClinic: 24, pastDays: 42 });
if (seeded.status !== "succeeded")
  throw new Error(`Seeding failed: ${JSON.stringify(seeded.error)}`);
console.log("  ", JSON.stringify(seeded.output.counts));
await run(D, "setup/seed-demo", { clientsPerClinic: 6, pastDays: 7 });

step("Giving three clients a portal account");
const rows = async (base, table, filter) =>
  (
    await admin.get(
      `${base}/rows/${table}?filter=${encodeURIComponent(JSON.stringify(filter))}&limit=5`,
    )
  ).items;
const owners = [];
for (const code of ["C-1001", "C-1030", "C-1055"]) {
  const [owner] = await rows(P, "clients", { column: "code", value: code });
  const email = owner.email;
  await endUser(email, owner.name, [], { client_id: code });
  owners.push({ code, name: owner.name, email, clinic: owner.home_clinic });
}

// ----- A morning's activity -----

step("The morning: stock check, reminders, finished visits, payments");
const stock = await run(P, "inventory/check");
console.log(`   stock check: ${stock.output?.low} low lines, each starts a reorder flow`);
// Reminders go out three days ahead here, so even on a Saturday Monday's visits are due now.
await admin.put(`${P}/variable-values/reminders/lead-hours`, { value: "72" });
// TextLine is down when the first hourly run starts: it fails, and the failure is recorded.
await fetch(`${STAND_INS}/control/outage`, { method: "POST", body: JSON.stringify({ on: true }) });
const failedReminders = await run(P, "reminders/send");
console.log(`   reminders during TextLine's outage: ${failedReminders.status}`);
await fetch(`${STAND_INS}/control/outage`, { method: "POST", body: JSON.stringify({ on: false }) });
const reminders = await run(P, "reminders/send");
console.log(`   reminders: ${JSON.stringify(reminders.output ?? reminders.error)}`);

// Today's first visits move through the front desk, whatever the time of day.
const today = new Date().toISOString().slice(0, 10);
const todays = (
  await admin.get(
    `${P}/rows/appointments?filter=${encodeURIComponent(
      JSON.stringify({
        and: [
          { column: "starts_at", op: "gte", value: `${today}T00:00:00Z` },
          { column: "starts_at", op: "lte", value: `${today}T23:59:59Z` },
          { column: "status", value: "booked" },
        ],
      }),
    )}&sort=starts_at&limit=12`,
  )
).items;
const move = (visit, status) =>
  run(P, "appointments/set-status", { appointment: visit.id, status });
for (const visit of todays.slice(0, 9)) await move(visit, "checked_in");
for (const visit of todays.slice(0, 6)) await move(visit, "in_exam");
for (const visit of todays.slice(0, 4)) await move(visit, "done");
if (todays[9]) await move(todays[9], "no_show");
console.log("   today: 9 checked in, 6 seen by a vet, 4 finished and invoiced, 1 no-show");

// PayFern: two good payments, one for the wrong amount, one with a bad signature.
const triggers = await admin.get(`${P}/triggers`);
const payfern = (triggers.items ?? triggers).find?.((one) =>
  (one.path ?? one.label ?? "").includes("payments/payfern"),
);
const hook = payfern?.url ?? payfern?.address;
const unpaid = await rows(P, "invoices", { column: "status", value: "unpaid" });
if (hook && unpaid.length >= 3) {
  const pay = (invoice, amount, bad) =>
    execFileSync(
      "node",
      [
        join(HERE, "stand-ins/payfern.mjs"),
        hook,
        invoice,
        String(amount),
        ...(bad ? ["--bad-signature"] : []),
      ],
      {
        env: { ...process.env, PAYFERN_SIGNING_SECRET: PAYFERN_SECRET },
        encoding: "utf8",
      },
    ).trim();
  console.log(`   PayFern ${unpaid[0].number}: ${pay(unpaid[0].number, unpaid[0].total)}`);
  console.log(`   PayFern ${unpaid[1].number}: ${pay(unpaid[1].number, unpaid[1].total)}`);
  console.log(
    `   PayFern ${unpaid[2].number}, wrong amount: ${pay(unpaid[2].number, unpaid[2].total - 500)}`,
  );
  console.log(`   PayFern, bad signature: ${pay(unpaid[0].number, unpaid[0].total, true)}`);
} else {
  console.log(`   (no PayFern webhook address found in the triggers list; payments skipped)`);
}

const chased = await flowRun(P, "billing/chase-unpaid");
console.log(`   chasing unpaid invoices: ${chased.status}`);

step("A portal hostname for everything, and the tenant's portal settings");
const domain = await admin.post(`${T}/domains`, {
  workspaceId: prod.id,
  app: "",
  hostname: "fernhill.localhost",
});
await admin.patch(`${T}/domains/${domain.id}`, { enabled: true });
await admin.put(`${T}/portal`, { signUp: false });
await admin.upload(`${T}/portal/logo`, readFileSync(join(HERE, "setup/logo.png")), "image/png");

step("Ending operator access");
await admin.delete(`${T}/access-grants/${grant.id}`);

const demo = {
  url: URL_,
  tenant: { id: tenant.id, slug: SLUG },
  workspaces: { clinics: prod.id, sandbox: dev.id },
  password: PASSWORD,
  members: PEOPLE.map(({ email, name, about, role }) => ({ email, name, about, role })),
  frontDesk: desk.map(([email, name, clinic]) => ({ email, name, clinic })),
  owners,
  apps: {
    frontDesk: `${URL_}/apps/${SLUG}/clinics/front-desk/`,
    petPortal: `${URL_}/apps/${SLUG}/clinics/pet-portal/`,
    performance: `${URL_}/apps/${SLUG}/clinics/performance/`,
    portal: `${URL_}/portal/${SLUG}/`,
    oneHostname: `${URL_.replace("localhost", "fernhill.localhost")}/`,
  },
  agent: {
    mcp: `${URL_}/api/v1${P}/mcp`,
    serviceAccount: "phone-assistant",
    key: assistantKey.token,
  },
  standIns: `${STAND_INS}/`,
};
mkdirSync(join(HERE, ".platform"), { recursive: true });
writeFileSync(join(HERE, ".platform/demo.json"), `${JSON.stringify(demo, null, 2)}\n`);
console.log(`\nDone. Sign-ins and addresses are in ${join(HERE, ".platform/demo.json")}`);
