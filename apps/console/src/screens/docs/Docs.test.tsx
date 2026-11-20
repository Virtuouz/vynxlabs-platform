// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { forgetHelp } from "../../help/content.ts";
import { answer, show } from "../../testing.tsx";
import { DocEditor } from "./DocEditor.tsx";
import { Docs } from "./Docs.tsx";
import { type DocsList, indexOf, movedTo, resolvers, treeOf } from "./model.ts";

configure({ asyncUtilTimeout: 5000 });

const root = "/tenants/acme/workspaces/dev";
const link = "/t/acme/workspaces/dev";
const text = (frontmatter: string, body = "Words.\n") => `---\n${frontmatter}\n---\n\n${body}`;

const page = (path: string, title: string, more: object = {}) => ({
  path,
  title,
  description: null,
  order: null,
  topic: null,
  app: "help",
  url: path.replace(/^handbook\//, "").replace(/(^|\/)index$/, ""),
  state: "deployed" as const,
  file: null,
  headings: [],
  terms: [],
  ...more,
});

const list = (): DocsList => ({
  apps: [
    {
      path: "help",
      title: "Shop handbook",
      docs: "handbook",
      deployed: true,
      url: "https://apps.example.test/apps/acme/dev/help/",
      preview: "https://apps.example.test/apps/acme/dev/help/_draft/",
    },
  ],
  pages: [
    page("handbook/index", "Handbook"),
    page("handbook/faq", "Questions"),
    page("handbook/support/index", "Customer support", { order: 1 }),
    page("handbook/support/refunds", "Refund an order", {
      order: 2,
      topic: "support-refunds",
      state: "changed",
      terms: [{ id: "rma", term: "RMA", aliases: [], short: "A return authorisation." }],
    }),
    page("handbook/support/returns", "Returns", {
      order: 1,
      headings: ["by-post"],
      file: "docs/handbook/support/returns.md",
    }),
    page("handbook/ops/closing/checklist", "Closing checklist", { state: "new" }),
  ],
});

const sources: Record<string, string> = {
  "handbook/index": text("title: Handbook", "Start with [refunds](support/refunds).\n"),
  "handbook/support/refunds": text(
    "title: Refund an order\ntopic: support-refunds\nterms:\n  - id: rma\n    term: RMA\n    short: A return authorisation.",
    "Ask for the :term[RMA]{id=rma}, then see [returns](returns#by-post).\n\nThe :term[status]{table=orders column=status} column says where it is.\n",
  ),
  "handbook/support/returns": text("title: Returns", "## By post\n\nParcels come back.\n"),
};

let calls: { method: string; url: string; body: Record<string, unknown> | undefined }[];
let routes: Record<string, (body: unknown) => [number, unknown]>;

beforeEach(() => {
  calls = [];
  routes = {
    [`GET /api/v1${root}/docs`]: () => [200, list()],
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
    calls.push({ method, url: url.pathname, body });
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

describe("the pages of a workspace", () => {
  test("are shown as their folders: the app, its collections by their order, loose pages after", () => {
    const labels = (nodes: ReturnType<typeof treeOf>, depth = 0): string[] =>
      nodes.flatMap((node) => [
        `${"  ".repeat(depth)}${node.label}`,
        ...labels(node.children ?? [], depth + 1),
      ]);
    expect(labels(treeOf(list()))).toEqual([
      "Shop handbook",
      "  Handbook",
      "  Customer support",
      "    Customer support",
      "    Returns",
      "    Refund an order",
      "  Ops",
      "    Closing",
      "      Closing checklist",
      "  Questions",
    ]);
  });

  test("a page no app serves is listed apart, and has no pages to link to", () => {
    const loose: DocsList = {
      apps: [],
      pages: [page("notes/todo", "To do", { app: null, url: null })],
    };
    expect(treeOf(loose).map((node) => node.label)).toEqual(["Served by no app"]);
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

describe("a page let go on a row of the tree", () => {
  test("goes into that folder with its own name, or beside that page", () => {
    expect(movedTo(list(), "handbook/faq", "dir:handbook/support")).toEqual({
      to: "handbook/support/faq",
    });
    expect(movedTo(list(), "handbook/support/refunds", "app:help")).toEqual({
      to: "handbook/refunds",
    });
    expect(movedTo(list(), "handbook/faq", "handbook/ops/closing/checklist")).toEqual({
      to: "handbook/ops/closing/faq",
    });
  });

  test("stays where it is when that is where it is, and says when the place is taken", () => {
    expect(movedTo(list(), "handbook/faq", "app:help")).toBeUndefined();
    expect(movedTo(list(), "handbook/faq", "handbook/index")).toBeUndefined();
    const taken = list();
    taken.pages.push(page("handbook/support/faq", "Support questions"));
    expect(movedTo(taken, "handbook/faq", "dir:handbook/support")).toEqual({
      problem: "There is a page at handbook/support/faq already.",
    });
  });

  test("a page kept in the repository is the repository's to move", () => {
    expect(movedTo(list(), "handbook/support/returns", "app:help")).toBeUndefined();
  });
});

describe("the Documentation screen", () => {
  test("shows the first page, drawn, with the tree of pages beside it", async () => {
    docs();
    expect(await screen.findByRole("heading", { level: 2, name: "Handbook" })).toBeTruthy();
    const tree = screen.getByRole("tree", { name: "Pages" });
    expect(within(tree).getByRole("treeitem", { name: "Refund an order" })).toBeTruthy();
    const linked = await screen.findByRole("link", { name: "refunds" });
    expect(linked.getAttribute("href")).toBe(`${link}/docs/handbook/support/refunds`);
    fireEvent.click(linked);
    expect(location.pathname).toBe(`${link}/docs/handbook/support/refunds`);
    fireEvent.click(within(tree).getByRole("treeitem", { name: "Questions" }));
    expect(location.pathname).toBe(`${link}/docs/handbook/faq`);
    // A folder is opened and closed. It is not somewhere to go.
    fireEvent.click(within(tree).getByRole("treeitem", { name: /^Ops/ }));
    expect(location.pathname).toBe(`${link}/docs/handbook/faq`);
  });

  test("a page says its state, its terms mean what its writer may know, and it leads to its editor", async () => {
    docs("handbook/support/refunds");
    expect(await screen.findByRole("heading", { level: 2, name: "Refund an order" })).toBeTruthy();
    expect(screen.getByText("Changed, not deployed")).toBeTruthy();
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

  test("a page dragged onto a folder is moved there as a draft, with the revision it had", async () => {
    routes[`PUT /api/v1${root}/drafts/handbook/support/refunds`] = () => [200, { revision: 4 }];
    docs("handbook/support/refunds");
    const tree = await screen.findByRole("tree", { name: "Pages" });
    const dragged = within(tree).getByRole("treeitem", { name: /^Refund an order/ });
    const onto = within(tree).getByRole("treeitem", { name: /^Ops/ });
    expect(dragged.getAttribute("draggable")).toBe("true");
    // The repository's page cannot be picked up, and a folder is not a page.
    expect(
      within(tree)
        .getByRole("treeitem", { name: /^Returns/ })
        .getAttribute("draggable"),
    ).toBeNull();
    expect(onto.getAttribute("draggable")).toBeNull();
    const dataTransfer = { setData: () => {}, effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(dragged, { dataTransfer });
    fireEvent.dragOver(onto, { dataTransfer });
    fireEvent.drop(onto, { dataTransfer });
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]?.url).toBe(`/api/v1${root}/drafts/handbook/support/refunds`);
    expect(sent("PUT")[0]?.body).toMatchObject({
      kind: "doc",
      path: "handbook/ops/refunds",
      revision: 3,
      body: { source: sources["handbook/support/refunds"] },
    });
    // It was the page being read, so the reader follows it.
    await waitFor(() => expect(location.pathname).toBe(`${link}/docs/handbook/ops/refunds`));
  });

  test("where pages cannot be changed, none can be dragged", async () => {
    docs("handbook/faq", false);
    const tree = await screen.findByRole("tree", { name: "Pages" });
    expect(
      within(tree)
        .getByRole("treeitem", { name: /^Questions/ })
        .getAttribute("draggable"),
    ).toBeNull();
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

  test("in production nothing is written: pages are read, and change by deploy", async () => {
    docs("handbook/support/refunds", false);
    await screen.findByRole("heading", { level: 2, name: "Refund an order" });
    for (const name of ["Edit", "New page", "New docs app", /^Deploy/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  test("a docs app is made with its home page, as two drafts", async () => {
    routes[`GET /api/v1${root}/docs`] = () => [200, { apps: [], pages: [] }];
    routes[`PUT /api/v1${root}/drafts/guide/index`] = () => [200, { revision: 1 }];
    routes[`PUT /api/v1${root}/drafts/guide`] = () => [200, { revision: 1 }];
    docs();
    await screen.findByText("No documentation yet");
    fireEvent.click(screen.getAllByRole("button", { name: "New docs app" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: "Staff guide" } });
    fireEvent.change(within(dialog).getByLabelText(/^Address/), { target: { value: "guide" } });
    expect((within(dialog).getByLabelText(/^Folder of pages/) as HTMLInputElement).value).toBe(
      "guide",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Make it" }));
    await waitFor(() => expect(sent("PUT")).toHaveLength(2));
    expect(sent("PUT").map((call) => [call.url, call.body?.kind])).toEqual([
      [`/api/v1${root}/drafts/guide/index`, "doc"],
      [`/api/v1${root}/drafts/guide`, "app"],
    ]);
    expect(sent("PUT")[1]?.body?.body).toEqual({ title: "Staff guide", docs: "guide" });
    expect(sent("PUT")[0]?.body?.body).toMatchObject({
      source: expect.stringContaining('title: "Staff guide"'),
    });
    await waitFor(() => expect(location.pathname).toBe(`${link}/docs/edit/guide/index`));
  });

  test("a new page must go where a docs app will serve it", async () => {
    docs();
    fireEvent.click(await screen.findByRole("button", { name: "New page" }));
    const dialog = await screen.findByRole("dialog");
    const path = within(dialog).getByLabelText(/^Path/) as HTMLInputElement;
    expect(path.value).toBe("handbook/");
    fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: "Exchanges" } });
    fireEvent.change(path, { target: { value: "elsewhere/exchanges" } });
    expect(within(dialog).getByText(/No docs app serves that folder/)).toBeTruthy();
    fireEvent.change(path, { target: { value: "handbook/faq" } });
    expect(within(dialog).getByText("There is a page at that path already.")).toBeTruthy();
    fireEvent.change(path, { target: { value: "handbook/support/exchanges" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Write it" }));
    await waitFor(() => expect(location.pathname).toBe(`${link}/docs/new`));
    expect(new URLSearchParams(location.search).get("at")).toBe("handbook/support/exchanges");
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

  test("the page's details are a form that writes its source, and leaves the rest as it was", async () => {
    editor("handbook/support/refunds");
    const box = await source();
    expect(screen.queryByRole("region", { name: "Page details" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Page details" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Page details" }));
    expect(
      within(screen.getByRole("region", { name: "Page details" })).getByText(/cannot be read/),
    ).toBeTruthy();
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
