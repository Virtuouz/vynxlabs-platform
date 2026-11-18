// Fills a Lakeshore State University workspace that the repository has been
// deployed to: students, the devices on the shelf, a term's loans so far, three
// students who can sign in, and a key for the help-desk agent.
//
//   PLATFORM_EMAIL=… PLATFORM_PASSWORD=… node setup/setup.mjs --tenant higher-ed --workspace devices-dev
//
// The tenant's `helpdesk-assistant` service account and its Tech Desk group come
// from the repository's own `tenant/` files: run `platform tenant release` first.
// What to sign in with is written to .platform/<workspace>.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const URL_ = (process.env.PLATFORM_URL ?? "https://vynxlabs-platform-test.fly.dev").replace(
  /\/$/,
  "",
);
const arg = (name) => process.argv[process.argv.indexOf(`--${name}`) + 1];
const TENANT = arg("tenant") ?? "higher-ed";
const WORKSPACE = arg("workspace") ?? "devices-dev";
const STUDENT_PASSWORD = "lakeshore-demo-2026";
const step = (text) => console.log(`\n▸ ${text}`);

async function session(email, password) {
  const r = await fetch(`${URL_}/api/v1/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: URL_ },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`Signing in as ${email}: ${r.status} ${await r.text()}`);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
function client(cookie) {
  const call = async (method, path, body) => {
    const r = await fetch(`${URL_}/api/v1${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        origin: URL_,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 600)}`);
    return text ? JSON.parse(text) : null;
  };
  return {
    get: (p) => call("GET", p),
    post: (p, b = {}) => call("POST", p, b),
    put: (p, b = {}) => call("PUT", p, b),
    patch: (p, b = {}) => call("PATCH", p, b),
  };
}

const me = client(await session(process.env.PLATFORM_EMAIL, process.env.PLATFORM_PASSWORD));
const tenant = (await me.get("/tenants?limit=200")).items.find((t) => t.slug === TENANT);
if (!tenant) throw new Error(`No tenant ${TENANT}.`);
const T = `/tenants/${tenant.id}`;
const ws = (await me.get(`${T}/workspaces`)).items.find((w) => w.slug === WORKSPACE);
if (!ws) throw new Error(`No workspace ${WORKSPACE} in ${TENANT}.`);
const W = `${T}/workspaces/${ws.id}`;

const existing = await me.get(`${W}/rows/students?limit=1`);
if (existing.items.length > 0) {
  console.error(`${WORKSPACE} already has students. This script fills an empty workspace.`);
  process.exit(1);
}

// ----- A deterministic term -----

let seed = 20261117;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const FIRST = [
  "Maria",
  "Jamal",
  "Priya",
  "Ethan",
  "Sofia",
  "Malik",
  "Hannah",
  "Diego",
  "Aisha",
  "Noah",
  "Grace",
  "Tomas",
  "Leila",
  "Owen",
  "Mei",
  "Caleb",
  "Zara",
  "Lucas",
  "Nadia",
  "Elijah",
  "Yara",
  "Isaac",
  "Chloe",
  "Mateo",
  "Imani",
  "Ryan",
  "Fatima",
  "Jonah",
  "Ava",
  "Kenji",
  "Rosa",
  "Ben",
  "Amara",
  "Theo",
  "Lina",
  "Marcus",
  "Ines",
  "Samir",
  "Julia",
  "Kofi",
];
const LAST = [
  "Lopez",
  "Carter",
  "Raman",
  "Novak",
  "Rossi",
  "Okafor",
  "Becker",
  "Alvarez",
  "Hassan",
  "Kim",
  "Murphy",
  "Silva",
  "Haddad",
  "Walsh",
  "Chen",
  "Brooks",
  "Ahmed",
  "Moreau",
  "Petrova",
  "Johnson",
  "Farah",
  "Cohen",
  "Dubois",
  "Ortiz",
  "Mensah",
  "Nguyen",
  "Khan",
  "Price",
  "Lindqvist",
  "Tanaka",
  "Vega",
  "Adler",
  "Eze",
  "Grant",
  "Saleh",
  "Reid",
  "Costa",
  "Bose",
  "Weber",
  "Boateng",
];
const PROGRAMS = [
  "Nursing",
  "Computer Science",
  "Business",
  "Biology",
  "Education",
  "History",
  "Engineering",
  "Psychology",
  "Art",
  "Undeclared",
];

const students = FIRST.map((first, i) => {
  const last = LAST[i];
  return {
    student_number: `S${String(1002001 + i * 37).padStart(7, "0")}`,
    name: `${first} ${last}`,
    email: `${first}.${last}@students.lakeshore.example`.toLowerCase(),
    program: PROGRAMS[i % PROGRAMS.length],
    standing: i === 7 || i === 23 ? "hold" : "good",
    hold_reason:
      i === 7 ? "A hotspot was not returned last term." : i === 23 ? "Unpaid library fine." : null,
  };
});

const SHELF = [
  ["laptop", "LT", 14, ["Dell Latitude 3440", "Lenovo ThinkPad E14"]],
  ["chromebook", "CB", 10, ["Acer Chromebook 314"]],
  ["hotspot", "HS", 6, ["T-Mobile Inseego 5G"]],
  ["ipad", "IP", 6, ["iPad 10th gen"]],
  ["calculator", "TI", 12, ["TI-84 Plus CE"]],
  ["charger", "CH", 10, ["USB-C 65W"]],
];
const devices = [];
for (const [kind, prefix, count, models] of SHELF) {
  for (let n = 1; n <= count; n++) {
    devices.push({
      asset_tag: `${prefix}-${String(n).padStart(4, "0")}`,
      kind,
      model: pick(models),
      serial: `${prefix}${Math.floor(rand() * 1e9)
        .toString(36)
        .toUpperCase()}${n}`,
      location: n % 3 === 0 ? "library" : "tech-desk",
      status: "available",
      condition: rand() < 0.2 ? "worn" : "good",
    });
  }
}
devices.find((d) => d.asset_tag === "LT-0014").status = "maintenance";
devices.find((d) => d.asset_tag === "LT-0014").notes = "Cracked hinge. Sent for repair.";
devices.find((d) => d.asset_tag === "CB-0010").status = "retired";

// Loans this term: every hotspot is out, so the next hotspot request is waitlisted.
const borrowers = students.filter((s) => s.standing === "good");
const loans = [];
const requests = [];
let k = 0;
const lend = (device, { out, daysAgo, length }) => {
  const s = borrowers[k++ % borrowers.length];
  const number = `REQ-T${String(100 + loans.length)}`;
  const outOn = day(-daysAgo);
  requests.push({
    number,
    student_number: s.student_number,
    student_name: s.name,
    kind: device.kind,
    reason: pick([
      "Online classes from home",
      "My own laptop broke",
      "Exam this week",
      "Field placement",
      "No internet at home",
    ]),
    location: device.location,
    status: "fulfilled",
    device_tag: device.asset_tag,
    decided_at: `${outOn}T15:00:00.000Z`,
    decision_note: "Approved.",
    submitted_via: "student",
  });
  loans.push({
    number: `LN-T${String(100 + loans.length)}`,
    device_tag: device.asset_tag,
    kind: device.kind,
    student_number: s.student_number,
    student_name: s.name,
    request_number: number,
    checked_out_at: `${outOn}T15:30:00.000Z`,
    due_on: day(-daysAgo + length),
    status: out ? "out" : "returned",
    overdue: false,
    ...(out
      ? {}
      : {
          returned_at: `${day(-daysAgo + length - 1)}T18:00:00.000Z`,
          return_condition: "good",
        }),
  });
  if (out) device.status = "checked_out";
};
for (const d of devices.filter((d) => d.kind === "hotspot"))
  lend(d, { out: true, daysAgo: 5 + Math.floor(rand() * 12), length: 14 });
for (const d of devices.filter((d) => d.kind === "laptop").slice(0, 9))
  lend(d, { out: true, daysAgo: 3 + Math.floor(rand() * 20), length: 14 });
for (const d of devices.filter((d) => d.kind === "calculator").slice(0, 5))
  lend(d, { out: true, daysAgo: 2 + Math.floor(rand() * 10), length: 7 });
for (const d of devices.filter((d) => d.kind === "chromebook").slice(0, 4))
  lend(d, { out: true, daysAgo: 1 + Math.floor(rand() * 6), length: 14 });
// Earlier in the term: lent and returned.
for (const d of devices.filter((d) => d.status === "available").slice(0, 18))
  lend(d, { out: false, daysAgo: 30 + Math.floor(rand() * 30), length: 14 });

step(`Filling ${TENANT}/${WORKSPACE} on ${URL_}`);
await me.post(`${W}/rows/students`, { rows: students });
await me.post(`${W}/rows/devices`, { rows: devices });
await me.post(`${W}/rows/requests`, { rows: requests });
await me.post(`${W}/rows/loans`, { rows: loans });
console.log(
  `  ${students.length} students, ${devices.length} devices, ${loans.filter((l) => l.status === "out").length} loans out, ${loans.filter((l) => l.status === "returned").length} returned`,
);

step("Students who can sign in");
const anonymous = client("");
const accounts = [];
for (const i of [0, 1, 7]) {
  const s = students[i];
  const list = await me.get(`${T}/end-users?limit=200`);
  let user = list.items.find((u) => u.email === s.email);
  if (!user) {
    const made = await me.post(`${T}/end-users`, { email: s.email, name: s.name });
    const token = new URL(made.invitation.url).searchParams.get("token");
    await anonymous.post(`${T}/end-user-auth/passwords`, { token, password: STUDENT_PASSWORD });
    user = made.endUser;
  }
  await me.patch(`${T}/end-users/${user.id}`, { attributes: { student_id: s.student_number } });
  accounts.push({
    email: s.email,
    password: STUDENT_PASSWORD,
    student_number: s.student_number,
    standing: s.standing,
  });
  console.log(`  ${s.email} (${s.student_number}${s.standing === "hold" ? ", has a hold" : ""})`);
}

step("A key for the help-desk agent");
const sa = (await me.get(`${T}/service-accounts`)).items.find(
  (a) => a.key === "helpdesk-assistant",
);
if (!sa) {
  throw new Error(
    "There is no helpdesk-assistant service account. Run `platform tenant release --tenant <slug>` in this repository first.",
  );
}
const key = await me.post(`${T}/service-accounts/${sa.id}/api-keys`, {
  name: `Help line (${WORKSPACE})`,
});

mkdirSync(join(HERE, ".platform"), { recursive: true });
writeFileSync(
  join(HERE, `.platform/${WORKSPACE}.json`),
  `${JSON.stringify(
    {
      url: URL_,
      tenant: TENANT,
      workspace: WORKSPACE,
      apps: {
        borrow: `${URL_}/apps/${TENANT}/${WORKSPACE}/borrow/`,
        desk: `${URL_}/apps/${TENANT}/${WORKSPACE}/desk/`,
      },
      students: accounts,
      agent: { mcp: `${URL_}/api/v1${W}/mcp`, key: key.token },
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);
console.log(`\nWritten to .platform/${WORKSPACE}.json`);
