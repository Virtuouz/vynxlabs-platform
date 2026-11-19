// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Dialog } from "@volvel/ui";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PageHeader } from "../kit/PageHeader.tsx";
import { SHORTCUTS } from "../kit/shortcuts.ts";
import {
  EDITORS,
  INSTANCE_SECTIONS,
  TENANT_SECTIONS,
  WORKSPACE_SECTIONS,
  whereIs,
} from "../nav.ts";
import { show } from "../testing.tsx";
import { forgetHelp } from "./content.ts";
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
beforeEach(() => {
  width = 1440;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
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
  return <output>{`${topic ?? "none"}|${target ?? "page"}|${open ? "open" : "closed"}`}</output>;
}
const told = () => screen.getByRole("status", { hidden: true }).textContent;

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
    ["/t/acme/workspaces/dev/dashboards/sales", "data-dashboards-editor"],
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
    expect(pageFor(manifest, "data-tables")).toEqual({ path: "data/tables" });
    expect(pageFor(manifest, "start/concepts#resources")).toEqual({
      path: "start/concepts",
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
          <HelpTopic topic="start/concepts" />
        </Dialog>
      </>,
    );
    expect(told()).toBe("start/concepts|page|closed");
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
    act(() => openHelp("start/concepts"));
    expect(told()).toBe("data-tables|start/concepts|open");
    act(() => closeHelp());
    act(() => openHelp());
    expect(told()).toBe("data-tables|start/concepts|open");
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
    expect(panel().className).toContain("fixed inset-0");
  });

  test("Escape closes it from inside", async () => {
    show(<Screen />);
    act(() => openHelp("data-tables"));
    fireEvent.keyDown(within(panel()).getByRole("heading"), { key: "Escape" });
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

test("help is on F1 everywhere, a field included, and on ⌘/", () => {
  expect(SHORTCUTS.help.keys).toEqual(["F1", "Mod+/"]);
});
