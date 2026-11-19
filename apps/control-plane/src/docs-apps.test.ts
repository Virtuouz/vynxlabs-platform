import { createHash } from "node:crypto";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
const MAIN = "localhost:8080";

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
    "title: Handbook\ndescription: How the shop runs.",
    "Start with [refunds](support/refunds).\n",
  ),
  page("handbook/faq", "title: Questions"),
  page("handbook/support/index", "title: Customer support\norder: 1"),
  page(
    "handbook/support/refunds",
    [
      "title: Refund an order",
      "description: Full and partial refunds.",
      "order: 2",
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
    "title: Returns\norder: 1",
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
    const response = await t.app.inject({
      method: "POST",
      url,
      headers: {
        host: MAIN,
        origin: `http://${MAIN}`,
        "content-type": "application/x-www-form-urlencoded",
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

beforeAll(async () => {
  t = await startTestApp();
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
});

const HELP = "/apps/acme/main/help/";

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
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).toContain("img-src 'self' https:");
    expect(home.body).toContain("<h1>Handbook</h1>");
    expect(home.body).toContain("<p>How the shop runs.</p>");
    expect(home.body).toContain("<title>Handbook · Shop handbook</title>");
    // A link is written from where its file is, and drawn as the app's own address.
    expect(home.body).toContain(`<a href="${HELP}support/refunds">refunds</a>`);
    // The one script is the platform's own, served as a file. Nothing is written into the page.
    expect(home.body.match(/<script/g)).toHaveLength(1);
    expect(home.body).toContain('<script src="/_platform/docs.js" defer></script>');
    expect(home.body).not.toMatch(/\son[a-z]+=|style="/);
  });

  test("its navigation comes from its folders", async () => {
    const refunds = (await browser().get(`${HELP}support/refunds`)).body;
    // Collections, by their order: support says 1, ops says nothing, and loose pages come last.
    const tabs = [...refunds.matchAll(/<ul class="collections">(.*?)<\/ul>/gs)][0]?.[1] ?? "";
    expect([...tabs.matchAll(/>([^<]+)<\/a>/g)].map((found) => found[1])).toEqual([
      "Customer support",
      "Ops",
      "Uncategorized",
    ]);
    expect(tabs).toContain(`<a href="${HELP}support" aria-current="true">Customer support</a>`);
    // The collection's pages, by order: returns says 1 and refunds 2.
    const side = [...refunds.matchAll(/<nav class="side"[^>]*>(.*?)<\/nav>/gs)][0]?.[1] ?? "";
    expect([...side.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((found) => found[1])).toEqual([
      "Returns",
      "Refund an order",
    ]);
    expect(side).toContain(
      `<a href="${HELP}support/refunds" aria-current="page">Refund an order</a>`,
    );
    // A folder under a collection is a group, named for its folder when it has no page of its own.
    const ops = (await browser().get(`${HELP}ops/closing/checklist`)).body;
    expect(ops).toContain('<p class="group">Closing</p>');
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
    expect(found.body).toContain(`<form action="${HELP}_search" method="get" role="search">`);
    const nothing = await browser().get(`${HELP}_search?q=${encodeURIComponent('"><script>x')}`);
    expect(nothing.body).toContain("Nothing here matches");
    expect(nothing.body).not.toContain("<script>x");
    // The other app's pages are not in this one's search.
    expect((await browser().get(`${HELP}_search?q=staff`)).body).toContain("Nothing here matches");
  });

  test("an address that names no page says so, in the app's own frame", async () => {
    const missing = await browser().get(`${HELP}support/nothing-here`);
    expect(missing.status).toBe(404);
    expect(missing.body).toContain("There is no page here");
    expect(missing.body).toContain(`<a class="name" href="${HELP}">`);
    // A page of another docs app is not reachable through this one.
    expect((await browser().get(`${HELP}../staff/`)).status).not.toBe(200);
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
        page("handbook/untitled", "order: 1"),
        page("handbook/a/b/c/too-deep", "title: Deep"),
      ]),
    ).toEqual([
      "handbook/a/b/c/too-deep (doc): This page is 3 folders down. A page is in a collection, or in a group inside a collection, and no deeper.",
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

  test("is refused when two apps would serve the same page, or an app serves none", async () => {
    expect(
      await refused([
        app,
        manifest("app", "inner", { title: "Inner", docs: "handbook/support" }),
        manifest("app", "empty", { title: "Empty", docs: "nothing" }),
        page("handbook/index", "title: Home"),
        page("handbook/support/index", "title: Support"),
      ]),
    ).toEqual([
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
