import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FEEDBACK_COLUMNS, FEEDBACK_TABLE } from "@volvel/docs-engine";
import { type Bundle, type BundleManifest, bundleDigest, fileSchemas } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, putSeen, startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
const MAIN = "localhost:8080";

/** The columns of an answer, as the console makes them and the doc writer's deploy holds them to. */
const answers = Object.fromEntries(
  Object.entries(FEEDBACK_COLUMNS).map(([name, column]) => [
    name,
    { type: column.type, ...(column.required ? { required: true } : {}) },
  ]),
);

let t: TestApp;
let tenant: string;
let prod: string;
let alice: Client;

const ws = () => `/tenants/${tenant}/workspaces/${prod}`;
const manifest = (kind: string, path: string, body: object, more: object = {}): BundleManifest =>
  ({ kind, path, schemaVersion: 1, ownership: "code", body, ...more }) as BundleManifest;
const page = (path: string, frontmatter: string, body = "Words.\n", more: object = {}) =>
  manifest("doc", path, { source: `---\n${frontmatter}\n---\n\n${body}` }, more);

/** A handbook of two collections, served to anyone, and a staff manual served to nobody outside. */
const handbook = (): BundleManifest[] => [
  manifest("table", "orders", {
    description: "What customers bought.",
    columns: { status: { type: "text", description: "Where the order is in its life." } },
  }),
  page(
    "handbook/index",
    "title: Handbook\ndescription: How the shop runs.\npages: [support]",
    "Start with [refunds](support/refunds).\n",
  ),
  page("handbook/faq", "title: Questions"),
  page(
    "handbook/support/index",
    "title: Customer support\ndescription: Refunds and returns.\npages: [returns, refunds]",
  ),
  page(
    "handbook/support/refunds",
    [
      "title: Refund an order",
      "description: Full and partial refunds.",
      "topic: support-refunds",
      "about:",
      "  - table: orders",
      "terms:",
      "  - id: rma",
      "    term: RMA",
      "    short: A return authorisation.",
    ].join("\n"),
    [
      "# Before you start",
      "",
      "Ask for the :term[RMA]{id=rma} first, then see [returns](returns#by-post) or [the home page](../).",
      "",
      "The :term[status]{table=orders column=status} column says where it is.",
      "",
      "<script>alert(1)</script> is only words.",
      "",
      ":::tabs",
      "::::tab{label=Card}",
      "Refund to the card.",
      "::::",
      "::::tab{label=Cash}",
      "Refund at the till.",
      "::::",
      ":::",
      "",
      "| Amount | Who |",
      "| ---: | --- |",
      "| 50 | Anyone |",
    ].join("\n"),
  ),
  page(
    "handbook/support/returns",
    "title: Returns",
    "## By post\n\nParcels come back on Tuesdays. An :term[RMA]{id=rma} is needed.\n",
  ),
  page("handbook/ops/closing/checklist", "title: Closing checklist"),
  manifest("app", "help", { title: "Shop handbook", docs: "handbook" }),
  manifest("binding", "bindings/help", {
    role: "portal_user",
    principal: { type: "anonymous" },
    resource: "help",
  }),
  page("manual/index", "title: Staff manual", "For staff only.\n"),
  manifest("app", "staff", { title: "Staff manual", docs: "manual" }),
];

function bundle(manifests: BundleManifest[]): Bundle {
  const unsigned = {
    formatVersion: 4 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export {};",
    assets: [],
  };
  return { ...unsigned, digest: bundleDigest(unsigned) } as Bundle;
}

async function deploy(manifests: BundleManifest[], options: object = {}) {
  const uploaded = await alice.post(`${ws()}/bundles`, bundle(manifests));
  if (uploaded.status !== 201) return uploaded;
  return alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id, ...options });
}

/** A browser at the instance's address. It keeps the cookies it is given. */
function browser() {
  const jar = new Map<string, string>();
  const get = async (url: string) => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await t.app.inject({
      method: "GET",
      url,
      headers: { host: MAIN, ...(cookie ? { cookie } : {}) },
    });
    return {
      status: response.statusCode,
      body: response.body,
      headers: response.headers as Record<string, string>,
    };
  };
  const form = async (url: string, fields: Record<string, string>) => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await t.app.inject({
      method: "POST",
      url,
      headers: {
        host: MAIN,
        origin: `http://${MAIN}`,
        "content-type": "application/x-www-form-urlencoded",
        ...(cookie ? { cookie } : {}),
      },
      payload: new URLSearchParams(fields).toString(),
    });
    for (const line of ([] as string[]).concat(response.headers["set-cookie"] ?? [])) {
      const [pair = ""] = line.split(";");
      const split = pair.indexOf("=");
      jar.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return { status: response.statusCode };
  };
  return { get, form };
}

// The names the product's own help holds, as the console's build leaves them, so that no test
// depends on a console having been built.
let consoleDir: string;

beforeAll(async () => {
  consoleDir = mkdtempSync(join(tmpdir(), "vx-help-"));
  mkdirSync(join(consoleDir, "help"));
  writeFileSync(
    join(consoleDir, "help", "manifest.json"),
    JSON.stringify({ terms: { workspace: {} }, topics: { "data-tables": {} } }),
  );
  t = await startTestApp({ config: { consoleDir } });
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
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
});

afterAll(async () => {
  await t?.stop();
  if (consoleDir) rmSync(consoleDir, { recursive: true, force: true });
});

const HELP = "/apps/acme/main/help/";

describe("what the app kind says of its feedback table", () => {
  test("it names every column a deploy requires", () => {
    const schema = fileSchemas().find((one) => one.kind === "app")?.schema;
    const find = (node: unknown): string | undefined => {
      if (!node || typeof node !== "object") return undefined;
      const record = node as Record<string, unknown>;
      const feedback = record.feedback as { description?: string } | undefined;
      if (feedback?.description) return feedback.description;
      for (const value of Object.values(record)) {
        const found = find(value);
        if (found) return found;
      }
      return undefined;
    };
    const said = find(schema);
    expect(said).toBeDefined();
    for (const column of Object.keys(FEEDBACK_COLUMNS)) {
      expect(said, `the text names ${column}`).toContain(`\`${column}\``);
    }
  });
});

describe("a folder of pages served as a docs app", () => {
  test("it deploys, and is listed with the workspace's apps as documentation", async () => {
    const deployed = await deploy(handbook());
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const apps = (await alice.get(`${ws()}/apps`)).body.items;
    expect(apps.map((app: Any) => [app.path, app.builtWith, app.docs, app.url])).toEqual([
      ["help", "docs", "handbook", `http://${MAIN}${HELP}`],
      ["staff", "docs", "manual", `http://${MAIN}/apps/acme/main/staff/`],
    ]);
  });

  test("anyone it is bound to reads it, signed in or not, under a policy that runs nothing of the tenant's", async () => {
    const home = await browser().get(HELP);
    expect(home.status).toBe(200);
    expect(home.headers["content-type"]).toContain("text/html");
    const policy = home.headers["content-security-policy"] ?? "";
    // Scripts are the instance's own. Inline styles are allowed, for the diagrams Mermaid draws.
    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toMatch(/script-src[^;]*unsafe/);
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("img-src 'self' https:");
    expect(home.body).toContain("<h1>Handbook</h1>");
    expect(home.body).toContain('<p class="intro">How the shop runs.</p>');
    expect(home.body).toContain("<title>Handbook · Shop handbook</title>");
    // A link is written from where its file is, and drawn as the app's own address.
    expect(home.body).toContain(`<a href="${HELP}support/refunds">refunds</a>`);
    // The one script is the platform's own, served as a file. Nothing is written into the page
    // but what the script reads, as data that is never run.
    expect(home.body.match(/<script/g)).toHaveLength(2);
    expect(home.body).toContain('<script src="/_platform/docs.js" defer></script>');
    expect(home.body).toMatch(/<script type="application\/json" id="docs-data">\{"base":/);
    // The home page lists the collections, each with its first pages.
    expect(home.body).toContain(`<a href="${HELP}support">Customer support</a>`);
    expect(home.body).toContain("<p>Refunds and returns.</p>");
    expect(home.body).not.toMatch(/\son[a-z]+=|style="/);
  });

  test("its navigation comes from its folders", async () => {
    const refunds = (await browser().get(`${HELP}support/refunds`)).body;
    // Collections: what the home page lists first, the rest by title, and loose pages last.
    const switcher =
      [...refunds.matchAll(/<details class="switcher">.*?<ul>(.*?)<\/ul><\/details>/gs)][0]?.[1] ??
      "";
    expect([...switcher.matchAll(/<b>([^<]+)<\/b>/g)].map((found) => found[1])).toEqual([
      "Customer support",
      "Ops",
      "Uncategorized",
    ]);
    expect(switcher).toContain(`<a href="${HELP}support" aria-current="true">`);
    // The collection's pages, as its own page lists them: returns, then refunds.
    const side =
      [...refunds.matchAll(/<nav aria-label="Customer support">(.*?)<\/nav>/gs)][0]?.[1] ?? "";
    expect([...side.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((found) => found[1])).toEqual([
      "Overview",
      "Returns",
      "Refund an order",
    ]);
    expect(side).toContain(
      `<a href="${HELP}support/refunds" aria-current="page">Refund an order</a>`,
    );
    // A folder under a collection is a group, named for its folder when it has no page of its own.
    const ops = (await browser().get(`${HELP}ops/closing/checklist`)).body;
    expect(ops).toContain('<span class="label">Closing</span>');
    // The folders the page is in are open, and say where it is.
    expect(ops).toContain('<li class="open-folder"><details open>');
    // A folder with no page of its own leads to the first page in it.
    expect(ops).toContain(
      `<ol class="crumbs" aria-label="Where this page is"><li><a href="${HELP}ops/closing/checklist">Ops</a></li><li><a href="${HELP}ops/closing/checklist">Closing</a></li></ol>`,
    );
    expect(ops).toContain("<h1>Closing checklist</h1>");
    // A folder's address is its index page, with or without the slash.
    expect((await browser().get(`${HELP}support`)).body).toContain("<h1>Customer support</h1>");
    expect((await browser().get(`${HELP}support/`)).body).toContain("<h1>Customer support</h1>");
  });

  test("a page is drawn from its tree: terms, links, tabs and tables, and nothing its author wrote as markup", async () => {
    const refunds = (await browser().get(`${HELP}support/refunds`)).body;
    expect(refunds).toContain("<title>Refund an order · Shop handbook</title>");
    expect(refunds).toContain("<p>Full and partial refunds.</p>");
    // The page's own title is its first heading. What its author wrote as # comes under it.
    expect(refunds).toContain('<h2 id="before-you-start">Before you start</h2>');
    // A term defined on this page says what it means. One defined elsewhere leads there too.
    expect(refunds).toMatch(
      /<button type="button" class="vd-term-word"[^>]*>RMA<\/button><span class="vd-term-tip"[^>]*>A return authorisation\.<\/span>/,
    );
    const returns = (await browser().get(`${HELP}support/returns`)).body;
    expect(returns).toContain(`<a href="${HELP}support/refunds">More about RMA</a>`);
    // A term that names a column is the word alone here: what it means is told to those who
    // may read the table, by the console and by the table's own apps.
    expect(refunds).toContain("<p>The status column says where it is.</p>");
    expect(refunds).toContain(`<a href="${HELP}support/returns#by-post">returns</a>`);
    expect(refunds).toContain(`<a href="${HELP}">the home page</a>`);
    expect(refunds).toContain("&lt;script&gt;alert(1)&lt;/script&gt; is only words.");
    // Tabs are sections one under another until the script arrives.
    expect(refunds).toContain('<div class="vd-tabs" data-vd-tabs="1">');
    expect(refunds).toContain('<h4 class="vd-tab-label">Cash</h4>');
    expect(refunds).toContain('<th class="vd-align-right">Amount</th>');
    expect(refunds).toContain(`<a class="next" href="${HELP}ops/closing/checklist">`);
  });

  test("it is searched with a form, and the answer is a page", async () => {
    const found = await browser().get(`${HELP}_search?q=tuesdays`);
    expect(found.status).toBe(200);
    expect(found.body).toContain("1 page for “tuesdays”");
    expect(found.body).toContain(`<a href="${HELP}support/returns">Returns</a>`);
    expect(found.body).toContain('<meta name="robots" content="noindex">');
    expect(found.body).toContain(
      `<form class="search-form" action="${HELP}_search" method="get" role="search">`,
    );
    // The page of results is in the app's frame, as wide as any page.
    expect(found.body).toContain('<aside class="side" id="nav"');
    expect(found.body).toContain('<div class="column">');
    const nothing = await browser().get(`${HELP}_search?q=${encodeURIComponent('"><script>x')}`);
    expect(nothing.body).toContain("Nothing here matches");
    expect(nothing.body).not.toContain("<script>x");
    // The other app's pages are not in this one's search.
    expect((await browser().get(`${HELP}_search?q=staff`)).body).toContain("Nothing here matches");
  });

  test("it is searched as it is typed, by section, for whoever may open it", async () => {
    const found = await browser().get(`${HELP}_search.json?q=tuesdays`);
    expect(found.status).toBe(200);
    expect(found.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(found.body)).toEqual({
      pages: [
        {
          url: "support/returns",
          title: [{ text: "Returns" }],
          crumb: "Customer support",
          places: [
            {
              type: "text",
              url: "support/returns#by-post",
              words: [
                { text: "Parcels come back on " },
                { text: "Tuesdays", hit: true },
                { text: "." },
              ],
            },
          ],
        },
      ],
    });
    // Narrowed to a collection with nothing that matches, nothing.
    expect(JSON.parse((await browser().get(`${HELP}_search.json?q=tuesdays&in=ops`)).body)).toEqual(
      {
        pages: [],
      },
    );
    // An app the caller may not open answers nothing of itself.
    expect((await browser().get("/apps/acme/main/staff/_search.json?q=staff")).status).toBe(303);
  });

  test("a page's Markdown is given to whoever may read the page", async () => {
    const markdown = await browser().get(`${HELP}support/returns.md`);
    expect(markdown.status).toBe(200);
    expect(markdown.headers["content-type"]).toContain("text/markdown");
    expect(markdown.body).toBe(
      "# Returns\n\n## By post\n\nParcels come back on Tuesdays. An :term[RMA]{id=rma} is needed.\n",
    );
    expect((await browser().get("/apps/acme/main/staff/index.md")).status).toBe(303);
    const page = (await browser().get(`${HELP}support/returns`)).body;
    expect(page).toContain(`data-copy="${HELP}support/returns.md" hidden`);
  });

  test("an address that names no page says so, in the app's own frame", async () => {
    const missing = await browser().get(`${HELP}support/nothing-here`);
    expect(missing.status).toBe(404);
    expect(missing.body).toContain("There is no page here");
    expect(missing.body).toContain(`<a class="brand" href="${HELP}">`);
    expect(missing.body).toContain('<aside class="side" id="nav"');
    expect(missing.body).toContain('<aside class="toc" aria-label="On this page"></aside>');
    // A page of another docs app is not reachable through this one.
    expect((await browser().get(`${HELP}../staff/`)).status).not.toBe(200);
  });

  test("a diagram is its source until the instance's drawing script draws it", async () => {
    const script = await browser().get("/_platform/docs.js");
    expect(script.body).toContain('import("/_platform/diagrams.js")');
    // Served from the console's own build, when there is one; never from another site.
    const drawing = await t.app.inject({
      method: "GET",
      url: "/_platform/diagrams.js",
      headers: { host: MAIN },
    });
    expect([200, 404]).toContain(drawing.statusCode);
    if (drawing.statusCode === 200) {
      expect(drawing.headers["content-type"]).toContain("text/javascript");
      expect(drawing.body).not.toMatch(/https?:\/\/(unpkg|cdn)/);
    }
  });

  test("the stylesheet and the script are the platform's own files", async () => {
    const css = await browser().get("/_platform/docs.css");
    expect(css.headers["content-type"]).toContain("text/css");
    expect(css.body).toContain(".vd-doc");
    expect(css.body).not.toMatch(/url\(|@import/);
    const script = await browser().get("/_platform/docs.js");
    expect(script.headers["content-type"]).toContain("text/javascript");
    expect(script.body).toContain("data-vd-tabs");
  });

  test("an app bound to nobody is for members, and one bound to end users asks them to sign in", async () => {
    const guest = await browser().get("/apps/acme/main/staff/");
    expect(guest.status).toBe(303);
    expect(guest.headers.location).toContain("/portal/acme/sign-in");

    const bound = await deploy([
      ...handbook(),
      manifest("binding", "bindings/staff", {
        role: "portal_user",
        principal: { type: "end_users" },
        resource: "staff",
      }),
    ]);
    expect(bound.status, JSON.stringify(bound.body)).toBe(201);
    expect((await browser().get("/apps/acme/main/staff/")).status).toBe(303);
    const created = await alice.post(`/tenants/${tenant}/end-users`, {
      email: "ivy@customer.example",
      name: "Ivy",
    });
    const ivy = browser();
    const token = new URL(created.body.invitation.url).searchParams.get("token") as string;
    expect(
      (await ivy.form("/portal/acme/set-password", { token, password: PASSWORD })).status,
    ).toBe(303);
    const manual = await ivy.get("/apps/acme/main/staff/");
    expect(manual.status).toBe(200);
    expect(manual.body).toContain("For staff only.");
    // The portal lists it among her apps.
    expect((await ivy.get("/portal/acme/")).body).toContain("/apps/acme/main/staff/");
  });

  test("a page that is renamed keeps answering at its old address, which leads to the new one", async () => {
    const renamed = handbook().map((one) =>
      one.kind === "doc" && one.path === "handbook/support/returns"
        ? { ...one, path: "handbook/support/sending-back", key: "handbook/support/returns" }
        : one.path === "handbook/support/refunds"
          ? {
              ...one,
              body: {
                source: (one.body as { source: string }).source.replace(
                  "returns#by-post",
                  "sending-back#by-post",
                ),
              },
            }
          : one,
    );
    const deployed = await deploy(renamed);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect((await browser().get(`${HELP}support/sending-back`)).status).toBe(200);
    const old = await browser().get(`${HELP}support/returns`);
    expect(old.status).toBe(308);
    expect(old.headers.location).toBe(`${HELP}support/sending-back`);
  });
});

describe("what a workspace's documentation gives the help", () => {
  const terms = async (get: (url: string) => Promise<Any>, prefix = "") =>
    (await get(`${prefix}${ws()}/terms`)).body;
  const handbookPage = (path: string, title: string) => ({
    app: "help",
    path: `handbook/${path}`,
    title,
    url: `http://${MAIN}${HELP}${path.replace(/(^|\/)index$/, "")}`,
  });

  test("its terms, its topics and the pages attached to resources, to whoever may open the app they are in", async () => {
    const deployed = await deploy([
      ...handbook().filter((one) => one.path !== "handbook/support/returns"),
      page("handbook/support/returns", "title: Returns\nextends: [data-tables]", "## By post\n"),
    ]);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const all = await terms((url) => alice.get(url));
    const refunds = handbookPage("support/refunds", "Refund an order");
    expect(all.terms).toEqual([
      { id: "rma", term: "RMA", aliases: [], short: "A return authorisation.", page: refunds },
    ]);
    expect(all.topics).toEqual([{ topic: "support-refunds", page: refunds }]);
    expect(all.attachments).toEqual([{ kind: "table", resource: "orders", page: refunds }]);
    expect(all.extensions).toEqual([
      { topic: "data-tables", page: handbookPage("support/returns", "Returns") },
    ]);
  });

  test("someone outside is given the public app's terms, and no page about a table they may not read", async () => {
    const guest = browser();
    const seen = JSON.parse((await guest.get(`/api/v1${ws()}/terms`)).body);
    expect(seen.terms.map((term: Any) => term.id)).toEqual(["rma"]);
    expect(seen.extensions).toHaveLength(1);
    // The handbook is open to anyone. The orders table is not, so nothing says a page is about it.
    expect(seen.attachments).toEqual([]);
    expect(seen.resources).toEqual([]);
    expect(JSON.stringify(seen)).not.toContain("orders");
  });

  test("nothing of an app the caller may not open: its terms, its topics, its pages", async () => {
    const deployed = await deploy([
      ...handbook(),
      page(
        "manual/secrets",
        "title: Staff secrets\ntopic: staff-secrets\nextends: [data-tables]\nterms:\n  - id: till-code\n    term: till code\n    short: The code that opens the till.",
      ),
    ]);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    // A member who reads the workspace sees both apps' terms.
    expect((await terms((url) => alice.get(url))).terms.map((term: Any) => term.id)).toEqual([
      "rma",
      "till-code",
    ]);
    // The staff manual is bound to nobody outside.
    const seen = JSON.parse((await browser().get(`/api/v1${ws()}/terms`)).body);
    expect(seen.terms.map((term: Any) => term.id)).toEqual(["rma"]);
    expect(seen.topics.map((one: Any) => one.topic)).toEqual(["support-refunds"]);
    expect(seen.extensions).toEqual([]);
    expect(JSON.stringify(seen)).not.toMatch(/till|secrets|manual/);
  });
});

describe("a picture kept beside the pages", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const sha256 = createHash("sha256").update(PNG).digest("hex");
  const pages = [
    manifest("app", "help", { title: "Shop handbook", docs: "handbook" }),
    manifest("binding", "bindings/help", {
      role: "portal_user",
      principal: { type: "anonymous" },
      resource: "help",
    }),
    page(
      "handbook/index",
      "title: Handbook",
      "![The till](img/till.png) ![Far away](https://example.com/far.png) ![Gone](img/gone.png)\n",
    ),
  ];
  const withPicture = (manifests: BundleManifest[]) => {
    const unsigned = {
      formatVersion: 4 as const,
      sdkVersion: "0.5.0",
      core: { min: "0.0.0", below: "99.0.0" },
      manifests,
      code: "export {};",
      assets: [
        { app: "help", path: "img/till.png", sha256, size: PNG.length, contentType: "image/png" },
      ],
    };
    return { ...unsigned, digest: bundleDigest(unsigned) } as Bundle;
  };

  test("a page that shows a picture that is not among the app's files is refused", async () => {
    const answer = await alice.post(`${ws()}/bundles`, withPicture(pages));
    expect(answer.status, JSON.stringify(answer.body)).toBe(400);
    expect(answer.body.errors).toEqual([
      {
        path: "handbook/index (doc)",
        message: 'line 5: The picture "img/gone.png" is not there: no file at img/gone.png.',
      },
    ]);
  });

  test("is one of the app's files, served to whoever may open the app, and a picture by address is left to its address", async () => {
    const fixed = pages.map((one) =>
      one.kind === "doc"
        ? page(
            "handbook/index",
            "title: Handbook",
            "![The till](img/till.png) ![Far away](https://example.com/far.png)\n",
          )
        : one,
    );
    const uploaded = await alice.upload(
      `${ws()}/bundle-assets/${sha256}`,
      PNG,
      "image/png",
      {},
      "PUT",
    );
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
    const stored = await alice.post(`${ws()}/bundles`, withPicture(fixed));
    expect(stored.status, JSON.stringify(stored.body)).toBe(201);
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: stored.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);

    const home = (await browser().get(HELP)).body;
    expect(home).toContain(`<img src="${HELP}img/till.png" alt="The till" loading="lazy"/>`);
    expect(home).toContain(
      '<img src="https://example.com/far.png" alt="Far away" loading="lazy"/>',
    );
    const picture = await t.app.inject({ url: `${HELP}img/till.png`, headers: { host: MAIN } });
    expect(picture.statusCode).toBe(200);
    expect(picture.headers["content-type"]).toBe("image/png");
    expect(picture.rawPayload.equals(PNG)).toBe(true);
  });
});

describe("a deploy with documentation that does not hold together", () => {
  const refused = async (manifests: BundleManifest[]) => {
    const answer = await alice.post(`${ws()}/bundles`, bundle(manifests));
    expect(answer.status, JSON.stringify(answer.body)).toBe(400);
    return (answer.body.errors as { path: string; message: string }[]).map(
      (one) => `${one.path}: ${one.message}`,
    );
  };
  const app = manifest("app", "help", { title: "Help", docs: "handbook" });

  test("is refused, naming each page and its line", async () => {
    expect(
      await refused([
        app,
        page(
          "handbook/index",
          "title: Home",
          "See [nothing](nowhere).\n\n::nope\n\n:term[x]{id=undefined-term}\n",
        ),
        page("handbook/untitled", "icon: book"),
        // Folders go as deep as they are written.
        page("handbook/a/b/c/deep", "title: Deep"),
      ]),
    ).toEqual([
      'handbook/index (doc): line 5: The link to "nowhere" leads nowhere: there is no page at nowhere.',
      expect.stringContaining('handbook/index (doc): line 7: There is no component named "nope".'),
      'handbook/index (doc): line 9: There is no term "undefined-term". A term is defined in the terms: of a page\'s frontmatter.',
      "handbook/untitled (doc): It needs a title.",
    ]);
  });

  test("is refused for a link no browser should follow, so it never reaches a reader", async () => {
    expect(
      await refused([
        app,
        page("handbook/index", "title: Home", "[a trap](javascript:alert(1))\n"),
      ]),
    ).toEqual([
      expect.stringContaining(
        'handbook/index (doc): line 5: The link to "javascript:alert(1)" cannot be followed.',
      ),
    ]);
  });

  test("is refused when a page is about something that is not there", async () => {
    expect(
      await refused([
        app,
        page(
          "handbook/index",
          "title: Home\nabout:\n  - table: no-such-table",
          ":term[x]{table=orders column=colour}\n",
        ),
        manifest("table", "orders", { columns: { status: { type: "text" } } }),
      ]),
    ).toEqual([
      "handbook/index (doc): This page is about the table no-such-table, and there is no such table.",
      "handbook/index (doc): line 7: There is no column colour on the table orders.",
    ]);
  });

  test("is refused when an app serves a folder inside another, two apps would serve the same page, or an app serves none", async () => {
    expect(
      await refused([
        app,
        manifest("app", "inner", { title: "Inner", docs: "handbook/support" }),
        manifest("app", "empty", { title: "Empty", docs: "nothing" }),
        page("handbook/index", "title: Home"),
        page("handbook/support/index", "title: Support"),
      ]),
    ).toEqual([
      'inner (app): serves "handbook/support", which is inside another folder. A docs app serves a top-level folder: move its pages to a folder of their own, or serve "handbook".',
      expect.stringContaining(
        'inner (app): its pages are under "handbook/support", and the app help serves "handbook".',
      ),
      'empty (app): serves the pages under "nothing", and there are none. A page is a Markdown file there, or a page made in the console.',
    ]);
  });

  test("is refused when a page takes one of the product's own terms, or two apps define the same one", async () => {
    const problems = await refused([
      app,
      manifest("app", "other", { title: "Other", docs: "manual" }),
      page(
        "handbook/index",
        "title: Home\nterms:\n  - id: workspace\n    term: workspace\n    short: Ours.\n  - id: rma\n    term: RMA\n    short: One.",
      ),
      page("manual/index", "title: Manual\nterms:\n  - id: rma\n    term: RMA\n    short: Two."),
    ]);
    expect(problems).toEqual([
      expect.stringContaining(
        'handbook/index (doc): The term "workspace" is one of the product\'s own',
      ),
      'other (app): the term "rma" is also defined in the docs app help. A term belongs to the workspace: define it once.',
    ]);
  });

  test("an app is one thing: files, an interface or documentation", async () => {
    const answer = await alice.post(
      `${ws()}/bundles`,
      bundle([
        manifest("app", "both", { title: "Both", docs: "handbook", interface: "screens/x" }),
      ]),
    );
    expect(answer.status).toBe(400);
  });

  test("a page that no app serves still has to read", async () => {
    expect(
      await refused([page("notes/loose", "title: Loose", ":::alert\nnever closed\n")]),
    ).toEqual(['notes/loose (doc): line 5: "alert" is never closed.']);
  });
});

describe("someone who writes documentation in the console, and is not a developer", () => {
  let dev: string;
  let wren: Client;
  let nell: Client;
  const devWs = () => `/tenants/${tenant}/workspaces/${dev}`;
  const text = (frontmatter: string, body = "Words.\n") => `---\n${frontmatter}\n---\n\n${body}`;
  const save = (who: Client, path: string, source: string, more: object = {}) =>
    who.put(`${devWs()}/drafts/${path}`, {
      kind: "doc",
      schemaVersion: 1,
      body: { source },
      ...more,
    });
  const member = async (email: string, role?: string) => {
    const made = await alice.post(`/tenants/${tenant}/members`, {
      email,
      name: email,
      password: PASSWORD,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    if (role) {
      const roles = (await alice.get(`/tenants/${tenant}/roles`)).body.items as Any[];
      const bound = await alice.post(`/tenants/${tenant}/bindings`, {
        principalType: "member",
        principalId: made.body.id,
        roleId: roles.find((one) => one.name === role).id,
      });
      expect(bound.status, JSON.stringify(bound.body)).toBe(201);
    }
    return t.signIn(email, PASSWORD);
  };

  test("they hold a role that writes pages and deploys nothing else", async () => {
    dev = (
      await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
    ).body.id;
    wren = await member("wren@acme.example", "doc_writer");
    nell = await member("nell@acme.example");
    // Something in the workspace that is not theirs.
    expect(
      (
        await alice.put(`${devWs()}/drafts/limits/batch`, {
          kind: "variable",
          schemaVersion: 1,
          body: { description: "A limit." },
        })
      ).status,
    ).toBe(200);
    expect((await wren.get(`${devWs()}/docs`)).body).toEqual({
      apps: [],
      pages: [],
      issues: [],
      tables: [],
    });
    // Someone bound to nothing is refused, by the name of what they lack.
    const refused = await nell.get(`${devWs()}/docs`);
    expect(refused.status).toBe(403);
    expect(refused.body.detail).toContain("doc:read");
  });

  test("they write pages and the app that serves them, and nothing else", async () => {
    const home = text("title: Handbook", "See [refunds](support/refunds).\n");
    expect((await save(wren, "guide/index", home)).status).toBe(200);
    expect(
      (await save(wren, "guide/support/refunds", text("title: Refunds\ntopic: guide-refunds")))
        .status,
    ).toBe(200);
    const app = await wren.put(`${devWs()}/drafts/guide-site`, {
      kind: "app",
      schemaVersion: 1,
      body: { title: "Guide", docs: "guide" },
    });
    expect(app.status, JSON.stringify(app.body)).toBe(200);
    // Not an app of another sort, not a table, and not over what is someone else's.
    expect(
      (
        await wren.put(`${devWs()}/drafts/site`, {
          kind: "app",
          schemaVersion: 1,
          body: { title: "Site", interface: "screens/x" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await wren.put(`${devWs()}/drafts/orders`, {
          kind: "table",
          schemaVersion: 1,
          body: { columns: { n: { type: "text" } } },
        })
      ).status,
    ).toBe(403);
    expect((await save(wren, "limits/batch", home)).status).toBe(403);
    expect((await wren.get(`${devWs()}/drafts`)).body.items.map((one: Any) => one.path)).toEqual([
      "guide/index",
      "guide-site",
      "guide/support/refunds",
    ]);

    const listed = (await wren.get(`${devWs()}/docs`)).body;
    expect(listed.apps).toMatchObject([
      { path: "guide-site", title: "Guide", docs: "guide", deployed: false },
    ]);
    expect(
      listed.pages.map((one: Any) => [one.path, one.title, one.app, one.url, one.state]),
    ).toEqual([
      ["guide/index", "Handbook", "guide-site", "", "new"],
      ["guide/support/refunds", "Refunds", "guide-site", "support/refunds", "new"],
    ]);
    expect(listed.pages[1].topic).toBe("guide-refunds");
  });

  test("a page that takes a name the product's help has is said to, as a deploy would refuse it", async () => {
    const clash = text(
      "title: Words\nterms:\n  - id: workspace\n    term: workspace\n    short: Ours.",
    );
    expect((await save(wren, "guide/words", clash)).status).toBe(200);
    const issues = (await wren.get(`${devWs()}/docs`)).body.issues;
    expect(issues).toEqual([
      expect.objectContaining({ app: "guide-site", path: "guide/words", code: "term_reserved" }),
    ]);
    // What the preview and the terms read agree with the list: the name is not a tenant's.
    expect((await wren.delete(`${devWs()}/drafts/guide/words`)).status).toBeLessThan(300);
    expect((await wren.get(`${devWs()}/docs`)).body.issues).toEqual([]);
  });

  test("the list says of each page what another page's links are checked against", async () => {
    const pages = (await wren.get(`${devWs()}/docs`)).body.pages;
    expect(pages[1]).toMatchObject({
      path: "guide/support/refunds",
      topic: "guide-refunds",
      headings: [],
      terms: [],
      file: null,
    });
    // Nothing is checked by asking the server: a check that saved nothing would have no
    // audit entry, and one for every keystroke would bury the changes that matter.
    expect(
      (await wren.post(`${devWs()}/docs/check`, { path: "guide/index", source: "x" })).status,
    ).toBe(404);
  });

  test("two people saving the same page: the second is told, and nothing is overwritten", async () => {
    const opened = (await wren.get(`${devWs()}/docs/page/guide/index`)).body;
    expect(opened.revision).toBe(1);
    expect(opened.source).toContain("See [refunds]");
    const first = await save(alice, "guide/index", text("title: Handbook", "Alice's.\n"), {
      revision: opened.revision,
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const second = await save(wren, "guide/index", text("title: Handbook", "Wren's.\n"), {
      revision: opened.revision,
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("draft_changed");
    // A save that says nothing of what it saw, over a draft that is there, is the same conflict.
    expect((await save(wren, "guide/index", text("title: Handbook", "Wren's.\n"))).status).toBe(
      409,
    );
    expect((await wren.get(`${devWs()}/docs/page/guide/index`)).body.source).toContain("Alice's.");
    // Reloaded, the save goes through.
    const again = (await wren.get(`${devWs()}/docs/page/guide/index`)).body;
    expect(
      (
        await save(
          wren,
          "guide/index",
          text("title: Handbook", "See [refunds](support/refunds).\n"),
          {
            revision: again.revision,
          },
        )
      ).status,
    ).toBe(200);
  });

  test("they deploy their pages by name, cannot deploy everything, and a page that does not hold is refused", async () => {
    expect((await wren.post(`${devWs()}/changes/deploy`, {})).status).toBe(403);
    expect(
      (await wren.post(`${devWs()}/changes/deploy`, { paths: ["guide/index", "limits/batch"] }))
        .status,
    ).toBe(403);
    // A link to a page that is not there stops the deploy, naming the page and the line.
    const broken = (await wren.get(`${devWs()}/docs/page/guide/support/refunds`)).body;
    await save(wren, "guide/support/refunds", text("title: Refunds", "[gone](gone)\n"), {
      revision: broken.revision,
    });
    const paths = ["guide/index", "guide/support/refunds", "guide-site"];
    const refused = await wren.post(`${devWs()}/changes/deploy`, { paths });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("guide/support/refunds (doc)");
    const fixed = (await wren.get(`${devWs()}/docs/page/guide/support/refunds`)).body;
    await save(wren, "guide/support/refunds", text("title: Refunds\ntopic: guide-refunds"), {
      revision: fixed.revision,
    });
    const deployed = await wren.post(`${devWs()}/changes/deploy`, { paths, message: "The guide" });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.applied.sort()).toEqual([...paths].sort());
    // What is not theirs is still a draft.
    expect((await alice.get(`${devWs()}/drafts`)).body.items.map((one: Any) => one.path)).toEqual([
      "limits/batch",
    ]);
    const listed = (await wren.get(`${devWs()}/docs`)).body;
    expect(listed.apps[0].deployed).toBe(true);
    expect(listed.pages.map((one: Any) => one.state)).toEqual(["deployed", "deployed"]);
    // Bound to nobody outside, it is served to members.
    const page = await t.app.inject({
      url: "/apps/acme/dev/guide-site/support/refunds",
      headers: {
        host: MAIN,
        cookie: Object.entries(wren.headers)
          .map(([, value]) => value)
          .join("; "),
      },
    });
    expect([200, 303]).toContain(page.statusCode);
  });

  test("a change is a draft over what is deployed, shown beside it, and found by the console's search", async () => {
    const opened = (await wren.get(`${devWs()}/docs/page/guide/index`)).body;
    expect(opened.revision).toBeNull();
    expect(opened.deployedSource).toBeNull();
    expect(
      (await save(wren, "guide/index", text("title: Handbook", "Parcels come back on Tuesdays.\n")))
        .status,
    ).toBe(200);
    const changed = (await wren.get(`${devWs()}/docs/page/guide/index`)).body;
    expect(changed.page.state).toBe("changed");
    expect(changed.source).toContain("Tuesdays");
    expect(changed.deployedSource).toContain("See [refunds]");
    const found = (await wren.get(`${devWs()}/docs/search?q=tuesdays`)).body.items;
    expect(found).toMatchObject([{ path: "guide/index", app: "guide-site", title: "Handbook" }]);
    expect((await nell.get(`${devWs()}/docs/search?q=tuesdays`)).status).toBe(403);
    expect((await wren.get(`${devWs()}/docs/page/guide/nothing`)).status).toBe(404);
  });

  test("the drafts are previewed at the app's own address, by its writers and by nobody else", async () => {
    const at = (who: Client | undefined, url: string) =>
      t.app.inject({ url, headers: { host: MAIN, ...(who ? who.headers : {}) } });
    // A page that is only a draft, beside the one changed in the test before.
    expect(
      (
        await save(
          wren,
          "guide/support/exchanges",
          text("title: Exchanges", "The other way round.\n"),
        )
      ).status,
    ).toBe(200);
    const home = await at(wren, "/apps/acme/dev/guide-site/_draft/");
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("Parcels come back on Tuesdays.");
    expect(home.body).toContain("A preview, with the workspace&#39;s drafts.");
    expect(home.body).toContain('<meta name="robots" content="noindex">');
    expect(home.headers["cache-control"]).toBe("no-store");
    // Its links stay inside the preview, and a page that is only a draft is there.
    expect(home.body).toContain('<a class="brand" href="/apps/acme/dev/guide-site/_draft/">');
    const fresh = await at(wren, "/apps/acme/dev/guide-site/_draft/support/exchanges");
    expect(fresh.statusCode).toBe(200);
    expect(fresh.body).toContain("<h1>Exchanges</h1>");
    expect(fresh.body).toContain('href="/apps/acme/dev/guide-site/_draft/support/refunds"');
    const typed = await at(wren, "/apps/acme/dev/guide-site/_draft/_search.json?q=tuesdays");
    expect(typed.headers["cache-control"]).toBe("no-store");
    // The draft of the home page is what is found: its address is the app's own.
    expect(JSON.parse(typed.body).pages.map((one: Any) => one.url)).toEqual([""]);
    expect((await at(wren, "/apps/acme/dev/guide-site/_draft/_search?q=tuesdays")).body).toContain(
      "1 page for",
    );
    // What is deployed is what the app itself still serves.
    const live = await at(wren, "/apps/acme/dev/guide-site/");
    expect(live.body).not.toContain("Tuesdays");
    expect((await at(wren, "/apps/acme/dev/guide-site/support/exchanges")).statusCode).toBe(404);
    // To a member who may not read the documentation, and to anyone not signed in, it is not there.
    expect((await at(nell, "/apps/acme/dev/guide-site/_draft/")).statusCode).toBe(404);
    expect((await at(undefined, "/apps/acme/dev/guide-site/_draft/")).statusCode).toBe(404);
    expect((await at(wren, "/apps/acme/dev/no-such-app/_draft/")).statusCode).toBe(404);
    // The list of pages says where the preview is.
    expect((await wren.get(`${devWs()}/docs`)).body.apps[0]).toMatchObject({
      url: `http://${MAIN}/apps/acme/dev/guide-site/`,
      preview: `http://${MAIN}/apps/acme/dev/guide-site/_draft/`,
    });
    expect((await wren.delete(`${devWs()}/drafts/guide/support/exchanges`)).status).toBe(204);
  });

  test("DOC-08 a draft preview, the terms and the search leave out what a deploy would refuse: a term the product owns", async () => {
    const at = (url: string) => t.app.inject({ url, headers: { host: MAIN, ...wren.headers } });
    expect(
      (
        await save(
          wren,
          "guide/clash",
          text(
            "title: Clash\nterms:\n  - id: workspace\n    term: workspace\n    short: Ours alone.",
            "::glossary\n",
          ),
        )
      ).status,
    ).toBe(200);
    const preview = await at("/apps/acme/dev/guide-site/_draft/clash");
    expect(preview.statusCode).toBe(200);
    expect(preview.body).not.toContain("Ours alone.");
    const known = (await wren.get(`${devWs()}/terms`)).body.terms as Any[];
    expect(known.map((one) => one.id)).not.toContain("workspace");
    expect((await wren.delete(`${devWs()}/drafts/guide/clash`)).status).toBe(204);
  });

  test("a change to the tree of pages is saved whole, or not at all", async () => {
    const batch = (who: Client, changes: object[]) =>
      who.post(`${devWs()}/drafts/batch`, { changes });
    // A folder, its own page and two pages in it, made at once.
    const made = await batch(wren, [
      { path: "notes/index", source: text("title: Notes\npages: [a]") },
      { path: "notes/a/index", source: text("title: A folder") },
      { path: "notes/a/one", source: text("title: One", "See [two](two).\n") },
      { path: "notes/a/two", source: text("title: Two") },
    ]);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect(made.body.paths).toEqual(["notes/index", "notes/a/index", "notes/a/one", "notes/a/two"]);
    const listed = async () =>
      new Map(
        ((await wren.get(`${devWs()}/docs`)).body.pages as Any[]).map((one) => [one.path, one]),
      );
    const now = await listed();
    expect(now.get("notes/a/one")).toMatchObject({ state: "new", revision: 1 });
    expect(now.get("notes/index").pages).toEqual(["a"]);

    // The folder renamed: every page in it moves, and its folder's list follows.
    const rename = [
      ...["index", "one", "two"].map((name) => ({
        path: `notes/a/${name}`,
        to: `notes/b/${name}`,
        source: now.get(`notes/a/${name}`).source,
        revision: now.get(`notes/a/${name}`).revision,
      })),
      {
        path: "notes/index",
        source: text("title: Notes\npages: [b]"),
        revision: now.get("notes/index").revision,
      },
    ];
    // A revision that is not the draft's now refuses every change, and makes none.
    const stale = await batch(wren, [...rename.slice(0, 3), { ...rename[3], revision: 99 }]);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("draft_changed");
    expect([...(await listed()).keys()].filter((path) => path.startsWith("notes/"))).toEqual([
      "notes/a/index",
      "notes/a/one",
      "notes/a/two",
      "notes/index",
    ]);
    const moved = await batch(wren, rename);
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const after = await listed();
    expect([...after.keys()].filter((path) => path.startsWith("notes/"))).toEqual([
      "notes/b/index",
      "notes/b/one",
      "notes/b/two",
      "notes/index",
    ]);
    expect(after.get("notes/index").pages).toEqual(["b"]);
    // Each change is audited as the save it is.
    const saved = await t.db
      .selectFrom("audit_entry")
      .select("target_id")
      .where("action", "=", "resource.draft_saved")
      .where("workspace_id", "=", dev)
      .where("target_id", "like", "notes/%")
      .execute();
    expect(saved.length).toBeGreaterThanOrEqual(8);

    // A page that was only ever a draft, removed, is set aside.
    const gone = await batch(wren, [
      { path: "notes/b/two", deleted: true, revision: after.get("notes/b/two").revision },
    ]);
    expect(gone.status, JSON.stringify(gone.body)).toBe(200);
    expect((await listed()).has("notes/b/two")).toBe(false);

    // Someone who writes documentation cannot slip anything else in with it.
    const table = await batch(wren, [
      {
        path: "notes/b/one",
        source: after.get("notes/b/one").source,
        revision: after.get("notes/b/one").revision,
      },
      { path: "votes", kind: "table", body: { columns: { page: { type: "text" } } } },
    ]);
    expect(table.status).toBe(403);
    expect((await batch(nell, [{ path: "notes/x", source: text("title: X") }])).status).toBe(403);
    // Nothing of these is left over for the deploys that follow.
    for (const path of ["notes/index", "notes/b/index", "notes/b/one"]) {
      expect((await wren.delete(`${devWs()}/drafts/${path}`)).status).toBe(204);
    }
  });

  test("the list names an app's draft and the tables, so that turning on feedback deploys whole", async () => {
    const before = (await alice.get(`${devWs()}/docs`)).body;
    expect(before.apps[0]).toMatchObject({
      path: "guide-site",
      key: "guide-site",
      deployed: true,
      drafted: false,
    });
    const turned = await alice.post(`${devWs()}/drafts/batch`, {
      changes: [
        { path: FEEDBACK_TABLE, kind: "table", schemaVersion: 1, body: { columns: answers } },
        {
          path: "guide-site",
          kind: "app",
          schemaVersion: 1,
          body: { title: "Guide", docs: "guide", feedback: { table: FEEDBACK_TABLE } },
        },
      ],
    });
    expect(turned.status, JSON.stringify(turned.body)).toBe(200);
    const listed = (await alice.get(`${devWs()}/docs`)).body;
    expect(listed.apps[0]).toMatchObject({
      deployed: true,
      drafted: true,
      feedback: FEEDBACK_TABLE,
    });
    expect(listed.tables).toEqual([{ path: FEEDBACK_TABLE, state: "new" }]);
    // Someone who reads only the documentation is told of the tables its apps name.
    expect((await wren.get(`${devWs()}/docs`)).body.tables).toEqual([
      { path: FEEDBACK_TABLE, state: "new" },
    ]);
    const deployed = await alice.post(`${devWs()}/changes/deploy`, {
      paths: ["guide-site", FEEDBACK_TABLE],
      message: "Documentation",
    });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const after = (await alice.get(`${devWs()}/docs`)).body;
    expect(after.apps[0].drafted).toBe(false);
    expect(after.tables).toEqual([{ path: FEEDBACK_TABLE, state: "deployed" }]);
  });

  test("they draft and deploy the workspace's table of answers, and no other table, nor that table with other columns", async () => {
    const table = (client: Client, path: string, columns: object, description = "Answers.") =>
      putSeen(client, `${devWs()}/drafts/${path}`, {
        kind: "table",
        schemaVersion: 1,
        body: { description, columns },
      });
    // Drafting: exactly that table, with exactly its columns.
    expect((await table(wren, "orders", { n: { type: "text" } })).status).toBe(403);
    expect((await table(wren, "guide-site-feedback", answers)).status).toBe(403);
    expect((await table(wren, FEEDBACK_TABLE, { ...answers, who: { type: "text" } })).status).toBe(
      403,
    );
    const { site_key: _gone, ...without } = answers;
    expect((await table(wren, FEEDBACK_TABLE, without)).status).toBe(403);
    const drafted = await table(wren, FEEDBACK_TABLE, answers, "What readers said.");
    expect(drafted.status, JSON.stringify(drafted.body)).toBe(200);
    // Deploying: the same check. A draft that someone else made with other columns is refused.
    expect((await table(alice, "orders", { n: { type: "text" } })).status).toBe(200);
    expect((await table(alice, "guide-site-extra", answers)).status).toBe(200);
    const deploy = (paths: string[]) => wren.post(`${devWs()}/changes/deploy`, { paths });
    expect((await deploy(["orders"])).status).toBe(403);
    expect((await deploy([FEEDBACK_TABLE, "orders"])).status).toBe(403);
    expect((await deploy(["guide-site-extra"])).status).toBe(403);
    expect((await table(alice, FEEDBACK_TABLE, { ...answers, who: { type: "text" } })).status).toBe(
      200,
    );
    expect((await deploy([FEEDBACK_TABLE])).status).toBe(403);
    expect((await table(alice, FEEDBACK_TABLE, answers, "What readers said.")).status).toBe(200);
    const done = await deploy([FEEDBACK_TABLE]);
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    expect(done.body.applied).toEqual([FEEDBACK_TABLE]);
    // What is not the table of answers is still a draft.
    const left = (await alice.get(`${devWs()}/drafts`)).body.items.map((one: Any) => one.path);
    expect(left).toEqual(expect.arrayContaining(["guide-site-extra", "limits/batch", "orders"]));
    expect(left).not.toContain(FEEDBACK_TABLE);
    for (const path of ["guide-site-extra", "orders"]) {
      expect((await alice.delete(`${devWs()}/drafts/${path}`)).status).toBe(204);
    }
  });

  test("a site is switched off and on with one setting of its app, which keeps its pages and what else the app says", async () => {
    const body = { title: "Guide", docs: "guide", feedback: { table: FEEDBACK_TABLE } };
    const off = await alice.put(`${devWs()}/drafts/guide-site`, {
      kind: "app",
      schemaVersion: 1,
      body: { ...body, published: false },
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    const listed = (await alice.get(`${devWs()}/docs`)).body;
    expect(listed.apps[0]).toMatchObject({
      published: false,
      drafted: true,
      body: { ...body, published: false },
    });
    expect(listed.pages.length).toBeGreaterThan(0);
    // Taking it back is discarding the draft: it is served as it was.
    expect((await alice.delete(`${devWs()}/drafts/guide-site`)).status).toBe(204);
    expect((await alice.get(`${devWs()}/docs`)).body.apps[0]).toMatchObject({
      published: true,
      drafted: false,
    });
  });

  test("a production workspace takes no page from the console", async () => {
    const answer = await alice.put(`${ws()}/drafts/handbook/extra`, {
      kind: "doc",
      schemaVersion: 1,
      body: { source: "---\ntitle: Extra\n---\n" },
    });
    expect(answer.status).toBe(409);
    expect(answer.body.code).toBe("production_workspace");
  });
});

describe("a docs app that asks its readers whether a page helped", () => {
  const votesTable = manifest("table", FEEDBACK_TABLE, { columns: answers });
  const asking = () =>
    handbook().map((one) =>
      one.kind === "app" && one.path === "help"
        ? { ...one, body: { ...(one.body as object), feedback: { table: FEEDBACK_TABLE } } }
        : one,
    );
  const votes = async () =>
    ((await alice.get(`${ws()}/rows/${FEEDBACK_TABLE}`)).body.items as Any[]).map((row) => [
      row.page,
      row.helpful,
    ]);
  const send = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
    t.app.inject({
      method: "POST",
      url: `${HELP}_feedback`,
      headers: {
        host: MAIN,
        origin: `http://${MAIN}`,
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      payload: new URLSearchParams(fields).toString(),
    });

  test("deploys only with a table that holds what an answer is", async () => {
    const without = await deploy(asking());
    expect(without.status).toBe(400);
    expect(JSON.stringify(without.body)).toContain("there is no such table");
    const deployed = await deploy([...asking(), votesTable]);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  });

  test("a page asks, and a form works with scripts off", async () => {
    const page = (await browser().get(`${HELP}support/refunds`)).body;
    expect(page).toContain(
      `<form class="feedback" id="feedback" method="post" action="${HELP}_feedback" data-feedback>`,
    );
    expect(page).toContain('<input type="hidden" name="page" value="support/refunds">');
  });

  test("an answer is a row of the table, kept once for each reader and page", async () => {
    const reader = browser();
    expect(
      (await reader.form(`${HELP}_feedback`, { page: "support/refunds", helpful: "yes" })).status,
    ).toBe(303);
    expect(await votes()).toEqual([["support/refunds", true]]);
    // The same reader again: thanked, and nothing more is kept.
    expect(
      (await reader.form(`${HELP}_feedback`, { page: "support/refunds", helpful: "no" })).status,
    ).toBe(303);
    expect(await votes()).toEqual([["support/refunds", true]]);
    expect((await reader.get(`${HELP}support/refunds`)).body).toContain("Thank you for saying.");
    // The script asks for an answer it can read.
    const fetched = await send(
      { page: "support/returns", helpful: "no" },
      { accept: "application/json" },
    );
    expect(fetched.statusCode).toBe(200);
    expect(JSON.parse(fetched.body)).toEqual({ kept: true });
    expect(fetched.headers["set-cookie"]).toContain("HttpOnly");
    expect(await votes()).toEqual([
      ["support/refunds", true],
      ["support/returns", false],
    ]);
    // Nothing of who the reader is is kept.
    const row = ((await alice.get(`${ws()}/rows/${FEEDBACK_TABLE}`)).body.items as Any[])[0];
    expect(Object.keys(row).sort()).toEqual([
      "at",
      "created_at",
      "helpful",
      "id",
      "page",
      "site",
      "site_key",
      "updated_at",
      "version",
    ]);
    expect(row).toMatchObject({ site_key: "help", site: "Shop handbook" });
  });

  test("is refused from another site, for a page that is not there, and kept from a robot", async () => {
    expect(
      (await send({ page: "faq", helpful: "yes" }, { origin: "https://elsewhere.example" }))
        .statusCode,
    ).toBe(403);
    expect((await send({ page: "nowhere", helpful: "yes" })).statusCode).toBe(400);
    expect((await send({ page: "faq", helpful: "maybe" })).statusCode).toBe(400);
    // A field no person sees, filled in.
    expect((await send({ page: "faq", helpful: "yes", website: "spam" })).statusCode).toBe(303);
    expect((await votes()).some(([page]) => page === "faq")).toBe(false);
  });

  test("two sites keep their answers in one table, and a renamed site's answers keep its key", async () => {
    const second = [
      page("guides/index", "title: Guides"),
      manifest("app", "guide", {
        title: "Guide",
        docs: "guides",
        feedback: { table: FEEDBACK_TABLE },
      }),
      manifest("binding", "bindings/guide", {
        role: "portal_user",
        principal: { type: "anonymous" },
        resource: "guide",
      }),
    ];
    const both = () => [...asking(), votesTable, ...second];
    expect((await deploy(both())).status).toBe(201);
    const GUIDE = "/apps/acme/main/guide/";
    const ask = (url: string, page: string) =>
      t.app.inject({
        method: "POST",
        url,
        headers: {
          host: MAIN,
          origin: `http://${MAIN}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        payload: new URLSearchParams({ page, helpful: "yes" }).toString(),
      });
    expect((await ask(`${HELP}_feedback`, "faq")).statusCode).toBe(303);
    const first = ((await alice.get(`${ws()}/rows/${FEEDBACK_TABLE}`)).body.items as Any[]).find(
      (row) => row.page === "faq",
    );
    expect(first).toMatchObject({ site_key: "help", site: "Shop handbook" });
    // The site is renamed, and given its old key. Its answers come under that key.
    const renamed = both().map((one) => {
      if (one.kind === "app" && one.path === "help") {
        return manifest("app", "help-site", one.body as object, { key: "help" });
      }
      return one.kind === "binding" && one.path === "bindings/help"
        ? manifest("binding", one.path, { ...(one.body as object), resource: "help-site" })
        : one;
    });
    expect((await deploy(renamed)).status).toBe(201);
    const NEW = "/apps/acme/main/help-site/";
    expect((await ask(`${NEW}_feedback`, "ops/closing/checklist")).statusCode).toBe(303);
    const rows = (await alice.get(`${ws()}/rows/${FEEDBACK_TABLE}`)).body.items as Any[];
    const kept = rows.find((row) => row.page === "ops/closing/checklist");
    expect(kept).toMatchObject({ site_key: "help", site: "Shop handbook" });
    expect(rows.some((row) => row.site_key === "help-site")).toBe(false);
    // The other site, in the same table, under its own key.
    expect((await ask(`${GUIDE}_feedback`, "index")).statusCode).toBe(303);
    const all = (await alice.get(`${ws()}/rows/${FEEDBACK_TABLE}`)).body.items as Any[];
    expect(new Set(all.map((row) => row.site_key))).toEqual(new Set(["help", "guide"]));
  });

  test("an app that does not ask, or is not documentation, takes no answer", async () => {
    // The staff manual asks nobody, and is for members: a guest is sent to sign in.
    expect(
      (
        await t.app.inject({
          method: "POST",
          url: "/apps/acme/main/staff/_feedback",
          headers: { host: MAIN, "content-type": "application/x-www-form-urlencoded" },
          payload: "page=index&helpful=yes",
        })
      ).statusCode,
    ).not.toBe(200);
    // Any other address of an app takes no POST.
    expect(
      (
        await t.app.inject({
          method: "POST",
          url: `${HELP}support/refunds`,
          headers: { host: MAIN, "content-type": "application/x-www-form-urlencoded" },
          payload: "x=1",
        })
      ).statusCode,
    ).toBe(405);
  });
});

describe("a docs site that is switched off", () => {
  const withHelp = (more: object) =>
    handbook().map((one) =>
      one.kind === "app" && one.path === "help"
        ? manifest("app", "help", { title: "Shop handbook", docs: "handbook", ...more })
        : one,
    );

  test("is not served, and the app that is not switched off still is", async () => {
    const deployed = await deploy(withHelp({ published: false }));
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect((await browser().get(HELP)).status).toBe(404);
    expect((await browser().get(`${HELP}support/refunds`)).status).toBe(404);
    // Its pages and its app are kept: the workspace still lists the app.
    const apps = (await alice.get(`${ws()}/apps`)).body.items;
    expect(apps.map((app: Any) => app.path)).toContain("help");
    // ... and says it is not published, so the console shows no live link (APP-08).
    expect(apps.find((app: Any) => app.path === "help").published).toBe(false);
    // The staff manual, which is not switched off, is still there for members.
    expect((await alice.get(`${ws()}/docs`)).body.apps.map((app: Any) => app.path)).toContain(
      "help",
    );
  });

  test("is served again at the next deploy once it is switched on", async () => {
    const deployed = await deploy(withHelp({ published: true }));
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(
      (await alice.get(`${ws()}/apps`)).body.items.find((app: Any) => app.path === "help")
        .published,
    ).toBe(true);
    expect((await browser().get(HELP)).status).toBe(200);
  });
});
