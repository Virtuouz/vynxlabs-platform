// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { forgetHelp } from "../../help/content.ts";
import { answer, show } from "../../testing.tsx";
import { DocEditor } from "./DocEditor.tsx";
import { Docs } from "./Docs.tsx";
import {
  type DocRow,
  type DocsApp,
  type DocsList,
  filterRows,
  indexOf,
  resolvers,
  rowsOf,
} from "./model.ts";

configure({ asyncUtilTimeout: 5000 });

const root = "/tenants/acme/workspaces/dev";
const link = "/t/acme/workspaces/dev";
const text = (frontmatter: string, body = "Words.\n") => `---\n${frontmatter}\n---\n\n${body}`;

const sources: Record<string, string> = {
  "handbook/index": text(
    "title: Handbook\npages: [support]",
    "Start with [refunds](support/refunds).\n",
  ),
  "handbook/support/index": text("title: Customer support\npages: [returns, refunds]"),
  "handbook/support/refunds": text(
    "title: Refund an order\ntopic: support-refunds\nterms:\n  - id: rma\n    term: RMA\n    short: A return authorisation.",
    "Ask for the :term[RMA]{id=rma}, then see [returns](returns#by-post).\n\nThe :term[status]{table=orders column=status} column says where it is.\n",
  ),
  "handbook/support/returns": text("title: Returns", "## By post\n\nParcels come back.\n"),
};

const page = (path: string, title: string, more: object = {}) => ({
  path,
  title,
  description: null,
  pages: null,
  topic: null,
  app: "help",
  url: path.replace(/^handbook\//, "").replace(/(^|\/)index$/, ""),
  state: "deployed" as const,
  file: null,
  headings: [],
  terms: [],
  source: sources[path] ?? text(`title: ${title}`),
  revision: null,
  ...more,
});

const list = (): DocsList => ({
  apps: [
    {
      path: "help",
      key: "help",
      title: "Shop handbook",
      published: true,
      body: { title: "Shop handbook", docs: "handbook" },
      docs: "handbook",
      deployed: true,
      drafted: false,
      url: "https://apps.example.test/apps/acme/dev/help/",
      preview: "https://apps.example.test/apps/acme/dev/help/_draft/",
    },
  ],
  pages: [
    page("handbook/index", "Handbook", { pages: ["support"] }),
    page("handbook/faq", "Questions"),
    page("handbook/support/index", "Customer support", { pages: ["returns", "refunds"] }),
    page("handbook/support/refunds", "Refund an order", {
      topic: "support-refunds",
      state: "changed",
      revision: 3,
      terms: [{ id: "rma", term: "RMA", aliases: [], short: "A return authorisation." }],
    }),
    page("handbook/support/returns", "Returns", {
      headings: ["by-post"],
      file: "docs/handbook/support/returns.md",
    }),
    page("handbook/ops/closing/checklist", "Closing checklist", { state: "new", revision: 1 }),
  ],
  tables: [],
});

let calls: {
  method: string;
  url: string;
  search: string;
  body: Record<string, unknown> | undefined;
}[];
let routes: Record<string, (body: unknown) => [number, unknown]>;

beforeEach(() => {
  calls = [];
  routes = {
    [`GET /api/v1${root}/docs`]: () => [200, list()],
    [`POST /api/v1${root}/drafts/batch`]: () => [200, { paths: [] }],
    [`GET /api/v1${root}/apps`]: () => [
      200,
      { items: [{ path: "help", url: "https://apps.example.test/apps/acme/dev/help/" }] },
    ],
    [`GET /api/v1${root}/terms`]: () => [
      200,
      {
        terms: [],
        resources: [
          {
            kind: "table",
            path: "orders",
            title: null,
            description: "What customers bought.",
            columns: [{ name: "status", description: "Where the order is in its life." }],
          },
        ],
      },
    ],
    "GET /help/manifest.json": () => [
      200,
      { version: "0.5.0", pages: [], topics: { "data-tables": "data/tables" }, terms: {} },
    ],
  };
  for (const [path, source] of Object.entries(sources)) {
    routes[`GET /api/v1${root}/docs/page/${path}`] = () => [
      200,
      {
        page: list().pages.find((one) => one.path === path),
        source,
        revision: path === "handbook/support/refunds" ? 3 : null,
        deployedSource:
          path === "handbook/support/refunds"
            ? text("title: Refund an order", "Ask for the receipt.\n")
            : null,
      },
    ];
  }
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const url = new URL(address, "http://console.test");
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: url.pathname, search: url.search, body });
    const handler = routes[`${method} ${url.pathname}`];
    const [status, answered] = handler
      ? handler(body)
      : [404, { status: 404, code: "not_found", detail: `No mock for ${method} ${url.pathname}` }];
    return new Response(answered === null ? null : JSON.stringify(answered), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  history.replaceState(null, "", `${link}/docs`);
});
afterEach(() => {
  cleanup();
  forgetHelp();
  vi.unstubAllGlobals();
});
const sent = (method: string) =>
  calls.filter((call) => call.method === method && !call.url.includes("/me/"));
const batches = () => sent("POST").filter((call) => call.url.endsWith("/drafts/batch"));

const docs = (path?: string, editable = true) =>
  show(
    <Docs
      root={root}
      link={link}
      tenantId="acme"
      workspaceId="dev"
      path={path}
      editable={editable}
    />,
  );

const labels = (rows: readonly DocRow[], depth = 0): string[] =>
  rows.flatMap((row) => [
    `${"  ".repeat(depth)}${row.title}`,
    ...labels(row.children ?? [], depth + 1),
  ]);

describe("the pages of a workspace", () => {
  test("are shown as their folders, to any depth: what a folder lists first, then the rest by title", () => {
    expect(labels(rowsOf(list()))).toEqual([
      "Handbook",
      "  Customer support",
      "    Returns",
      "    Refund an order",
      "  Ops",
      "    Closing",
      "      Closing checklist",
      "  Questions",
    ]);
    const handbook = rowsOf(list())[0];
    expect(handbook).toMatchObject({ kind: "folder", path: "handbook", site: { path: "help" } });
  });

  test("a filter keeps what it finds and the folders it is in", () => {
    expect(labels(filterRows(rowsOf(list()), "check"))).toEqual([
      "Handbook",
      "  Ops",
      "    Closing",
      "      Closing checklist",
    ]);
    expect(labels(filterRows(rowsOf(list()), "refunds.nothing"))).toEqual([]);
  });

  test("a page no site serves has no pages to link to", () => {
    const loose: DocsList = {
      apps: [],
      pages: [page("notes/todo", "To do", { app: null, url: null })],
      tables: [],
    };
    expect(labels(rowsOf(loose))).toEqual(["Notes", "  To do"]);
    expect(indexOf(loose, undefined)).toEqual([]);
  });

  test("a link is drawn as the console's address of the page it leads to, and a dead one as its words", () => {
    const drawn = resolvers({
      list: list(),
      page: { path: "handbook/support/refunds" },
      address: (path) => `${link}/docs/${path}`,
      product: undefined,
      described: [],
    });
    expect(drawn.link("returns#by-post")).toBe(`${link}/docs/handbook/support/returns#by-post`);
    expect(drawn.link("../")).toBe(`${link}/docs/handbook/index`);
    expect(drawn.link("topic:support-refunds")).toBe(`${link}/docs/handbook/support/refunds`);
    expect(drawn.link("nowhere")).toBeNull();
    expect(drawn.link("https://example.com")).toBe("https://example.com");
    // A term of this page says what it means. A column's is told only to who may know it.
    expect(drawn.term({ id: "rma" })).toEqual({ short: "A return authorisation." });
    expect(drawn.term({ table: "orders", column: "status" })).toBeNull();
  });
});

describe("the Documentation screen", () => {
  const tree = () => screen.findByRole("tree", { name: "Pages" });
  // A row is named by what it shows: its title first, then its file's name and its state.
  const row = async (name: string) =>
    within(await tree()).getByRole("treeitem", {
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`),
    });
  const dataTransfer = () => ({ setData: () => {}, effectAllowed: "", dropEffect: "" });

  test("shows the first page, drawn, with the tree of pages beside it", async () => {
    docs();
    expect(await screen.findByRole("heading", { level: 2, name: "Handbook" })).toBeTruthy();
    expect(await row("Refund an order")).toBeTruthy();
    const linked = await screen.findByRole("link", { name: "refunds" });
    expect(linked.getAttribute("href")).toBe(`${link}/docs/handbook/support/refunds`);
    fireEvent.click(linked);
    expect(location.pathname).toBe(`${link}/docs/handbook/support/refunds`);
    fireEvent.click(await row("Questions"));
    expect(location.pathname).toBe(`${link}/docs/handbook/faq`);
    // A folder with a page of its own opens it. One without is opened and closed.
    fireEvent.click(await row("Customer support"));
    expect(location.pathname).toBe(`${link}/docs/handbook/support/index`);
    fireEvent.click(await row("Ops"));
    expect(location.pathname).toBe(`${link}/docs/handbook/support/index`);
  });

  test("says when a page takes a name the product's own help has", async () => {
    docs();
    expect(await row("Handbook")).toBeTruthy();
    expect(screen.queryByText(/the product's own help has/)).toBeNull();
    cleanup();
    const clashing = {
      ...list(),
      issues: [
        {
          app: "help",
          path: "handbook/faq",
          code: "term_reserved",
          message: 'The term "workspace" is one of the product\'s own.',
        },
      ],
    };
    routes[`GET /api/v1${root}/docs`] = () => [200, clashing];
    docs();
    expect((await screen.findByText(/the product's own help has/)).textContent).toContain(
      "handbook/faq",
    );
  });

  test("a row says its file's name, under its title, and a draft says so right of it", async () => {
    docs();
    expect((await row("Refund an order")).textContent).toContain("refunds.md");
    expect((await row("Refund an order")).textContent).toContain("Draft · not deployed");
    expect((await row("Customer support")).textContent).toContain("support/ · index.md");
    expect((await row("Ops")).textContent).toContain("ops/");
    expect((await row("Questions")).textContent).not.toContain("not deployed");
    // A folder published as a site says so.
    expect((await row("Handbook")).textContent).toContain("Site");
  });

  test("a page says its state, its terms mean what its writer may know, and it leads to its editor", async () => {
    docs("handbook/support/refunds");
    expect(await screen.findByRole("heading", { level: 2, name: "Refund an order" })).toBeTruthy();
    expect(screen.getAllByText("Draft · not deployed").length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole("button", { name: "RMA" }));
    await screen.findByText("A return authorisation.");
    // What the column is for is told here, to someone who may read the table.
    fireEvent.click(screen.getByRole("button", { name: "status" }));
    await screen.findByText("Where the order is in its life.");
    expect(screen.getByRole("link", { name: "Open as readers see it" }).getAttribute("href")).toBe(
      "https://apps.example.test/apps/acme/dev/help/support/refunds",
    );
    // It has a draft: its writers can see it in the app, as it would be once deployed.
    expect(screen.getByRole("link", { name: "Preview with drafts" }).getAttribute("href")).toBe(
      "https://apps.example.test/apps/acme/dev/help/_draft/support/refunds",
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(location.pathname).toBe(`${link}/docs/edit/handbook/support/refunds`);
  });

  test("a page let go on a folder moves into it, as one batch of drafts with their revisions", async () => {
    docs("handbook/support/refunds");
    const dragged = await row("Refund an order");
    const onto = await row("Ops");
    expect(dragged.getAttribute("draggable")).toBe("true");
    // The repository's page cannot be picked up, and neither can a site's own folder.
    expect((await row("Returns")).getAttribute("draggable")).toBeNull();
    expect((await row("Handbook")).getAttribute("draggable")).toBeNull();
    fireEvent.dragStart(dragged, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(onto, { dataTransfer: dataTransfer() });
    expect(onto.textContent).toContain("Move into");
    fireEvent.drop(onto, { dataTransfer: dataTransfer() });
    await waitFor(() => expect(batches()).toHaveLength(1));
    const changes = batches()[0]?.body?.changes as {
      path: string;
      to?: string;
      source?: string;
      revision?: number;
    }[];
    // It moves with the revision of its draft, and its own links are written from where it now is.
    expect(changes.find((one) => one.path === "handbook/support/refunds")).toEqual({
      path: "handbook/support/refunds",
      to: "handbook/ops/refunds",
      source: (sources["handbook/support/refunds"] as string).replace(
        "(returns#by-post)",
        "(../support/returns#by-post)",
      ),
      revision: 3,
    });
    // The folder it left no longer lists it, and a link to it follows it.
    expect(changes.find((one) => one.path === "handbook/support/index")?.source).toBe(
      text("title: Customer support\npages:\n  - returns"),
    );
    expect(changes.find((one) => one.path === "handbook/index")?.source).toContain(
      "[refunds](ops/refunds)",
    );
    // It was the page being read, so the reader follows it.
    await waitFor(() => expect(location.pathname).toBe(`${link}/docs/handbook/ops/refunds`));
    // And it can be taken back.
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(batches()).toHaveLength(2));
    expect(batches()[1]?.body?.changes).toContainEqual({
      path: "handbook/ops/refunds",
      to: "handbook/support/refunds",
      source: sources["handbook/support/refunds"],
    });
    expect(batches()[1]?.body?.changes).toContainEqual({
      path: "handbook/index",
      source: sources["handbook/index"],
    });
    // The address goes back with the page, so the reader is not left on a page that is not there.
    await waitFor(() => expect(location.pathname).toBe(`${link}/docs/handbook/support/refunds`));
  });

  test("a page let go between two others is put there, and its folder's list says so", async () => {
    docs();
    const dragged = await row("Questions");
    fireEvent.dragStart(dragged, { dataTransfer: dataTransfer() });
    // Over a page, the bottom half means after it: with no size to measure, the middle is after.
    const onto = await row("Refund an order");
    fireEvent.dragOver(onto, { dataTransfer: dataTransfer() });
    fireEvent.drop(onto, { dataTransfer: dataTransfer() });
    await waitFor(() => expect(batches()).toHaveLength(1));
    const changes = batches()[0]?.body?.changes as { path: string; to?: string; source?: string }[];
    expect(changes.find((one) => one.path === "handbook/faq")?.to).toBe("handbook/support/faq");
    expect(changes.find((one) => one.path === "handbook/support/index")?.source).toContain(
      "pages:\n  - returns\n  - refunds\n  - faq",
    );
  });

  test("a row is renamed in place, its title and its file's name together", async () => {
    docs();
    const refunds = await row("Refund an order");
    refunds.focus();
    fireEvent.keyDown(refunds, { key: "F2" });
    const title = await screen.findByLabelText("Page title");
    const name = screen.getByLabelText("File name") as HTMLInputElement;
    expect(name.value).toBe("refunds");
    fireEvent.change(title, { target: { value: "Refund or exchange an order" } });
    fireEvent.change(name, { target: { value: "Refund Or Exchange" } });
    // A name that is not written as a file's says how it would be.
    fireEvent.click(await screen.findByRole("button", { name: "Use refund-or-exchange" }));
    expect(name.value).toBe("refund-or-exchange");
    expect(screen.getByText(/The old address leads to the new one for 90 days/)).toBeTruthy();
    fireEvent.keyDown(name, { key: "Enter" });
    await waitFor(() => expect(batches()).toHaveLength(1));
    const changes = batches()[0]?.body?.changes as { path: string; to?: string; source?: string }[];
    expect(changes.find((one) => one.path === "handbook/support/refunds")).toMatchObject({
      to: "handbook/support/refund-or-exchange",
      revision: 3,
    });
    expect(changes.find((one) => one.path === "handbook/support/refunds")?.source).toContain(
      "title: Refund or exchange an order",
    );
    // Its folder lists it by its new name.
    expect(changes.find((one) => one.path === "handbook/support/index")?.source).toContain(
      "  - refund-or-exchange",
    );
  });

  test("F2 renames the page that is open when focus is not in the tree", async () => {
    docs("handbook/support/refunds");
    await screen.findByRole("heading", { name: "Refund an order" });
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "F2" });
    expect(await screen.findByLabelText("Page title")).toBeTruthy();
    expect((screen.getByLabelText("File name") as HTMLInputElement).value).toBe("refunds");
  });

  test("Escape leaves a row as it was", async () => {
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "Rename Questions" }));
    const title = await screen.findByLabelText("Page title");
    fireEvent.keyDown(title, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Page title")).toBeNull());
    expect(batches()).toHaveLength(0);
  });

  test("a folder is made in place, as its own page with nothing written in it", async () => {
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "New folder" }));
    const title = await screen.findByLabelText("Folder title");
    fireEvent.change(title, { target: { value: "Staff guide" } });
    // The name is made from the title until it is typed in.
    expect((screen.getByLabelText("File name") as HTMLInputElement).value).toBe("staff-guide");
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(batches()).toHaveLength(1));
    expect(batches()[0]?.body).toEqual({
      changes: [{ path: "staff-guide/index", source: "---\ntitle: Staff guide\n---\n" }],
    });
  });

  test("someone who holds doc:write alone, as a doc writer does, is offered the page menus", async () => {
    routes[`GET /api/v1${root}/allowed`] = () => [200, { allowed: ["doc:write"] }];
    docs();
    expect(await screen.findByRole("button", { name: "More for Customer support" })).toBeTruthy();
    expect(screen.queryByText(/not change it/)).toBeNull();
  });

  test("a folder's menu makes pages and folders in it, and deletes it with everything in it", async () => {
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Customer support" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /New folder here/ }));
    const title = await screen.findByLabelText("Folder title");
    fireEvent.change(title, { target: { value: "Disputes" } });
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(batches()).toHaveLength(1));
    expect(batches()[0]?.body?.changes).toEqual([
      { path: "handbook/support/disputes/index", source: "---\ntitle: Disputes\n---\n" },
    ]);

    fireEvent.click(await screen.findByRole("button", { name: "More for Ops" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete folder/ }));
    expect(await answer("Delete", "ops")).toContain("Its 1 page goes with it");
    await waitFor(() => expect(batches()).toHaveLength(2));
    expect(batches()[1]?.body?.changes).toEqual([
      { path: "handbook/ops/closing/checklist", deleted: true, revision: 1 },
    ]);
  });

  test("a top-level folder is published as a site, as an app's draft", async () => {
    routes[`GET /api/v1${root}/docs`] = () => [
      200,
      {
        apps: [],
        pages: [page("guide/index", "Staff guide", { app: null, url: null })],
        tables: [],
      },
    ];
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Staff guide" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Publish as a site/ }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText(/^Address/) as HTMLInputElement).value).toBe(
      "guide-site",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(batches()).toHaveLength(1));
    expect(batches()[0]?.body).toEqual({
      changes: [
        {
          path: "guide-site",
          kind: "app",
          schemaVersion: 1,
          create: true,
          body: { title: "Staff guide", docs: "guide" },
        },
      ],
    });
    // Publishing offers Undo, which takes the app's draft away.
    routes[`DELETE /api/v1${root}/drafts/guide-site`] = () => [204, null];
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(sent("DELETE").map((call) => call.url)).toContain(`/api/v1${root}/drafts/guide-site`),
    );
  });

  test("page feedback is turned on for a site, saying first what it makes", async () => {
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Handbook" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Turn on page feedback/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(
      "A table, docs-feedback, that keeps the answers of every site",
    );
    expect(dialog.textContent).toContain("Nothing about who answered is kept");
    expect(dialog.textContent).toContain("Both are drafts until you deploy");
    fireEvent.click(within(dialog).getByRole("button", { name: "Make the table and turn it on" }));
    await waitFor(() => expect(batches()).toHaveLength(1));
    const changes = batches()[0]?.body?.changes as {
      path: string;
      kind: string;
      body: Record<string, unknown>;
    }[];
    expect(changes.map((one) => [one.path, one.kind])).toEqual([
      ["docs-feedback", "table"],
      ["help", "app"],
    ]);
    expect(Object.keys(changes[0]?.body.columns as object)).toEqual([
      "site_key",
      "site",
      "page",
      "helpful",
      "version",
      "at",
    ]);
    expect(changes[0]?.body.columns).toMatchObject({
      site_key: { type: "text", required: true },
      page: { type: "text", required: true },
      helpful: { type: "boolean", required: true },
      at: { type: "timestamp" },
    });
    expect(changes[1]?.body).toEqual({
      title: "Shop handbook",
      docs: "handbook",
      feedback: { table: "docs-feedback" },
    });
  });

  test("when the workspace has the table, turning feedback on changes only the site, and says so", async () => {
    routes[`GET /api/v1${root}/docs`] = () => [
      200,
      { ...list(), tables: [{ path: "docs-feedback", state: "deployed" }] },
    ];
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Handbook" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Turn on page feedback/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("already keeps the answers of this workspace's sites");
    expect(dialog.textContent).toContain("only the site changes");
    expect(dialog.textContent).not.toContain("Make the table");
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn it on" }));
    await waitFor(() => expect(batches()).toHaveLength(1));
    const changes = batches()[0]?.body?.changes as { path: string; kind: string }[];
    expect(changes.map((one) => [one.path, one.kind])).toEqual([["help", "app"]]);
    expect(batches()[0]?.body?.changes).toEqual([
      {
        path: "help",
        kind: "app",
        schemaVersion: 1,
        body: {
          title: "Shop handbook",
          docs: "handbook",
          feedback: { table: "docs-feedback" },
        },
      },
    ]);
  });

  test("turning on feedback, then deploying, sends the table with the site, and the count says so", async () => {
    routes[`POST /api/v1${root}/changes/deploy`] = () => [201, { applied: [] }];
    let turnedOn = false;
    routes[`POST /api/v1${root}/drafts/batch`] = () => {
      turnedOn = true;
      return [200, { paths: [] }];
    };
    routes[`GET /api/v1${root}/docs`] = () => {
      const now = list();
      if (turnedOn) {
        now.apps[0] = { ...(now.apps[0] as DocsApp), drafted: true, feedback: "docs-feedback" };
        now.tables = [
          { path: "orders", state: "deployed" },
          { path: "docs-feedback", state: "new" },
        ];
      }
      return [200, now];
    };
    docs();
    expect(await screen.findByRole("button", { name: "Deploy 2 changes" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "More for Handbook" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Turn on page feedback/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Make the table and turn it on" }));
    // Two pages, the site and its table.
    fireEvent.click(await screen.findByRole("button", { name: "Deploy 4 changes" }));
    expect(await answer("Deploy")).toContain("the table docs-feedback");
    await waitFor(() =>
      expect(sent("POST").filter((one) => one.url.endsWith("/deploy"))).toHaveLength(1),
    );
    expect(sent("POST").find((one) => one.url.endsWith("/deploy"))?.body).toEqual({
      paths: [
        "handbook/support/refunds",
        "handbook/ops/closing/checklist",
        "help",
        "docs-feedback",
      ],
      message: "Documentation",
    });
  });

  test("feedback is not turned on over a page or app that has the table's path", async () => {
    routes[`GET /api/v1${root}/docs`] = () => {
      const now = list();
      now.pages.push(page("docs-feedback", "In the way"));
      return [200, now];
    };
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Handbook" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Turn on page feedback/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Something already has the path docs-feedback.");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Make the table and turn it on",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("a page of a site that asks says what its readers said", async () => {
    const asking = list();
    (asking.apps[0] as { feedback?: string }).feedback = "docs-feedback";
    routes[`GET /api/v1${root}/docs`] = () => [200, asking];
    routes[`GET /api/v1${root}/aggregate/docs-feedback`] = () => [
      200,
      {
        items: [
          { by: { page: "support/refunds", helpful: true }, values: { count: 7 } },
          { by: { page: "support/refunds", helpful: false }, values: { count: 2 } },
          { by: { page: "faq", helpful: true }, values: { count: 40 } },
        ],
        truncated: false,
      },
    ];
    docs("handbook/support/refunds");
    expect(await screen.findByText("7 found it helpful · 2 didn't")).toBeTruthy();
    // The table is the whole workspace's: the answers are asked for by this site's key.
    const asked = sent("GET").find((call) => call.url.includes("/aggregate/docs-feedback"));
    expect(decodeURIComponent(asked?.search ?? "")).toContain(
      '"column":"site_key","op":"eq","value":"help"',
    );
    // A site that asks already is not offered it again.
    fireEvent.click(await screen.findByRole("button", { name: "More for Handbook" }));
    await screen.findByRole("menuitem", { name: /Rename/ });
    expect(screen.queryByRole("menuitem", { name: /Turn on page feedback/ })).toBeNull();
  });

  test("where pages cannot be changed, nothing can be dragged, renamed or made", async () => {
    docs("handbook/faq", false);
    expect((await row("Questions")).getAttribute("draggable")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename Questions" })).toBeNull();
    for (const name of ["Edit", /^New page/, /^New folder/, /^Deploy/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  test("a page kept in the repository is read here and changed there", async () => {
    docs("handbook/support/returns");
    await screen.findByRole("heading", { level: 2, name: "Returns" });
    // Deployed, with no draft: there is nothing to preview that its readers do not see.
    expect(screen.queryByRole("link", { name: "Preview with drafts" })).toBeNull();
    expect(screen.getByText(/This page lives in the repository/).textContent).toContain(
      "docs/handbook/support/returns.md",
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename Returns" })).toBeNull();
  });

  test("what is not deployed is deployed by name, and nothing else with it", async () => {
    routes[`POST /api/v1${root}/changes/deploy`] = () => [201, { applied: [] }];
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "Deploy 2 changes" }));
    expect(await answer("Deploy")).toContain("Nothing but documentation is deployed");
    await waitFor(() => expect(sent("POST")).toHaveLength(1));
    expect(sent("POST")[0]?.body).toEqual({
      paths: ["handbook/support/refunds", "handbook/ops/closing/checklist"],
      message: "Documentation",
    });
  });

  test("a folder's own page with nothing written in it lists what is in the folder", async () => {
    const empty = list();
    const index = empty.pages.find((one) => one.path === "handbook/support/index");
    if (index) index.source = "---\ntitle: Customer support\npages: [returns, refunds]\n---\n";
    routes[`GET /api/v1${root}/docs`] = () => [200, empty];
    docs("handbook/support/index");
    await screen.findByRole("heading", { level: 2, name: "Customer support" });
    const listed = document.querySelector(".vd-pages");
    expect(
      [...(listed?.querySelectorAll(".vd-pages-title") ?? [])].map((one) => one.textContent),
    ).toEqual(["Returns", "Refund an order"]);
  });
});

describe("the page editor", () => {
  const editor = (path?: string) =>
    show(<DocEditor root={root} link={link} tenantId="acme" workspaceId="dev" path={path} />);
  const source = async () =>
    (await screen.findByLabelText("Source of handbook/support/refunds")) as HTMLTextAreaElement;
  const preview = () => screen.getByRole("region", { name: "The page as it will be served" });

  test("shows the page beside its source, drawn as it is served", async () => {
    editor("handbook/support/refunds");
    expect((await source()).value).toContain("Ask for the :term[RMA]");
    await waitFor(() =>
      expect(within(preview()).getAllByRole("heading", { level: 2 })[0]?.textContent).toBe(
        "Refund an order",
      ),
    );
    // As served: the term is the served page's own markup, not the console's popover.
    expect(preview().querySelector(".vd-term .vd-term-tip")?.textContent).toBe(
      "A return authorisation.",
    );
    expect(within(preview()).getByRole("link", { name: "returns" }).getAttribute("href")).toBe(
      `${link}/docs/handbook/support/returns#by-post`,
    );
    expect(await screen.findByText("This page would deploy as it is.")).toBeTruthy();
  });

  test("a draft is shown beside what is deployed, and leads to its preview in the app", async () => {
    editor("handbook/support/refunds");
    await source();
    expect(screen.getByRole("link", { name: "Preview in the app" }).getAttribute("href")).toBe(
      "https://apps.example.test/apps/acme/dev/help/_draft/support/refunds",
    );
    expect(screen.queryByRole("region", { name: "What changes" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Compare with deployed" }));
    const changes = await screen.findByRole("region", { name: "What changes" });
    expect(changes.textContent).toContain("Deployed");
    expect(changes.textContent).toContain("Ask for the receipt.");
    expect(changes.textContent).toContain("Ask for the :term[RMA]");
    fireEvent.click(screen.getByRole("button", { name: "Hide what is deployed" }));
    expect(screen.queryByRole("region", { name: "What changes" })).toBeNull();
  });

  test("what is wrong is said as it is typed, by line, and the preview follows", async () => {
    editor("handbook/support/refunds");
    const box = await source();
    fireEvent.change(box, {
      target: {
        value: text(
          "title: Refunds, rewritten",
          "[gone](nowhere)\n\n[far](returns#no-such-heading)\n\n::nope\n\n:term[x]{id=undefined}\n",
        ),
      },
    });
    const problems = await screen.findByRole("region", { name: "Problems" });
    await within(problems).findByText("4 problems");
    expect(
      within(problems)
        .getAllByRole("button")
        .map((button) => button.textContent?.slice(0, 40)),
    ).toEqual([
      'Line 5The link to "nowhere" leads nowher',
      'Line 7The link to "returns#no-such-headi',
      'Line 9There is no component named "nope"',
      'Line 11There is no term "undefined". A t',
    ]);
    await waitFor(() =>
      expect(within(preview()).getAllByRole("heading", { level: 2 })[0]?.textContent).toBe(
        "Refunds, rewritten",
      ),
    );
    // A link that leads nowhere is its words in the preview, as it would be for a reader.
    expect(within(preview()).queryByRole("link", { name: "gone" })).toBeNull();
  });

  test("saving says which draft was opened, and a save over someone else's is refused and loses nothing", async () => {
    let attempts = 0;
    routes[`PUT /api/v1${root}/drafts/handbook/support/refunds`] = () => {
      attempts++;
      return attempts === 1
        ? [200, { revision: 4 }]
        : [409, { status: 409, code: "draft_changed", detail: "Someone else saved this page." }];
    };
    editor("handbook/support/refunds");
    const box = await source();
    const mine = text("title: Refund an order", "Mine.\n");
    fireEvent.change(box, { target: { value: mine } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]?.body).toEqual({
      kind: "doc",
      schemaVersion: 1,
      title: "Refund an order",
      body: { source: mine },
      revision: 3,
    });
    const again = text("title: Refund an order", "Mine, again.\n");
    fireEvent.change(box, { target: { value: again } });
    fireEvent.click(await screen.findByRole("button", { name: "Save draft" }));
    await screen.findByText(/Someone else saved this page after you opened it/);
    // The next save says the revision the first one gave.
    expect(sent("PUT")[1]?.body?.revision).toBe(4);
    expect(box.value).toBe(again);
  });

  test("⌘S right after typing saves what was typed, and typing during a save is saved after it", async () => {
    let attempts = 0;
    routes[`PUT /api/v1${root}/drafts/handbook/support/refunds`] = () => {
      attempts++;
      return [200, { revision: 3 + attempts }];
    };
    editor("handbook/support/refunds");
    const box = await source();
    const first = text("title: Refund an order", "Typed just now.\n");
    fireEvent.change(box, { target: { value: first } });
    fireEvent.keyDown(box, { key: "s", ctrlKey: true });
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]?.body).toMatchObject({ body: { source: first }, revision: 3 });
    // A second save is of the newest text, on the revision the first one gave.
    const second = text("title: Refund an order", "Typed after.\n");
    fireEvent.change(box, { target: { value: second } });
    fireEvent.keyDown(box, { key: "s", ctrlKey: true });
    await waitFor(() => expect(sent("PUT")).toHaveLength(2));
    expect(sent("PUT")[1]?.body).toMatchObject({ body: { source: second }, revision: 4 });
  });

  test("the page's details are a form that writes its source, and leaves the rest as it was", async () => {
    editor("handbook/support/refunds");
    const box = await source();
    expect(screen.queryByRole("region", { name: "Page details" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Page details" }));
    const form = within(screen.getByRole("region", { name: "Page details" }));
    expect((form.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Refund an order");
    expect((form.getByLabelText(/^Topic/) as HTMLInputElement).value).toBe("support-refunds");
    expect((form.getByLabelText("What it means") as HTMLInputElement).value).toBe(
      "A return authorisation.",
    );

    fireEvent.change(form.getByLabelText(/^Title/), { target: { value: "Refunds" } });
    fireEvent.change(form.getByLabelText(/^Description/), {
      target: { value: "Full and partial." },
    });
    await waitFor(() => expect(box.value).toContain("title: Refunds\n"));
    expect(box.value).toContain("description: Full and partial.\n");
    // What the form did not touch is as it was written, the page under it too.
    expect(box.value).toContain("  - id: rma\n    term: RMA\n    short: A return authorisation.");
    expect(box.value).toContain("Ask for the :term[RMA]{id=rma}");

    fireEvent.click(form.getByRole("button", { name: "Resource" }));
    fireEvent.change(form.getByLabelText("Path"), { target: { value: "orders" } });
    await waitFor(() => expect(box.value).toContain("about:\n  - table: orders\n"));
    fireEvent.change(form.getByLabelText(/^Add this page's notes to/), {
      target: { value: "data-tables" },
    });
    await waitFor(() => expect(box.value).toContain("extends:\n  - data-tables\n"));
    fireEvent.click(form.getByRole("button", { name: "Remove RMA" }));
    await waitFor(() => expect(box.value).not.toContain("terms:"));
    // And it is still a page that would deploy.
    expect(await screen.findByText("This page would deploy as it is.")).toBeTruthy();
  });

  test("details that cannot be read are mended in the source, not by the form", async () => {
    editor("handbook/support/refunds");
    const box = await source();
    fireEvent.change(box, { target: { value: "---\ntitle: [unclosed\n---\n\nWords.\n" } });
    fireEvent.click(screen.getByRole("tab", { name: "Page details" }));
    expect(
      within(screen.getByRole("region", { name: "Page details" })).getByText(/cannot be read/),
    ).toBeTruthy();
  });

  test("what is typed and what the form beside it writes are undone and redone alike", async () => {
    editor("handbook/support/refunds");
    const box = await source();
    const opened = box.value;
    const undo = () => screen.getByRole("button", { name: /^Undo/ });
    const redo = () => screen.getByRole("button", { name: /^Redo/ });
    expect((undo() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: `${opened}More.\n` } });
    fireEvent.click(screen.getByRole("tab", { name: "Page details" }));
    const form = within(screen.getByRole("region", { name: "Page details" }));
    fireEvent.change(form.getByLabelText(/^Description/), { target: { value: "Money back." } });
    await waitFor(() => expect(box.value).toContain("description: Money back."));
    fireEvent.click(undo());
    await waitFor(() => expect(box.value).not.toContain("description: Money back."));
    expect(box.value).toContain("More.");
    fireEvent.click(undo());
    await waitFor(() => expect(box.value).toBe(opened));
    fireEvent.click(redo());
    await waitFor(() => expect(box.value).toContain("More."));
  });

  test("a component is inserted where the cursor is, at the depth of what it is in", async () => {
    editor("handbook/support/refunds");
    const box = await source();
    const at = box.value.indexOf("The :term[status]");
    box.focus();
    box.setSelectionRange(at, at);
    fireEvent.select(box);
    fireEvent.click(screen.getByRole("button", { name: /^Insert/ }));
    const find = await screen.findByLabelText("Find a component");
    fireEvent.change(find, { target: { value: "callout" } });
    fireEvent.keyDown(find, { key: "Enter" });
    await waitFor(() => expect(box.value).toContain(":::alert[Title]{type=info}"));
    // After the words on the line, on lines of their own.
    expect(box.value).toContain("says where it is.\n\n:::alert[Title]{type=info}\n\n:::\n");
  });

  test("the title is changed where it is shown, and the file's name beside its folder", async () => {
    routes[`POST /api/v1${root}/drafts/batch`] = () => [200, { paths: [] }];
    editor("handbook/support/refunds");
    const box = await source();
    fireEvent.click(screen.getByRole("button", { name: "Change the title" }));
    const title = screen.getByLabelText("Page title");
    fireEvent.change(title, { target: { value: "Refund or exchange" } });
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(box.value).toContain("title: Refund or exchange\n"));
    const name = screen.getByLabelText("File name") as HTMLInputElement;
    expect(name.value).toBe("refunds");
    fireEvent.change(name, { target: { value: "refund-or-exchange" } });
    fireEvent.keyDown(name, { key: "Enter" });
    await waitFor(() => expect(batches()).toHaveLength(1));
    const changes = batches()[0]?.body?.changes as { path: string; to?: string; source?: string }[];
    // What is typed goes with it: the page moves as it is now.
    expect(changes.find((one) => one.path === "handbook/support/refunds")).toMatchObject({
      to: "handbook/support/refund-or-exchange",
      revision: 3,
    });
    expect(changes.find((one) => one.path === "handbook/support/refunds")?.source).toContain(
      "title: Refund or exchange",
    );
    await waitFor(() =>
      expect(location.pathname).toBe(`${link}/docs/edit/handbook/support/refund-or-exchange`),
    );
  });

  test("a new page is given a path a docs app serves, and starts from its title", async () => {
    history.replaceState(
      null,
      "",
      `${link}/docs/new?at=handbook/support/exchanges&title=Exchanges`,
    );
    routes[`PUT /api/v1${root}/drafts/handbook/support/exchanges`] = () => [200, { revision: 1 }];
    editor();
    const box = (await screen.findByLabelText(
      "Source of handbook/support/exchanges",
    )) as HTMLTextAreaElement;
    expect(box.value).toContain('title: "Exchanges"');
    const path = screen.getByLabelText(/^Path/) as HTMLInputElement;
    fireEvent.change(path, { target: { value: "handbook/faq" } });
    expect(await screen.findByText("There is a page at that path already.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(path, { target: { value: "handbook/support/exchanges" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    // A page that has never been saved has no revision to say.
    expect(sent("PUT")[0]?.body).not.toHaveProperty("revision");
    await waitFor(() =>
      expect(location.pathname).toBe(`${link}/docs/edit/handbook/support/exchanges`),
    );
  });
});

describe("what is taken out can be brought back", () => {
  const tree = () => screen.findByRole("tree", { name: "Pages" });
  const withApp = (change: (app: DocsApp) => DocsApp) => {
    routes[`GET /api/v1${root}/docs`] = () => {
      const all = list();
      return [200, { ...all, apps: all.apps.map(change) }];
    };
  };
  const withRemoved = () => {
    routes[`GET /api/v1${root}/docs`] = () => {
      const all = list();
      return [
        200,
        {
          ...all,
          pages: all.pages.map((one) =>
            one.path === "handbook/faq" ? { ...one, state: "removed", revision: 2 } : one,
          ),
        },
      ];
    };
    routes[`DELETE /api/v1${root}/drafts/handbook/faq`] = () => [204, null];
  };

  test("a page drafted for removal is kept from its row, after saying what that does", async () => {
    withRemoved();
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "Keep Questions" }));
    expect(await answer("Keep")).toContain("throws away the draft that removes it");
    await waitFor(() =>
      expect(sent("DELETE").map((call) => call.url)).toContain(
        `/api/v1${root}/drafts/handbook/faq`,
      ),
    );
    expect(await tree()).toBeTruthy();
  });

  test("and from the page itself, where its notice has the same action", async () => {
    withRemoved();
    docs("handbook/faq");
    expect(await screen.findByText(/A draft removes this page/)).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Keep this page" }));
    await answer("Keep");
    await waitFor(() => expect(sent("DELETE")).toHaveLength(1));
  });

  test("WLK-17d: a page drafted for removal opens in its editor as removed, read only, with Keep", async () => {
    routes[`GET /api/v1${root}/docs/page/handbook/support/returns`] = () => [
      200,
      {
        page: {
          ...list().pages.find((one) => one.path === "handbook/support/returns"),
          state: "removed",
        },
        source: sources["handbook/support/returns"],
        revision: 2,
        deployedSource: null,
      },
    ];
    show(
      <DocEditor
        root={root}
        link={link}
        tenantId="acme"
        workspaceId="dev"
        path="handbook/support/returns"
      />,
    );
    expect(await screen.findByText(/A draft removes this page/)).toBeTruthy();
    expect(screen.getAllByText("To be removed").length).toBeGreaterThan(0);
    expect(
      ((await screen.findByLabelText("Source of handbook/support/returns")) as HTMLTextAreaElement)
        .readOnly,
    ).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: "Keep this page" }));
    await answer("Keep");
    await waitFor(() => expect(sent("DELETE")).toHaveLength(1));
  });

  test("the editor deletes a page as the tree does: the same words, the name typed, and Undo", async () => {
    show(
      <DocEditor
        root={root}
        link={link}
        tenantId="acme"
        workspaceId="dev"
        path="handbook/support/refunds"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete…" }));
    expect(await answer("Delete", "refunds")).toContain("It is gone once this is deployed");
    await waitFor(() => expect(batches()).toHaveLength(1));
    expect(batches()[0]?.body?.changes).toContainEqual({
      path: "handbook/support/refunds",
      deleted: true,
      revision: 3,
    });
    await waitFor(() => expect(location.pathname).toBe(`${link}/docs`));
    // The toast's Undo, not the editor's own, which undoes typing.
    const undo = (await screen.findAllByRole("button", { name: "Undo" })).filter(
      (one) => !one.hasAttribute("aria-label"),
    );
    fireEvent.click(undo[0] as HTMLElement);
    await waitFor(() => expect(batches()).toHaveLength(2));
  });

  test("a site is switched off and on, keeping its pages and its app", async () => {
    routes[`PUT /api/v1${root}/drafts/help`] = () => [200, { revision: 1 }];
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Handbook" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Stop publishing/ }));
    expect(await answer("Stop publishing")).toContain("Its pages and its app are kept");
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]?.body).toEqual({
      kind: "app",
      schemaVersion: 1,
      body: { title: "Shop handbook", docs: "handbook", published: false },
    });
    // Undo puts the app back as it was.
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(sent("PUT")).toHaveLength(2));
    expect(sent("PUT")[1]?.body).toMatchObject({
      body: { title: "Shop handbook", docs: "handbook" },
    });
  });

  test("a site that is off is published again from the same menu, at the next deploy", async () => {
    routes[`PUT /api/v1${root}/drafts/help`] = () => [200, { revision: 1 }];
    withApp((one) => ({
      ...one,
      published: false,
      body: { ...one.body, published: false },
    }));
    docs();
    expect(await screen.findByText("Site, not published")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "More for Handbook" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Publish again/ }));
    expect(await answer("Publish again")).toContain("served again once this is deployed");
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]?.body).toEqual({
      kind: "app",
      schemaVersion: 1,
      body: { title: "Shop handbook", docs: "handbook" },
    });
  });

  test("page feedback is turned off, saying the table and its answers are kept", async () => {
    routes[`PUT /api/v1${root}/drafts/help`] = () => [200, { revision: 1 }];
    withApp((one) => ({
      ...one,
      feedback: "docs-feedback",
      body: { ...one.body, feedback: { table: "docs-feedback" } },
    }));
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Handbook" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Turn off page feedback/ }));
    const said = await answer("Turn off");
    expect(said).toContain("docs-feedback");
    expect(said).toContain("answers in it are kept");
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]?.body).toEqual({
      kind: "app",
      schemaVersion: 1,
      body: { title: "Shop handbook", docs: "handbook" },
    });
  });

  test("removing a site's app says first that the site stops being served", async () => {
    routes[`PUT /api/v1${root}/drafts/help`] = () => [200, { revision: 1 }];
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Handbook" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Remove the site's app/ }));
    expect(await answer("Remove")).toContain("The site stops being served once this is deployed");
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]?.body).toMatchObject({ kind: "app", deleted: true });
  });
});

describe("DOC-03 types and subjects in the docs editor", () => {
  /** The handbook with its support folder a how-to folder, and a reference page about refunds. */
  const typed = () => {
    const base = list();
    const set = (path: string, source: string) => {
      const found = base.pages.find((one) => one.path === path);
      if (found) found.source = source;
    };
    set(
      "handbook/support/index",
      text("title: Customer support\ntype: how-to\npages: [returns, refunds]"),
    );
    set(
      "handbook/support/refunds",
      text(
        "title: Refund an order\ntopic: support-refunds\nsubjects: [refunds]",
        "## Goal\n\nGive the money back.\n\n:::steps\n1. Open the order.\n:::\n",
      ),
    );
    set(
      "handbook/support/returns",
      text(
        "title: Receive a return\nsubjects: [refunds, parcels]",
        "## Goal\n\n:::steps\n1. Scan.\n:::\n",
      ),
    );
    base.pages.push(
      page("handbook/limits/index", "Limits", {
        source: text("title: Limits\ntype: reference"),
      }),
      page("handbook/limits/refund-limits", "Refund limits", {
        source: text("title: Refund limits\nsubjects: [refunds]", "Up to 500 a day.\n"),
      }),
    );
    routes[`GET /api/v1${root}/docs`] = () => [200, base];
    for (const one of base.pages) {
      routes[`GET /api/v1${root}/docs/page/${one.path}`] = () => [
        200,
        { page: one, source: one.source, revision: null, deployedSource: null },
      ];
    }
    return base;
  };
  const editor = (path: string) =>
    show(<DocEditor root={root} link={link} tenantId="acme" workspaceId="dev" path={path} />);
  const source = async (path = "handbook/support/refunds") =>
    (await screen.findByLabelText(`Source of ${path}`)) as HTMLTextAreaElement;
  const details = () => {
    fireEvent.click(screen.getByRole("tab", { name: "Page details" }));
    return within(screen.getByRole("region", { name: "Page details" }));
  };

  test("the index of the pages carries each page's type, subjects and moved_from, as written", () => {
    const base = typed();
    base.pages[3] = {
      ...(base.pages[3] as (typeof base.pages)[number]),
      source: text("title: Refund an order\ntype: reference\nsubjects: [a, b]\nmoved_from: [old]"),
    };
    const app = base.apps[0] as DocsApp;
    expect(indexOf(base, app).find((one) => one.path === "support/refunds")).toMatchObject({
      type: "reference",
      subjects: ["a", "b"],
      moved_from: ["old"],
    });
    expect(indexOf(base, app).find((one) => one.path === "support/index")?.type).toBe("how-to");
  });

  test("a page's type is shown as the folder's when it says none, and is changed or given back", async () => {
    typed();
    editor("handbook/support/refunds");
    const box = await source();
    const form = details();
    const type = form.getByLabelText(/^Type/) as HTMLSelectElement;
    expect(type.value).toBe("");
    expect(
      within(type).getByRole("option", { name: "Use the folder's (How-to guide)" }),
    ).toBeTruthy();
    fireEvent.change(type, { target: { value: "reference" } });
    await waitFor(() => expect(box.value).toContain("type: reference\n"));
    fireEvent.change(form.getByLabelText(/^Type/), { target: { value: "" } });
    await waitFor(() => expect(box.value).not.toContain("type:"));
    // What it did not touch is as it was.
    expect(box.value).toContain("subjects:");
  });

  test("subjects are added, offered from the site's own, and stop at five", async () => {
    typed();
    editor("handbook/support/refunds");
    const box = await source();
    const form = details();
    // Another page's subject is offered; this page's own is not offered again.
    fireEvent.click(form.getByRole("button", { name: "Add parcels" }));
    await waitFor(() => expect(box.value).toContain("subjects:\n  - refunds\n  - parcels\n"));
    expect(form.queryByRole("button", { name: "Add refunds" })).toBeNull();
    const add = form.getByLabelText("Add a subject");
    fireEvent.change(add, { target: { value: "Gift cards" } });
    fireEvent.keyDown(add, { key: "Enter" });
    await waitFor(() => expect(box.value).toContain("  - gift-cards\n"));
    for (const one of ["a", "b"]) {
      fireEvent.change(form.getByLabelText("Add a subject"), { target: { value: one } });
      fireEvent.keyDown(form.getByLabelText("Add a subject"), { key: "Enter" });
    }
    await waitFor(() => expect(box.value).toContain("  - b\n"));
    expect(form.getByText(/Five is the most a page uses/)).toBeTruthy();
    expect((form.getByLabelText("Add a subject") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(form.getByRole("button", { name: "Remove gift-cards" }));
    await waitFor(() => expect(box.value).not.toContain("gift-cards"));
    expect((form.getByLabelText("Add a subject") as HTMLInputElement).disabled).toBe(false);
  });

  test("the lints of a page of a typed folder are among the problems, as warnings", async () => {
    typed();
    editor("handbook/support/refunds");
    const box = await source();
    fireEvent.change(box, {
      target: { value: text("title: About refunds", "No steps and no heading.\n") },
    });
    const problems = within(await screen.findByRole("region", { name: "Problems" }));
    expect(await problems.findByText(/has no numbered steps/)).toBeTruthy();
    expect(problems.getByText(/title says what the reader will do/)).toBeTruthy();
    // A warning does not stop it being saved or deployed.
    expect(screen.queryByText("This page would deploy as it is.")).not.toBeNull();
  });

  test("the preview shows the page's type, and the pages of other types about the same things", async () => {
    typed();
    editor("handbook/support/refunds");
    await source();
    const shown = await screen.findByRole("region", { name: "The page as it will be served" });
    await waitFor(() => expect(within(shown).getByText("How-to guide")).toBeTruthy());
    expect(shown.querySelector(".eyebrow")?.textContent).toBe("How-to guide");
    // The related pages are read with the site's other pages, and may come after the page itself.
    const related = await within(shown).findByRole("complementary", { name: "Related" });
    expect(within(related).getByRole("link", { name: "Refund limits" }).getAttribute("href")).toBe(
      `${link}/docs/handbook/limits/refund-limits`,
    );
    // The same type is not related to itself: the other how-to page shares a subject and is left out.
    expect(within(related).queryByRole("link", { name: "Receive a return" })).toBeNull();
  });

  test("a collection's own page shows a card for each type its pages have", async () => {
    const base = typed();
    base.pages.push(
      page("handbook/support/faq-reference", "Support limits", {
        source: text("title: Support limits\ntype: reference", "Facts.\n"),
      }),
    );
    editor("handbook/support/index");
    const shown = await screen.findByRole("region", { name: "The page as it will be served" });
    await waitFor(() => expect(within(shown).getByText("What do you want to do?")).toBeTruthy());
    expect(within(shown).getByRole("link", { name: "How-to guides" })).toBeTruthy();
    expect(within(shown).getByRole("link", { name: "Reference" })).toBeTruthy();
  });

  test("the read view of a page draws its type and related pages as the served site does", async () => {
    typed();
    docs("handbook/support/refunds");
    const related = await screen.findByRole("complementary", { name: "Related" });
    expect(document.querySelector(".eyebrow")?.textContent).toBe("How-to guide");
    expect(within(related).getByRole("link", { name: "Refund limits" }).getAttribute("href")).toBe(
      `${link}/docs/handbook/limits/refund-limits`,
    );
  });

  test("a new page offers a type, and starts from that type's template", async () => {
    typed();
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Limits" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /New page here/ }));
    const title = await screen.findByLabelText("Page title");
    fireEvent.change(title, { target: { value: "Check a limit" } });
    const type = screen.getByLabelText("Type") as HTMLSelectElement;
    // The folder says reference: leaving it be writes no type on the page.
    expect(within(type).getByRole("option", { name: "Folder: Reference" })).toBeTruthy();
    fireEvent.change(type, { target: { value: "how-to" } });
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(batches()).toHaveLength(1));
    const made = (
      batches()[0]?.body?.changes as { path: string; source: string }[] | undefined
    )?.[0];
    expect(made?.path).toBe("handbook/limits/check-a-limit");
    expect(made?.source).toContain("type: how-to\n");
    expect(made?.source).toContain(":::steps");
  });

  test("a new page that takes the folder's type writes none, and one without a choice is as it was", async () => {
    typed();
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Limits" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /New page here/ }));
    const title = await screen.findByLabelText("Page title");
    fireEvent.change(title, { target: { value: "Raise a limit" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "reference" } });
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(batches()).toHaveLength(1));
    const made = (batches()[0]?.body?.changes as { source: string }[] | undefined)?.[0];
    expect(made?.source).not.toContain("type:");
    expect(made?.source).toContain("## Fields");
  });

  test("a new page left to the folder's type starts from that type's template, with no type line", async () => {
    typed();
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Limits" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /New page here/ }));
    const title = await screen.findByLabelText("Page title");
    fireEvent.change(title, { target: { value: "Count limits" } });
    expect((screen.getByLabelText("Type") as HTMLSelectElement).value).toBe("");
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(batches()).toHaveLength(1));
    const made = (batches()[0]?.body?.changes as { source: string }[] | undefined)?.[0];
    expect(made?.source).not.toContain("type:");
    expect(made?.source).toContain("## Fields");
  });

  test("a new page can be a changelog entry: named with today's date, kept in the site's changelog folder, from its template, and no type", async () => {
    typed();
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Limits" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /New page here/ }));
    const title = await screen.findByLabelText("Page title");
    fireEvent.change(title, { target: { value: "Open on Fridays" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "changelog-entry" } });
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
    expect((screen.getByLabelText("File name") as HTMLInputElement).value).toBe(
      `${today}-open-on-fridays`,
    );
    // The name follows the title until it is typed in, and keeps its date.
    fireEvent.change(title, { target: { value: "Open on Saturdays" } });
    expect((screen.getByLabelText("File name") as HTMLInputElement).value).toBe(
      `${today}-open-on-saturdays`,
    );
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(batches()).toHaveLength(1));
    const made = (
      batches()[0]?.body?.changes as { path: string; source: string }[] | undefined
    )?.[0];
    expect(made?.path).toBe(`handbook/changelog/${today}-open-on-saturdays`);
    expect(made?.source).toContain("title: Open on Saturdays");
    expect(made?.source).toContain("## What is new");
    expect(made?.source).not.toContain("type:");
  });

  test("Page details has a Date, written as `date:` and taken out when it is cleared", async () => {
    typed();
    editor("handbook/support/refunds");
    const box = await source();
    const form = details();
    const date = form.getByLabelText(/^Date/) as HTMLInputElement;
    expect(date.type).toBe("date");
    expect(date.value).toBe("");
    fireEvent.change(date, { target: { value: "2026-11-24" } });
    await waitFor(() => expect(box.value).toContain("date: 2026-11-24\n"));
    fireEvent.change(form.getByLabelText(/^Date/), { target: { value: "" } });
    await waitFor(() => expect(box.value).not.toContain("date:"));
  });

  test("Page details lays the Date out as its neighbours are, and says what the place note is about", async () => {
    typed();
    editor("handbook/support/refunds");
    await source();
    const form = details();
    const date = form.getByLabelText(/^Date/);
    // As wide as its column, like Topic and Icon: no box of its own that is narrower.
    expect(date.closest('[class*="max-w-"]')).toBeNull();
    // The note about its place is labelled, and is not a bare line between two fields.
    const note = form.getByText(/^Place among the others\./);
    expect(note.parentElement?.tagName).toBe("P");
    expect(form.queryByText(/^Its place among the others/)).toBeNull();
  });

  test("a new page with no type chosen is only its title", async () => {
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "More for Customer support" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /New page here/ }));
    const title = await screen.findByLabelText("Page title");
    fireEvent.change(title, { target: { value: "Gift cards" } });
    expect((screen.getByLabelText("Type") as HTMLSelectElement).value).toBe("");
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(batches()).toHaveLength(1));
    expect(batches()[0]?.body).toEqual({
      changes: [{ path: "handbook/support/gift-cards", source: "---\ntitle: Gift cards\n---\n" }],
    });
  });
});
