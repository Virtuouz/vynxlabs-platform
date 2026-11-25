// Makes the tenants a stress test runs against, and writes what a load generator needs.
//
//   VOLVEL_URL=https://… VOLVEL_ADMIN_EMAIL=… VOLVEL_ADMIN_PASSWORD=… \
//     node setup/setup.mjs [--tenants 1] [--prefix stress] [--out ./.platform/stress.json]
//                          [--fill ROWS] [--schedules on|off] [--remove]
//
// For each of N tenants, `<prefix>-01` and on: the tenant, a production workspace `main`, the
// repository deployed to it, and a service account with a key that may start runs and read
// data. It can be run again: what exists is left as it is. Every wait has a limit, and a limit
// that is reached stops the script with what it was waiting for.
//
//   --tenants N       How many tenants. Default 1.
//   --prefix NAME     The tenants' slug prefix. Default stress.
//   --out FILE        Where to write the load generator's file. Default ./.platform/stress.json
//                     (relative to this example), which git ignores.
//   --fill ROWS       Run load/fill-table in each tenant until the table has ROWS rows. A run
//                     that is cut short is carried on; the point it reached is kept in --out,
//                     so a second run of --fill carries on from there.
//   --schedules on|off  Turn the two per-minute schedules on or off in every tenant. Without
//                     this flag a new tenant's schedules are paused and an old one's are left
//                     as they are.
//   --remove          Delete the tenants this prefix names, and nothing else.
//   --timeout SECONDS How long any one wait may take. Default 300. (A fill's runs wait for as
//                     long as the script's own limit, one hour, and a little more.)
//
// The instance's first operator signs in once, and so does the account that deploys: sign-in
// is held to 20 a minute from one address.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(HERE, "../../packages/cli/dist/bin.js");

// ----- Options -----

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) fail(`--${name} needs a value.`);
  return value;
};
function fail(message) {
  console.error(message);
  process.exit(1);
}
const whole = (name, fallback) => {
  const text = option(name, undefined);
  if (text === undefined) return fallback;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0) fail(`--${name} must be a whole number, not "${text}".`);
  return n;
};

for (const name of args.filter((a) => a.startsWith("--"))) {
  if (
    !["tenants", "prefix", "out", "fill", "schedules", "remove", "timeout"].includes(name.slice(2))
  )
    fail(`Unknown option ${name}. See the top of setup/setup.mjs.`);
}
const URL_ = (process.env.VOLVEL_URL ?? "").replace(/\/$/, "");
if (!URL_) fail("Set VOLVEL_URL to the instance's address.");
const ADMIN_EMAIL = process.env.VOLVEL_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.VOLVEL_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
  fail("Set VOLVEL_ADMIN_EMAIL and VOLVEL_ADMIN_PASSWORD to the instance's operator.");
const COUNT = whole("tenants", 1);
if (COUNT < 1 || COUNT > 99) fail("--tenants is from 1 to 99.");
const PREFIX = option("prefix", "stress");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(PREFIX))
  fail("--prefix is lowercase letters, digits and single hyphens.");
const OUT = resolve(HERE, option("out", ".platform/stress.json"));
const FILL = whole("fill", 0);
const SCHEDULES = option("schedules", undefined);
if (SCHEDULES !== undefined && !["on", "off"].includes(SCHEDULES))
  fail("--schedules is on or off.");
const REMOVE = flag("remove");
const WAIT_SECONDS = whole("timeout", 300);

const WORKSPACE = "main";
const TENANT_ADMIN_ROLE = "00000000-0000-7000-8000-000000000002";
/** The account that deploys, as Devi does in Fernhill: an instance-wide person with a password. */
const DEPLOYER = { email: `deployer@${PREFIX}.example`, name: "Stress deployer" };
const DEPLOYER_PASSWORD = "stress-deployer-2026";
/** What the load generator's key may do: start runs and flows, read what they did, read data. */
const DRIVER_ROLE = "load_driver";
const DRIVER_PERMISSIONS = [
  "script:read",
  "run:read",
  "run:write",
  "flow:read",
  "flow_run:read",
  "flow_run:write",
  "table:read",
  "data:read",
  "data:write",
  "dashboard:read",
  "trigger:read",
];
const SCHEDULE_PATHS = ["load/sleep-every-minute", "load/fan-out-every-minute"];
const WEBHOOK_PATH = "load/quick-hook";

const step = (text) => console.log(`\n▸ ${text}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slugOf = (n) => `${PREFIX}-${String(n).padStart(2, "0")}`;

// ----- The instance's API -----

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function client(cookie, token) {
  const call = async (method, path, body, { allow = [], seconds = 60 } = {}) => {
    let response;
    try {
      response = await fetch(`${URL_}/api/v1${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          origin: URL_,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(seconds * 1000),
      });
    } catch (error) {
      throw new ApiError(`${method} ${path}: no answer in ${seconds} s (${error.message})`, 0);
    }
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
    if (!response.ok && !allow.includes(response.status))
      throw new ApiError(
        `${method} ${path}: ${response.status} ${text.slice(0, 600)}`,
        response.status,
      );
    return response.ok ? parsed : { status: response.status, ...(parsed ?? {}) };
  };
  return {
    get: (path, options) => call("GET", path, undefined, options),
    post: (path, body = {}, options) => call("POST", path, body, options),
    put: (path, body = {}, options) => call("PUT", path, body, options),
    patch: (path, body = {}, options) => call("PATCH", path, body, options),
    delete: (path, options) => call("DELETE", path, undefined, options),
  };
}

/** Signs in once. A refusal for too many sign-ins waits out the minute and tries again, up to three times. */
async function signIn(email, password) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${URL_}/api/v1/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: URL_ },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok)
      return client(
        response.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; "),
      );
    if (response.status === 429 && attempt <= 3) {
      console.log(`  Sign-in is limited; waiting 65 s (try ${attempt} of 3).`);
      await sleep(65_000);
      continue;
    }
    throw new Error(`Signing in as ${email}: ${response.status} ${await response.text()}`);
  }
}

/** Asks `read` until it gives something, for at most `seconds`. Says what it waited for when it gives up. */
async function until(what, read, seconds = WAIT_SECONDS, every = 1000) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const found = await read();
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`Gave up after ${seconds} s waiting for ${what}.`);
    await sleep(every);
  }
}

// ----- What is kept from the last time -----

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { users: [] };
const known = new Map(previous.users.map((one) => [one.label, one]));

// ----- Sign in, and find the tenants -----

step(`Signing in to ${URL_} as the operator`);
const admin = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);

async function findTenant(slug) {
  const found = await admin.get(`/tenants?search=${encodeURIComponent(slug)}&limit=200`);
  return found.items.find((one) => one.slug === slug);
}

// ----- Removing -----

if (REMOVE) {
  for (let n = 1; n <= COUNT; n += 1) {
    const slug = slugOf(n);
    const tenant = await findTenant(slug);
    if (!tenant) {
      console.log(`  ${slug}: not there`);
      continue;
    }
    step(`Deleting ${slug}`);
    const T = `/tenants/${tenant.id}`;
    const grant = await admin.post(`${T}/access-grants`, {
      reason: "Removing a stress tenant",
      roleId: TENANT_ADMIN_ROLE,
      durationMinutes: 30,
    });
    try {
      for (const workspace of (await admin.get(`${T}/workspaces`)).items) {
        const W = `${T}/workspaces/${workspace.id}`;
        // Nothing new starts, then what is queued or going is cancelled, until nothing is left.
        await admin.patch(W, { triggersPaused: true });
        for (const [path, body] of [
          [`${W}/runs/cancel`, { include: "all" }],
          [`${W}/flow-runs/cancel`, {}],
        ]) {
          await until(`${slug}'s runs to be cancelled`, async () => {
            const done = await admin.post(path, body);
            return done.more ? null : done;
          });
        }
      }
      // A tenant with a run still going is refused (409): the cancelled ones take a moment to stop.
      await until(
        `${slug} to be deleted`,
        async () => {
          const done = await admin.post(`${T}/deletion`, { confirm: slug }, { allow: [409] });
          return done?.status === 409 ? null : { deleted: true };
        },
        WAIT_SECONDS,
        1500,
      );
    } finally {
      await admin.delete(`${T}/access-grants/${grant.id}`, { allow: [404] });
    }
    known.delete(slug);
    console.log(`  ${slug}: deleted`);
  }
  // What stays in the file is the tenants of this prefix that were not asked to go.
  if (existsSync(OUT))
    writeFileSync(OUT, `${JSON.stringify({ users: [...known.values()] }, null, 2)}\n`, {
      mode: 0o600,
    });
  console.log(
    `\nDone. The account ${DEPLOYER.email} is an instance-wide member and stays: members' accounts are not deleted with a tenant.`,
  );
  process.exit(0);
}

// ----- The deploying account: one sign-in, one key, for every tenant -----

step("The account that deploys");
const deployerKeyFile = join(dirname(OUT), `${PREFIX}-deployer.key`);
let deployerKey = existsSync(deployerKeyFile)
  ? readFileSync(deployerKeyFile, "utf8").trim()
  : undefined;
// Whether a key saved last time still works: asked of the instance, not assumed.
if (deployerKey) {
  const whoami = await client(undefined, deployerKey).get("/me", { allow: [401, 403, 404] });
  if (whoami.status) deployerKey = undefined;
}

// ----- The tenants -----

const users = [];
const limitsHit = [];
/** The file as it stands: the tenants done, and what is known of the rest, so a stop loses nothing. */
function save() {
  const done = new Set(users.map((one) => one.label));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    `${JSON.stringify({ users: [...users, ...[...known.values()].filter((one) => !done.has(one.label))] }, null, 2)}\n`,
    { mode: 0o600 },
  );
}
try {
  for (let n = 1; n <= COUNT; n += 1) {
    const slug = slugOf(n);
    step(`${slug}`);
    let tenant = await findTenant(slug);
    if (tenant) console.log("  the tenant exists");
    else {
      tenant = await admin.post("/tenants", { slug, name: `Stress ${String(n).padStart(2, "0")}` });
      console.log("  made the tenant");
    }
    const T = `/tenants/${tenant.id}`;
    // Before a grant the operator sees nothing inside the tenant.
    const grant = await admin.post(`${T}/access-grants`, {
      reason: "Setting up a stress tenant",
      roleId: TENANT_ADMIN_ROLE,
      durationMinutes: 240,
    });
    try {
      const roles = Object.fromEntries(
        (await admin.get(`${T}/roles`)).items.map((role) => [role.name, role.id]),
      );

      // The workspace: production, with its triggers paused until everything is in place.
      let workspace = (await admin.get(`${T}/workspaces`)).items.find(
        (one) => one.slug === WORKSPACE,
      );
      const freshWorkspace = !workspace;
      if (!workspace) {
        workspace = await admin.post(`${T}/workspaces`, {
          slug: WORKSPACE,
          name: "Main",
          type: "production",
          triggersPaused: true,
        });
        console.log("  made the workspace, with its triggers paused");
      }
      const W = `${T}/workspaces/${workspace.id}`;

      // The person who deploys: a member with the two roles a developer who ships has in Fernhill.
      const bindings = (await admin.get(`${T}/bindings`)).items;
      const people = (
        await admin.get(`${T}/members?search=${encodeURIComponent(DEPLOYER.email)}&limit=50`)
      ).items;
      let memberId = people.find((one) => one.email === DEPLOYER.email)?.id;
      if (!memberId) {
        memberId = (
          await admin.post(`${T}/members`, {
            email: DEPLOYER.email,
            name: DEPLOYER.name,
            password: DEPLOYER_PASSWORD,
          })
        ).id;
      }
      for (const role of ["developer", "deployer"]) {
        if (
          !bindings.some(
            (b) =>
              b.principalType === "member" &&
              b.principalId === memberId &&
              b.roleName === role &&
              b.scopeType === "tenant",
          )
        )
          await admin.post(`${T}/bindings`, {
            principalType: "member",
            principalId: memberId,
            roleId: roles[role],
          });
      }

      // The deployer's key is made on the first tenant that needs it, with one sign-in.
      if (!deployerKey) {
        const deployerSession = await signIn(DEPLOYER.email, DEPLOYER_PASSWORD);
        deployerKey = (await deployerSession.post("/api-keys", { name: `${PREFIX} deploys` }))
          .token;
        mkdirSync(dirname(OUT), { recursive: true });
        writeFileSync(deployerKeyFile, `${deployerKey}\n`, { mode: 0o600 });
        console.log(`  signed in as the deployer; its key is kept in ${deployerKeyFile}`);
      }

      // The code: deployed once.
      const deployed = await admin.get(`${W}/deployments`);
      if (deployed.items.length > 0) console.log("  the repository is deployed");
      else {
        console.log("  deploying the repository");
        const out = execFileSync(
          "node",
          [
            CLI,
            "deploy",
            "--tenant",
            slug,
            "--workspace",
            WORKSPACE,
            "--message",
            "Stress fixtures",
          ],
          {
            cwd: HERE,
            env: { ...process.env, VOLVEL_URL: URL_, VOLVEL_TOKEN: deployerKey },
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: WAIT_SECONDS * 1000,
          },
        );
        console.log(`    ${out.trim().split("\n").slice(-2).join("\n    ")}`);
      }

      // The load generator's service account, its role and its key.
      let role = roles[DRIVER_ROLE];
      if (!role) {
        role = (
          await admin.post(`${T}/roles`, {
            name: DRIVER_ROLE,
            description: "Starts runs, reads what they did and reads rows. For a load generator.",
            permissions: DRIVER_PERMISSIONS,
          })
        ).id;
      }
      let account = (await admin.get(`${T}/service-accounts`)).items.find(
        (one) => one.name === "load-generator",
      );
      if (!account) {
        account = await admin.post(`${T}/service-accounts`, {
          name: "load-generator",
          description: "What the stress test's load generator signs in as.",
        });
      }
      if (
        !bindings.some(
          (b) =>
            b.principalType === "service_account" &&
            b.principalId === account.id &&
            b.workspaceId === workspace.id &&
            b.roleName === DRIVER_ROLE,
        )
      )
        await admin.post(`${T}/bindings`, {
          workspaceId: workspace.id,
          principalType: "service_account",
          principalId: account.id,
          roleId: role,
        });
      let apiKey = known.get(slug)?.apiKey;
      if (apiKey) {
        // Whether it still works: asked of the instance, not assumed.
        const probe = await client(undefined, apiKey).get(`${W}/runs?limit=1`, {
          allow: [401, 403],
        });
        if (probe.status) apiKey = undefined;
      }
      if (!apiKey) {
        apiKey = (
          await admin.post(`${T}/service-accounts/${account.id}/api-keys`, {
            name: `Load generator ${new Date().toISOString().slice(0, 16)}`,
          })
        ).token;
        console.log("  made an API key");
      } else console.log("  the API key from the last run still works");

      // The webhook's address: it is a credential, and the operator's grant allows reading it.
      const triggers = (await admin.get(`${W}/triggers`)).items;
      const hook = triggers.find((one) => one.path === WEBHOOK_PATH);
      if (!hook?.url) throw new Error(`${slug}: the webhook ${WEBHOOK_PATH} has no address.`);

      // The schedules. A new workspace has everything paused, and the two are paused one by
      // one before the rest is let go, so neither fires before it is asked to.
      const turn = async (on) => {
        for (const path of SCHEDULE_PATHS) {
          if (on) await admin.delete(`${W}/trigger-pauses/${path}`, { allow: [404] });
          else await admin.put(`${W}/trigger-pauses/${path}`, { reason: "Stress fixture" });
        }
      };
      if (freshWorkspace || SCHEDULES === "off") await turn(false);
      if (SCHEDULES === "on") {
        await turn(true);
        // A workspace paused as a whole holds them too.
        await admin.patch(W, { triggersPaused: false });
      }
      if (freshWorkspace) {
        await admin.patch(W, { triggersPaused: false });
        console.log("  schedules paused; the workspace's other triggers are on");
      }
      if (SCHEDULES) console.log(`  schedules ${SCHEDULES}`);
      // Whether the workspace as a whole is paused is left alone on a tenant that exists.

      // The table.
      let filled = known.get(slug)?.extra?.filled ?? 0;
      if (FILL > 0) {
        const present = (await admin.get(`${W}/rows/load/records?limit=1`)).items.length > 0;
        if (present && filled === 0)
          console.log(
            "  load/records already has rows and --out does not say how far it was filled: left as it is",
          );
        else {
          console.log(`  filling load/records to ${FILL} rows from ${filled}`);
          const driver = client(undefined, apiKey);
          const started = Date.now();
          while (filled < FILL) {
            const created = await driver.post(`${W}/runs`, {
              script: "load/fill-table",
              input: { rows: FILL, from: filled },
            });
            // The script's own limit is an hour; it stops itself five minutes before.
            const finished = await until(
              `the fill run ${created.id}`,
              async () => {
                const found = await driver.get(`${W}/runs/${created.id}`);
                return ["queued", "running"].includes(found.status) ? null : found;
              },
              3900,
              2000,
            );
            if (finished.status !== "succeeded")
              throw new Error(
                `${slug}: the fill run ${finished.id} ${finished.status}: ${finished.error?.message ?? ""}`,
              );
            filled = finished.output.next;
            console.log(
              `    ${filled} of ${FILL} rows after ${Math.round((Date.now() - started) / 1000)} s`,
            );
            // Kept as it goes, so a second run carries on from here.
            known.set(slug, {
              ...(known.get(slug) ?? { label: slug }),
              extra: { ...(known.get(slug)?.extra ?? {}), filled },
            });
            save();
          }
        }
      }

      users.push({
        label: slug,
        tenant: tenant.id,
        workspace: workspace.id,
        cookie: null,
        apiKey,
        extra: {
          scripts: [
            { path: "load/quick", input: {} },
            { path: "load/sleep", input: { seconds: 20 } },
            { path: "load/burn-cpu", input: { seconds: 10 } },
            { path: "load/hold-memory", input: { megabytes: 300, seconds: 20 } },
            { path: "load/item", input: { index: 1 } },
          ],
          webhookUrl: hook.url,
          table: "load/records",
          flow: "load/fan-out",
          flowInput: { count: 1000 },
          dashboard: "load/overview",
          tenantSlug: slug,
          workspaceSlug: WORKSPACE,
          filled,
        },
      });
      // Written after every tenant, so that a stop part-way leaves the ones that are done.
      save();
    } finally {
      await admin.delete(`${T}/access-grants/${grant.id}`, { allow: [404] });
    }
  }
} catch (error) {
  limitsHit.push(error);
}

if (limitsHit.length > 0) {
  console.error(`\nStopped: ${limitsHit[0].message}`);
  console.error(
    `${users.length} of ${COUNT} tenants are in ${OUT}. Run again to carry on: what exists is kept.`,
  );
  process.exit(1);
}
console.log(`\nWritten to ${OUT}: ${users.length} tenant${users.length === 1 ? "" : "s"}.`);
