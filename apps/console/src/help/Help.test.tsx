// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ERROR_CODES } from "@volvel/manifest";
import { parse } from "@volvel/markup";
import { Dialog, Notice, TextField } from "@volvel/ui";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../api.ts";
import { failureText, notify } from "../ask.tsx";
import { PageHeader } from "../kit/PageHeader.tsx";
import { SHORTCUTS } from "../kit/shortcuts.ts";
import {
  EDITORS,
  INSTANCE_SECTIONS,
  TENANT_SECTIONS,
  WORKSPACE_SECTIONS,
  whereIs,
} from "../nav.ts";
import { setPreference } from "../prefs.ts";
import { show } from "../testing.tsx";
import { around } from "./around.ts";
import { forgetHelp } from "./content.ts";
import { FieldAbout, forgetFields } from "./FieldAbout.tsx";
import { AttachedPages, WorkspaceGlossary } from "./glossary.tsx";
import { HelpDock, useHelpInAddress } from "./HelpDock.tsx";
import { pageFor } from "./HelpPanel.tsx";
import {
  closeHelp,
  HelpTopic,
  openHelp,
  resetHelp,
  setSectionTopic,
  useHelp,
  useHelpTopic,
} from "./store.ts";

/** The documentation as it is built, read from the package the console ships. */
const DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/docs/dist");
const manifest = JSON.parse(readFileSync(join(DOCS, "manifest.json"), "utf8"));

let width = 1440;
let still = false;
beforeEach(() => {
  width = 1440;
  still = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? still
      : width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (url: string) => {
    const file = join(DOCS, String(url).replace(/^\/help\//, ""));
    try {
      const text = readFileSync(file, "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
    } catch {
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    }
  });
});
afterEach(() => {
  cleanup();
  resetHelp();
  forgetHelp();
  vi.unstubAllGlobals();
});

function Topic() {
  const { topic, target, open } = useHelp();
  return (
    <output data-testid="topic">{`${topic ?? "none"}|${target ?? "page"}|${open ? "open" : "closed"}`}</output>
  );
}
const told = () => screen.getByTestId("topic").textContent;

describe("every screen has help", () => {
  const topics = new Set(Object.keys(manifest.topics));

  test("each section of a workspace, a tenant and the instance names a topic the help has", () => {
    const sections = [
      ...Object.values(WORKSPACE_SECTIONS).flat(),
      ...TENANT_SECTIONS,
      ...INSTANCE_SECTIONS,
    ];
    expect(sections.length).toBeGreaterThan(45);
    for (const section of sections) {
      expect(topics.has(section.help), `${section.label}: ${section.help}`).toBe(true);
    }
  });

  test("no two sections of the navigation share a topic, so each opens its own page", () => {
    const seen = new Map<string, string>();
    for (const section of INSTANCE_SECTIONS) {
      expect(
        seen.get(section.help),
        `${section.label} and ${seen.get(section.help)}`,
      ).toBeUndefined();
      seen.set(section.help, section.label);
    }
  });

  test("each editor names a topic of its own", () => {
    for (const editor of EDITORS) expect(topics.has(editor.help), editor.help).toBe(true);
  });

  test.each([
    ["/t/acme/workspaces/dev/tables", "data-tables"],
    ["/t/acme/workspaces/dev/tables/sales/orders", "data-tables"],
    ["/t/acme/workspaces/dev/overview", "workspace-overview"],
    ["/t/acme/workspaces/dev/flows", "build-flows"],
    ["/t/acme/workspaces/dev/flows/edit/sales/sync", "build-flows-editor"],
    ["/t/acme/workspaces/dev/scripts/new", "build-scripts-editor"],
    ["/t/acme/workspaces/dev/screens/portal", "build-screens-editor"],
    ["/t/acme/workspaces/dev/dashboards/sales", "data-dashboards"],
    ["/t/acme/workspaces/dev/flow-runs/123", "operate-runs"],
    ["/t/acme/workspaces/dev/changes", "operate-release"],
    ["/t/acme", "tenant-overview"],
    ["/t/acme/roles", "tenant-members"],
    ["/t/acme/end-user-groups", "tenant-end-users"],
    ["/instance/audit", "instance-audit"],
    ["/account/api-keys", "account"],
  ])("%s has the help %s", (path, topic) => {
    expect(whereIs(path, false).help).toBe(topic);
    expect(topics.has(topic)).toBe(true);
  });

  test("the first screen is the tenants' for a member and the instance's for an operator", () => {
    expect(whereIs("/", false).help).toBe("tenants");
    expect(whereIs("/", true).help).toBe("instance-tenants");
  });

  test("a topic or a page's path leads to a page, with the heading asked for", () => {
    expect(pageFor(manifest, "data-tables")).toEqual({
      path: "console/reference/screens/data/tables",
    });
    expect(pageFor(manifest, "start/explanation/concepts#resources")).toEqual({
      path: "start/explanation/concepts",
      anchor: "resources",
    });
    expect(pageFor(manifest, "no-such-topic")).toBeUndefined();
    expect(pageFor(manifest, undefined)).toBeUndefined();
  });
});

describe("which topic is the screen's", () => {
  function Page({ topic }: { topic: string }) {
    useHelpTopic(topic);
    return null;
  }

  test("a page's topic is over its section's, and a dialog's is over its page's", () => {
    const { rerender } = show(
      <>
        <Topic />
        <Page topic="data-tables" />
      </>,
    );
    act(() => setSectionTopic("data-queries"));
    expect(told()).toBe("data-tables|page|closed");
    rerender(
      <>
        <Topic />
        <Page topic="data-tables" />
        <Dialog open onClose={() => {}} title="New column">
          <HelpTopic topic="start/explanation/concepts" />
        </Dialog>
      </>,
    );
    expect(told()).toBe("start/explanation/concepts|page|closed");
    rerender(
      <>
        <Topic />
        <Page topic="data-tables" />
      </>,
    );
    expect(told()).toBe("data-tables|page|closed");
    rerender(<Topic />);
    expect(told()).toBe("data-queries|page|closed");
  });

  test("what was followed inside the panel is kept while the screen is, and left when it changes", () => {
    show(<Topic />);
    act(() => setSectionTopic("data-tables"));
    act(() => openHelp("start/explanation/concepts"));
    expect(told()).toBe("data-tables|start/explanation/concepts|open");
    act(() => closeHelp());
    act(() => openHelp());
    expect(told()).toBe("data-tables|start/explanation/concepts|open");
    act(() => setSectionTopic("operate-runs"));
    expect(told()).toBe("operate-runs|page|open");
  });
});

describe("the help panel", () => {
  function Screen() {
    useHelpInAddress();
    return (
      <>
        <PageHeader title="Tables" description="Rows the workspace owns." />
        <HelpDock />
      </>
    );
  }
  const panel = () => screen.getByRole("complementary", { name: "Help" });

  test("opens at the screen's own page, beside the work and not over it", async () => {
    show(<Screen />);
    act(() => setSectionTopic("data-tables"));
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Help for Tables" }));
    await within(panel()).findByText(/A table holds rows the workspace owns/);
    expect(within(panel()).getByRole("heading", { name: "Tables" })).toBeTruthy();
    expect(panel().getAttribute("data-help-panel")).toBe("docked");
    expect(screen.queryByRole("dialog")).toBeNull();
    // The heading takes focus, so the keyboard is in the panel.
    expect(document.activeElement).toBe(within(panel()).getByRole("heading", { name: "Tables" }));
  });

  test("lies over the edge on a laptop and takes the screen on a phone", async () => {
    width = 1100;
    show(<Screen />);
    act(() => openHelp("data-tables"));
    expect(panel().getAttribute("data-help-panel")).toBe("over");
    cleanup();
    width = 390;
    show(<Screen />);
    expect(panel().getAttribute("data-help-panel")).toBe("full");
    expect(panel().parentElement?.className).toContain("fixed inset-0");
  });

  test("a page says which version brought what it describes (DOC-MP2)", async () => {
    // No page of the product says it yet, so one is made to.
    const plain = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string) => {
      const answer = await plain(url);
      if (!String(url).endsWith("manifest.json")) return answer;
      const text = JSON.stringify({
        ...manifest,
        pages: manifest.pages.map((one: { path: string }) =>
          one.path === "console/reference/screens/data/tables" ? { ...one, since: "0.4" } : one,
        ),
      });
      return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
    });
    show(<Screen />);
    act(() => openHelp("data-tables"));
    await within(panel()).findByText("New in version 0.4");
    act(() => openHelp("start/explanation/concepts"));
    await within(panel()).findByRole("heading", { name: /concepts/i });
    expect(within(panel()).queryByText(/New in version/)).toBeNull();
  });

  test("closing it gives focus back to what had it when it was opened", async () => {
    show(<Screen />);
    act(() => setSectionTopic("data-tables"));
    const opener = screen.getByRole("button", { name: "Help for Tables" });
    opener.focus();
    fireEvent.click(opener);
    await within(panel()).findByText(/A table holds rows the workspace owns/);
    expect(document.activeElement).toBe(within(panel()).getByRole("heading", { name: "Tables" }));
    fireEvent.keyDown(within(panel()).getByRole("heading", { name: "Tables" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  test("Escape closes it from inside", async () => {
    show(<Screen />);
    act(() => openHelp("data-tables"));
    fireEvent.keyDown(within(panel()).getByRole("heading"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
  });

  test("arrives and leaves with the motion the other panels have, and is out of reach while it leaves", async () => {
    show(<Screen />);
    act(() => openHelp("data-tables"));
    const shell = panel().parentElement as HTMLElement;
    expect(shell.hasAttribute("data-drawer")).toBe(true);
    expect(shell.className).toContain("transition-[opacity,translate] motion-slow");
    expect(shell.className).toContain("data-[starting-style]:translate-x-6");
    expect(shell.className).toContain("data-[ending-style]:opacity-0");
    act(() => closeHelp());
    expect(shell.hasAttribute("data-ending-style")).toBe(true);
    expect(shell.hasAttribute("inert")).toBe(true);
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
  });

  test("with reduced motion it goes at once", async () => {
    still = true;
    show(<Screen />);
    act(() => openHelp("data-tables"));
    act(() => closeHelp());
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  test("a link inside it opens the next page inside it, and Back returns to the screen's", async () => {
    show(<Screen />);
    act(() => setSectionTopic("workspace-overview"));
    act(() => openHelp());
    await within(panel()).findByText(/The overview is where a/);
    act(() => openHelp("index"));
    fireEvent.click(await within(panel()).findByRole("link", { name: "Start here" }));
    await within(panel()).findByRole("heading", { name: "Start here" });
    fireEvent.click(
      within(panel()).getByRole("button", { name: "Back to the help for this page" }),
    );
    await within(panel()).findByRole("heading", { name: "Workspace overview" });
  });

  test("a term in the help says what it means and leads to its page", async () => {
    show(<Screen />);
    act(() => setSectionTopic("workspace-overview"));
    act(() => openHelp());
    fireEvent.click(await within(panel()).findByRole("button", { name: "workspace" }));
    await screen.findByText(/A place where a tenant's resources live and run/);
    fireEvent.click(screen.getByRole("button", { name: "More about workspace" }));
    await within(panel()).findByRole("heading", { name: "Concepts" });
  });

  test("a term on the page that explains it does not offer to open that page (DOC-13)", async () => {
    show(<Screen />);
    act(() => openHelp("start/explanation/concepts"));
    fireEvent.click(await within(panel()).findByRole("button", { name: "workspaces" }));
    await screen.findByText(/A place where a tenant's resources live and run/);
    expect(screen.queryByRole("button", { name: /More about/ })).toBeNull();
  });

  test("is searched without leaving it", async () => {
    show(<Screen />);
    act(() => openHelp("index"));
    fireEvent.change(within(panel()).getByRole("searchbox", { name: "Search the help" }), {
      target: { value: "approval" },
    });
    const found = await within(panel()).findByRole("list", { name: "Pages found" });
    const hit = within(found)
      .getAllByRole("button")
      .find((button) => button.firstElementChild?.textContent === "Approvals");
    fireEvent.click(hit as HTMLElement);
    await within(panel()).findByRole("heading", { name: "Approvals" });
    fireEvent.change(within(panel()).getByRole("searchbox"), {
      target: { value: "zebra crossing" },
    });
    await within(panel()).findByText("Nothing in the help matches.");
  });

  test("a result says where its page is, so pages of one name in two places differ", async () => {
    show(<Screen />);
    act(() => openHelp("index"));
    fireEvent.change(within(panel()).getByRole("searchbox", { name: "Search the help" }), {
      target: { value: "approval" },
    });
    const found = await within(panel()).findByRole("list", { name: "Pages found" });
    const hit = found.querySelector(":scope > li > button") as HTMLElement;
    const where = [...hit.children].map((one) => one.textContent ?? "");
    // The title, then where the page is: its collection, and its folders after it.
    expect(where.length).toBeGreaterThan(1);
    expect(where[1]).not.toBe("");
    expect(where[1]).not.toBe(where[0]);
  });

  test("a stale ?help= says the page is not found, and offers this screen's own page", async () => {
    show(<Screen />);
    act(() => setSectionTopic("data-tables"));
    act(() => openHelp("nonsense"));
    await within(panel()).findByText(/The help has no page called “nonsense”/);
    expect(within(panel()).queryByText(/no help for this screen yet/)).toBeNull();
    fireEvent.click(within(panel()).getByRole("button", { name: "Help for this screen" }));
    await within(panel()).findByRole("heading", { name: "Tables" });
  });

  test("a search shows the headings and passages that matched, and opens the page at one (DOC-MP3)", async () => {
    show(<Screen />);
    act(() => openHelp("index"));
    fireEvent.change(within(panel()).getByRole("searchbox", { name: "Search the help" }), {
      target: { value: "approval" },
    });
    const found = await within(panel()).findByRole("list", { name: "Pages found" });
    const places = await within(found).findAllByRole("list", { name: /^In / });
    expect(places.length).toBeGreaterThan(0);
    const place = within(places[0] as HTMLElement).getAllByRole("button")[0] as HTMLElement;
    // What was asked for is marked inside the place's words.
    expect(place.querySelector("mark")?.textContent?.toLowerCase()).toContain("approv");
    fireEvent.click(place);
    expect(within(panel()).queryByRole("list", { name: "Pages found" })).toBeNull();
    await within(panel()).findByRole("heading", { level: 2 });
  });

  test("a screen with no page says so and offers the rest", async () => {
    show(<Screen />);
    act(() => setSectionTopic("no-such-topic"));
    act(() => openHelp());
    await within(panel()).findByText("There is no help for this screen yet.");
    fireEvent.click(within(panel()).getByRole("button", { name: "Browse the help" }));
    await within(panel()).findByRole("heading", { name: "Help" });
  });

  test("an address with ?help= opens it there, and the address is put back", async () => {
    history.replaceState(null, "", "/t/acme/workspaces/dev/runs?help=data-tables");
    show(<Screen />);
    await within(panel()).findByRole("heading", { name: "Tables" });
    await waitFor(() => expect(location.search).toBe(""));
    history.replaceState(null, "", "/");
  });

  test("when the files cannot be fetched it says so", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 503 }));
    show(<Screen />);
    act(() => openHelp("data-tables"));
    await within(panel()).findByText(/The help could not be loaded/);
  });
});

describe("the page's own heading", () => {
  test("a description folded behind the ⓘ leads on to the help", async () => {
    show(
      <>
        <PageHeader title="Tables" description="Rows the workspace owns." helpKey="x" helpSeen />
        <Topic />
      </>,
    );
    act(() => setSectionTopic("data-tables"));
    fireEvent.click(screen.getByRole("button", { name: "About Tables" }));
    await screen.findByText("Rows the workspace owns.");
    fireEvent.click(screen.getByRole("button", { name: "Learn more" }));
    expect(told()).toBe("data-tables|page|open");
  });

  test("a screen with no topic has no help control", () => {
    show(<PageHeader title="Somewhere" />);
    expect(screen.queryByRole("button", { name: /Help for/ })).toBeNull();
  });
});

describe("a workspace's own terms", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (!String(url).endsWith("/tenants/acme/workspaces/dev/terms")) {
        return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
      }
      return new Response(
        JSON.stringify({
          terms: [
            { id: "rma", term: "RMA", aliases: [], short: "A return authorisation.", page: null },
          ],
          resources: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
  });

  test("are underlined in a page's description, and can be turned off", async () => {
    const screenOf = () => (
      <WorkspaceGlossary tenantId="acme" workspaceId="dev">
        <PageHeader title="Returns" description="Every RMA the shop has issued." />
      </WorkspaceGlossary>
    );
    show(screenOf());
    fireEvent.click(await screen.findByRole("button", { name: "RMA" }));
    await screen.findByText("A return authorisation.");
    cleanup();
    act(() => setPreference("terms.underline", false));
    show(screenOf());
    await screen.findByText("Every RMA the shop has issued.");
    expect(screen.queryByRole("button", { name: "RMA" })).toBeNull();
    act(() => setPreference("terms.underline", true));
  });

  test("a term the team defined leads to its page, where the page is served", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            terms: [
              {
                id: "rma",
                term: "RMA",
                aliases: [],
                short: "A return authorisation.",
                page: {
                  app: "help",
                  path: "handbook/support/refunds",
                  title: "Refund an order",
                  url: "https://apps.example.test/apps/acme/dev/help/support/refunds",
                },
              },
            ],
            resources: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    show(
      <WorkspaceGlossary tenantId="acme" workspaceId="dev">
        <PageHeader title="Returns" description="Every RMA the shop has issued." />
      </WorkspaceGlossary>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "RMA" }));
    const more = await screen.findByRole("link", { name: /More about RMA/ });
    expect(more.getAttribute("href")).toBe(
      "https://apps.example.test/apps/acme/dev/help/support/refunds",
    );
    expect(more.getAttribute("target")).toBe("_blank");
  });

  test("outside a workspace nothing is asked for and nothing is underlined", () => {
    const asked = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", asked);
    show(
      <WorkspaceGlossary tenantId="acme" workspaceId={undefined}>
        <PageHeader title="Members" description="Every RMA." />
      </WorkspaceGlossary>,
    );
    expect(asked).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "RMA" })).toBeNull();
  });
});

describe("what the reader's own team has added", () => {
  const refunds = {
    app: "help",
    path: "handbook/support/refunds",
    title: "How we refund an order",
    url: "https://apps.example.test/apps/acme/dev/help/support/refunds",
  };
  beforeEach(() => {
    const files = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (!String(url).endsWith("/tenants/acme/workspaces/dev/terms")) return files(url, init);
      return new Response(
        JSON.stringify({
          terms: [],
          resources: [],
          extensions: [
            { topic: "data-tables", page: refunds },
            { topic: "operate-runs", page: { ...refunds, title: "Not for this page" } },
          ],
          attachments: [
            { kind: "table", resource: "orders", page: refunds },
            { kind: "table", resource: "other", page: { ...refunds, title: "Another table's" } },
          ],
          topics: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
  });

  test("the help for a screen ends with the team's own notes on it, and no other screen's", async () => {
    show(<HelpDock tenantId="acme" workspaceId="dev" />);
    act(() => setSectionTopic("data-tables"));
    act(() => openHelp());
    const panel = screen.getByRole("complementary", { name: "Help" });
    const team = await within(panel).findByRole("region", { name: "From your team" });
    expect(
      within(team)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["How we refund an order"]);
    expect(within(team).getByRole("link").getAttribute("href")).toBe(refunds.url);
    // Another page of the help has none.
    act(() => openHelp("start/explanation/concepts"));
    await within(panel).findByRole("heading", { name: "Concepts" });
    expect(within(panel).queryByRole("region", { name: "From your team" })).toBeNull();
  });

  test("outside a workspace the help has only the product's own", async () => {
    show(<HelpDock />);
    act(() => setSectionTopic("data-tables"));
    act(() => openHelp());
    const panel = screen.getByRole("complementary", { name: "Help" });
    await within(panel).findByText(/A table holds rows the workspace owns/);
    expect(within(panel).queryByRole("region", { name: "From your team" })).toBeNull();
  });

  test("a resource's screen lists the pages that document it, and is silent when there are none", async () => {
    const { rerender } = show(
      <AttachedPages tenantId="acme" workspaceId="dev" kind="table" path="orders" />,
    );
    const pages = await screen.findByRole("region", { name: "Documentation" });
    expect(
      within(pages)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["How we refund an order"]);
    rerender(<AttachedPages tenantId="acme" workspaceId="dev" kind="table" path="invoices" />);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Documentation" })).toBeNull());
  });
});

describe("what an error means", () => {
  const errors = JSON.parse(
    readFileSync(join(DOCS, "pages/develop/reference/errors.json"), "utf8"),
  );
  const sections = new Set(
    (errors.tree.children as { type: string; id?: string }[])
      .filter((node) => node.type === "heading")
      .map((node) => node.id),
  );

  test("every code the API answers with has its own part of the help", () => {
    const codes = Object.keys(ERROR_CODES);
    expect(codes.length).toBeGreaterThan(50);
    for (const code of codes) expect(sections.has(code), code).toBe(true);
  });

  test("a failure with a code offers what it means, and opens the help there", async () => {
    show(
      <>
        <Topic />
        <HelpDock />
      </>,
    );
    act(() => {
      notify.error(
        new ApiError(409, {
          code: "draft_changed",
          detail: "Someone else saved this draft since you opened it.",
        }),
      );
    });
    fireEvent.click(await screen.findByRole("button", { name: "What does this mean?" }));
    expect(told()).toBe("none|errors#draft_changed|open");
    const panel = screen.getByRole("complementary", { name: "Help" });
    await within(panel).findByRole("heading", { name: "Error codes" });
    await within(panel).findByText(/Nothing was overwritten/);
  });

  test("a failure shown inside a dialog offers the same, and a message from no code does not", async () => {
    const err = new ApiError(409, {
      code: "draft_changed",
      detail: "Someone else saved this draft since you opened it.",
    });
    show(
      <>
        <Topic />
        <Notice tone="danger">{failureText(err)}</Notice>
        <Notice tone="danger">An invented sentence.</Notice>
        <HelpDock />
      </>,
    );
    const asks = screen.getAllByRole("button", { name: "What does this mean?" });
    expect(asks).toHaveLength(1);
    fireEvent.click(asks[0] as HTMLElement);
    const panel = screen.getByRole("complementary", { name: "Help" });
    await within(panel).findByRole("heading", { name: "Error codes" });
  });

  test("a failure shown inside a dialog explains itself there: focus stays, Esc closes, the panel stays shut", async () => {
    const err = new ApiError(409, {
      code: "draft_changed",
      detail: "Someone else saved this draft since you opened it.",
    });
    const onClose = vi.fn();
    show(
      <>
        <Topic />
        <Dialog open onClose={onClose} title="Create table">
          <TextField name="name" label="Name" value="" onChange={() => {}} />
          <Notice tone="danger">{failureText(err)}</Notice>
        </Dialog>
        <HelpDock />
      </>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Create table" });
    const ask = within(dialog).getByRole("button", { name: "What does this mean?" });
    ask.focus();
    fireEvent.click(ask);
    await within(dialog).findByText(/Nothing was overwritten/);
    expect(screen.queryByRole("complementary", { name: "Help" })).toBeNull();
    expect(told().split("|")[2]).not.toBe("open");
    const more = within(dialog).getByRole("link", { name: "Open in documentation" });
    expect(more.getAttribute("href")).toBe("/docs/develop/reference/errors#draft_changed");
    expect(more.getAttribute("target")).toBe("_blank");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(ask.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("a failure with no code of the API's, or none at all, offers nothing", async () => {
    show(<Topic />);
    act(() => {
      notify.error(new ApiError(401, { code: "invalid_email_or_password", detail: "No." }));
      notify.error(new Error("The network is down."));
    });
    await screen.findByText("The network is down.");
    expect(screen.queryByRole("button", { name: "What does this mean?" })).toBeNull();
  });
});

describe("a field of a form written by hand", () => {
  afterEach(forgetFields);

  test("says what its kind's schema says of it, beside its label and not in it", async () => {
    show(
      <FieldAbout path="schedule.cron" name="the cron line">
        <TextField name="cron" label="When, as a cron line" value="" onChange={() => {}} />
      </FieldAbout>,
    );
    const about = await screen.findByRole("button", { name: "About the cron line" });
    expect(about.closest("label")).toBeNull();
    fireEvent.click(about);
    await screen.findByText("Five-field cron expression.");
    // The field is still found by its own label, and by nothing more.
    expect(screen.getByLabelText("When, as a cron line")).toBeTruthy();
  });

  test("a field its schema says nothing of is left as it was", async () => {
    show(
      <FieldAbout path="schedule.no_such_field" name="nothing">
        <TextField name="x" label="Something" value="" onChange={() => {}} />
      </FieldAbout>,
    );
    await screen.findByLabelText("Something");
    await new Promise((done) => setTimeout(done, 20));
    expect(screen.queryByRole("button", { name: /^About/ })).toBeNull();
  });
});

test("help is on F1 everywhere, a field included, and on ⌘/", () => {
  expect(SHORTCUTS.help.keys).toEqual(["F1", "Mod+/"]);
});

describe("where the help panel's page is, and where it leads", () => {
  function Screen() {
    useHelpInAddress();
    return <HelpDock />;
  }
  const panel = () => screen.getByRole("complementary", { name: "Help" });
  const url = (path: string) =>
    manifest.pages.find((one: { path: string }) => one.path === path).url;

  /** A page of the product answered with another page's file, or another manifest. */
  function answer(files: Record<string, unknown>) {
    const plain = globalThis.fetch;
    vi.stubGlobal("fetch", async (address: string) => {
      const found = files[String(address).replace(/^\/help\//, "")];
      if (found === undefined) return plain(address);
      const text = JSON.stringify(found);
      return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
    });
  }
  const pageFile = (path: string, source: string) => ({
    path,
    title: manifest.pages.find((one: { path: string }) => one.path === path).title,
    tree: parse(source),
  });

  test("an old address still opens the page it became, with the heading asked for", () => {
    const moves = manifest.redirects as Record<string, string>;
    const [from, to] = Object.entries(moves)[0] as [string, string];
    // The manifest's own moves are known with none given.
    expect(pageFor(manifest, from)).toEqual({ path: to });
    expect(pageFor(manifest, `${from}#a-heading`, moves)).toEqual({
      path: to,
      anchor: "a-heading",
    });
    // A page that is there is not taken for an old one, and a page deleted is led on by the file's word.
    expect(pageFor(manifest, to, { [to]: "index" })).toEqual({ path: to });
    expect(pageFor(manifest, "gone/page", { "gone/page": "index" })).toEqual({ path: "index" });
    expect(pageFor(manifest, "never/was", moves)).toBeUndefined();
  });

  test("a saved ?help= link to an old path opens the page, in the panel", async () => {
    const [from, to] = Object.entries(manifest.redirects as Record<string, string>).find(
      ([, now]) => now === "start/explanation/concepts",
    ) as [string, string];
    expect(to).toBe("start/explanation/concepts");
    show(<Screen />);
    act(() => openHelp(from));
    await within(panel()).findByRole("heading", { level: 2, name: "Concepts" });
  });

  test("the trail says where the page is, each step but the last leads there, and Home leads to the root", async () => {
    show(<Screen />);
    act(() => openHelp("start/explanation/concepts"));
    const trail = await within(panel()).findByRole("navigation", { name: "Where this page is" });
    const steps = around(manifest, "start/explanation/concepts", String).trail;
    expect(
      within(trail)
        .getAllByRole("listitem")
        .map((one) => one.textContent),
    ).toEqual(steps.map((one) => one.title));
    expect(
      within(trail).getByText("Concepts").closest("[aria-current]")?.getAttribute("aria-current"),
    ).toBe("page");
    fireEvent.click(within(trail).getByRole("link", { name: steps[0]?.title as string }));
    await within(panel()).findByRole("heading", { level: 2, name: steps[0]?.title as string });
    fireEvent.click(within(panel()).getByRole("button", { name: "Help home" }));
    await within(panel()).findByRole("heading", { level: 2, name: manifest.nav.home.title });
    // Already at the root: nothing to go to.
    expect(within(panel()).queryByRole("button", { name: "Help home" })).toBeNull();
  });

  test("a trail's separator stays with the crumb before it, so a line never begins with one", async () => {
    show(<Screen />);
    act(() => openHelp("start/explanation/concepts"));
    const trail = await within(panel()).findByRole("navigation", { name: "Where this page is" });
    const items = [...trail.querySelectorAll("li")];
    expect(items.length).toBeGreaterThan(1);
    for (const [at, item] of items.entries()) {
      expect(item.firstElementChild?.tagName.toLowerCase(), item.textContent ?? "").not.toBe("svg");
      expect(item.lastElementChild?.tagName.toLowerCase() === "svg").toBe(at < items.length - 1);
    }
  });

  test("previous and next lead through the folder, and the heading takes focus on the new page", async () => {
    const folder = manifest.pages
      .map((one: { path: string }) => one.path)
      .find((path: string) => {
        const set = around(manifest, path, String);
        return set.before && set.after;
      }) as string;
    const set = around(manifest, folder, String);
    show(<Screen />);
    act(() => openHelp(folder));
    const pager = await within(panel()).findByRole("navigation", {
      name: "Pages before and after",
    });
    expect(
      within(pager).getByRole("link", { name: new RegExp(set.before?.title as string) }),
    ).toBeTruthy();
    fireEvent.click(
      within(pager).getByRole("link", { name: new RegExp(`Next.*${set.after?.title}`) }),
    );
    const heading = await within(panel()).findByRole("heading", {
      level: 2,
      name: set.after?.title as string,
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  test("pages of other types about the same things are listed, by type", async () => {
    answer({
      "manifest.json": {
        ...manifest,
        pages: manifest.pages.map((one: { path: string }) =>
          one.path === "start/explanation/concepts" ||
          one.path === "console/reference/screens/home/tenants"
            ? { ...one, subjects: ["tenants"] }
            : one,
        ),
      },
    });
    show(<Screen />);
    act(() => openHelp("start/explanation/concepts"));
    const related = await within(panel()).findByRole("region", { name: "Related" });
    expect(within(related).getByRole("heading", { name: "Reference" })).toBeTruthy();
    fireEvent.click(within(related).getByRole("link", { name: "Your tenants" }));
    await within(panel()).findByRole("heading", { level: 2, name: "Your tenants" });
    expect(within(panel()).queryByRole("region", { name: "Related" })).not.toBeNull();
  });

  test("Open in documentation is a plain link to the same page on this instance, in a new tab", async () => {
    show(<Screen />);
    act(() => openHelp("start/explanation/concepts#what-is-a-tenant"));
    const link = await within(panel()).findByRole("link", { name: /Open in documentation/ });
    expect(link.getAttribute("href")).toBe(
      `/docs/${url("start/explanation/concepts")}#what-is-a-tenant`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    act(() => openHelp("index"));
    await waitFor(() =>
      expect(
        within(panel())
          .getByRole("link", { name: /Open in documentation/ })
          .getAttribute("href"),
      ).toBe("/docs/"),
    );
  });

  test("a picture beside a page is shown from the build's files", async () => {
    answer({
      "pages/start/explanation/concepts.json": pageFile(
        "start/explanation/concepts",
        "A picture.\n\n![A tenant's shape](tenant.png)\n",
      ),
    });
    show(<Screen />);
    act(() => openHelp("start/explanation/concepts"));
    const picture = (await within(panel()).findByAltText("A tenant's shape")) as HTMLImageElement;
    expect(picture.getAttribute("src")).toBe("/help/assets/start/explanation/tenant.png");
  });

  test("the terms a page lists with ::glossary, and the pages with ::pages, are listed", async () => {
    answer({
      "pages/start/explanation/concepts.json": pageFile(
        "start/explanation/concepts",
        "::glossary\n\n::pages\n",
      ),
    });
    show(<Screen />);
    act(() => openHelp("start/explanation/concepts"));
    const first = Object.values(manifest.terms as Record<string, { term: string }>)[0]
      ?.term as string;
    await within(panel()).findAllByText(first);
    expect(panel().querySelector(".vd-glossary, dl, ul")).not.toBeNull();
  });

  test("a diagram is drawn, not left as its source", async () => {
    vi.doMock("mermaid", () => ({
      default: {
        initialize: () => {},
        render: async () => ({ svg: '<svg viewBox="0 0 10 10" data-drawn="yes"></svg>' }),
      },
    }));
    answer({
      "pages/start/explanation/concepts.json": pageFile(
        "start/explanation/concepts",
        "```mermaid\ngraph TD; A-->B;\n```\n",
      ),
    });
    show(<Screen />);
    act(() => openHelp("start/explanation/concepts"));
    await waitFor(() => expect(panel().querySelector("svg[data-drawn]")).not.toBeNull(), {
      timeout: 3000,
    });
    vi.doUnmock("mermaid");
  });

  test("a search is asked of the instance's /docs first, and its answer opens the page", async () => {
    const asked: string[] = [];
    const plain = globalThis.fetch;
    const page = manifest.pages.find(
      (one: { path: string }) => one.path === "start/explanation/concepts",
    );
    vi.stubGlobal("fetch", async (address: string) => {
      if (!String(address).startsWith("/docs/_search.json")) return plain(address);
      asked.push(String(address));
      const text = JSON.stringify({
        pages: [
          {
            url: page.url,
            title: [{ text: "Concepts", hit: true }],
            crumb: "Start here",
            places: [],
          },
        ],
      });
      return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
    });
    show(<Screen />);
    act(() => openHelp("index"));
    fireEvent.change(within(panel()).getByRole("searchbox", { name: "Search the help" }), {
      target: { value: "tenant shape" },
    });
    const found = await within(panel()).findByRole("list", { name: "Pages found" });
    expect(asked).toEqual(["/docs/_search.json?q=tenant%20shape"]);
    fireEvent.click(within(found).getAllByRole("button")[0] as HTMLElement);
    await within(panel()).findByRole("heading", { level: 2, name: "Concepts" });
  });

  test("when the instance cannot answer a search, the help's own index does", async () => {
    const plain = globalThis.fetch;
    vi.stubGlobal("fetch", async (address: string) => {
      if (String(address).startsWith("/docs/")) throw new TypeError("Failed to fetch");
      return plain(address);
    });
    show(<Screen />);
    act(() => openHelp("index"));
    fireEvent.change(within(panel()).getByRole("searchbox", { name: "Search the help" }), {
      target: { value: "approval" },
    });
    await within(panel()).findByRole("list", { name: "Pages found" });
  });
});
