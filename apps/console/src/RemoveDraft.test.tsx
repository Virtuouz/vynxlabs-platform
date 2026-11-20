// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RemoveDraftButton, removeWords } from "./kit/RemoveDraftButton.tsx";
import { FlowEditor } from "./screens/FlowEditor.tsx";
import { Flows } from "./screens/Flows.tsx";
import { Interfaces } from "./screens/Interfaces.tsx";
import { Queries } from "./screens/Queries.tsx";
import { answer, show } from "./testing.tsx";

configure({ asyncUtilTimeout: 5000 });

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];
let routes: Record<string, (body: unknown) => [number, unknown]>;

beforeEach(() => {
  calls = [];
  routes = {};
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const path = address.split("?")[0] as string;
    calls.push({ method, url: path, body });
    const [status, reply] = routes[`${method} ${path}`]?.(body) ?? [
      method === "GET" ? 200 : 204,
      method === "GET" ? { items: [] } : null,
    ];
    return new Response(reply === null ? null : JSON.stringify(reply), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sent = (method: string) => calls.filter((call) => call.method === method);

describe("RemoveDraftButton", () => {
  test("a deployed resource is removed as a draft that removes it, after saying what that does", async () => {
    const done = vi.fn();
    show(
      <RemoveDraftButton
        root={root}
        kind="script"
        path="a/b"
        noun="script"
        state="deployed"
        onDone={done}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const said = await answer("Remove");
    expect(said).toContain("Remove this script?");
    expect(said).toContain("Nothing changes until that draft is deployed");
    await waitFor(() => expect(done).toHaveBeenCalledWith("removed"));
    expect(sent("PUT")).toEqual([
      {
        method: "PUT",
        url: `${api}/drafts/a/b`,
        body: { kind: "script", schemaVersion: 1, body: {}, deleted: true },
      },
    ]);
  });

  test("a draft is discarded, with what goes along with it", async () => {
    const done = vi.fn();
    show(
      <RemoveDraftButton
        root={root}
        kind="interface"
        path="screens/shop"
        noun="app"
        state="draft"
        also={[{ kind: "app", path: "shop" }]}
        onDone={done}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(await answer("Discard")).toContain("goes back to how it was last deployed");
    await waitFor(() => expect(done).toHaveBeenCalledWith("discarded"));
    expect(sent("DELETE").map((call) => call.url)).toEqual([
      `${api}/drafts/screens/shop`,
      `${api}/drafts/shop`,
    ]);
  });

  test("what goes along that has nothing to act on is not a failure", async () => {
    routes[`DELETE ${api}/drafts/shop`] = () => [404, { code: "not_found", detail: "No draft." }];
    const done = vi.fn();
    show(
      <RemoveDraftButton
        root={root}
        kind="interface"
        path="screens/shop"
        noun="app"
        state="draft"
        also={[{ kind: "app", path: "shop" }]}
        onDone={done}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    await answer("Discard");
    await waitFor(() => expect(done).toHaveBeenCalledWith("discarded"));
  });

  test("a removal is taken back by throwing away its draft", async () => {
    const done = vi.fn();
    show(
      <RemoveDraftButton
        root={root}
        kind="flow"
        path="orders/sync"
        noun="flow"
        state="removed"
        onDone={done}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep this flow" }));
    expect(await answer("Keep")).toContain("stays as it was last deployed");
    await waitFor(() => expect(done).toHaveBeenCalledWith("kept"));
    expect(sent("DELETE").map((call) => call.url)).toEqual([`${api}/drafts/orders/sync`]);
    expect(sent("PUT")).toEqual([]);
  });

  test("nothing is done when the person says no", async () => {
    const done = vi.fn();
    show(
      <RemoveDraftButton
        root={root}
        kind="flow"
        path="orders/sync"
        noun="flow"
        state="deployed"
        onDone={done}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await answer("Cancel");
    expect(done).not.toHaveBeenCalled();
    expect(sent("PUT")).toEqual([]);
  });

  test("its words tell a draft, a removal and a deployed one apart", () => {
    expect(removeWords("draft", "flow").action).toBe("Discard");
    expect(removeWords("removed", "flow").action).toBe("Keep");
    expect(removeWords("deployed", "flow", "More.").text).toContain("More.");
  });
});

describe("where it is used", () => {
  test("the flows list's inspector removes a flow, and keeps one that is drafted for removal", async () => {
    const row = (path: string, draft: "changed" | "removed" | null) => ({
      path,
      description: "",
      nodeCount: 2,
      triggers: [],
      lastRun: null,
      version: 1,
      draft,
      starts: [],
      runs: { lastDay: 0, failedLastDay: 0, waiting: 0 },
    });
    routes[`GET ${api}/flows`] = () => [
      200,
      { items: [row("orders/sync", null), row("orders/old", "removed")] },
    ];
    history.replaceState(null, "", "/?item=orders/sync");
    show(<Flows root={root} link={link} editable />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await answer("Remove");
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]).toMatchObject({
      url: `${api}/drafts/orders/sync`,
      body: { kind: "flow", deleted: true },
    });
    cleanup();
    history.replaceState(null, "", "/?item=orders/old");
    show(<Flows root={root} link={link} editable />);
    fireEvent.click(await screen.findByRole("button", { name: "Keep this flow" }));
    await answer("Keep");
    await waitFor(() =>
      expect(sent("DELETE").map((call) => call.url)).toContain(`${api}/drafts/orders/old`),
    );
  });

  test("the App Builder removes an app with the interface and the app that serves it", async () => {
    routes[`GET ${api}/interfaces`] = () => [
      200,
      {
        items: [
          {
            path: "screens/shop",
            title: "Shop",
            deployed: true,
            draft: false,
            removing: false,
            app: "shop",
            pages: 1,
          },
        ],
      },
    ];
    routes[`GET ${api}/apps`] = () => [200, { items: [] }];
    show(<Interfaces root={root} link={link} editable />);
    const table = await screen.findByRole("table", { name: "Apps" }).catch(() => undefined);
    fireEvent.click(
      await (table ? within(table) : screen).findByRole("button", { name: "Remove" }),
    );
    expect(await answer("Remove")).toContain("stops serving it");
    await waitFor(() => expect(sent("PUT")).toHaveLength(2));
    expect(sent("PUT").map((call) => [call.url, (call.body as { kind: string }).kind])).toEqual([
      [`${api}/drafts/screens/shop`, "interface"],
      [`${api}/drafts/shop`, "app"],
    ]);
  });

  test("Queries removes a saved query beside Save, and keeps one drafted for removal", async () => {
    routes[`GET ${api}/queries/schema`] = () => [200, { tables: [], functions: [], maySql: true }];
    routes[`GET ${api}/queries`] = () => [
      200,
      {
        items: [
          {
            path: "reports/fees",
            description: "",
            sql: "select 1",
            parameters: [],
            ownership: "ui",
            draft: null,
          },
          {
            path: "reports/old",
            description: "",
            sql: "select 2",
            parameters: [],
            ownership: "ui",
            draft: "removed",
          },
        ],
      },
    ];
    history.replaceState(null, "", "/?query=reports/fees");
    show(<Queries root={root} link={link} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await answer("Remove");
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]).toMatchObject({
      url: `${api}/drafts/reports/fees`,
      body: { kind: "query", deleted: true },
    });
    cleanup();
    history.replaceState(null, "", "/?query=reports/old");
    show(<Queries root={root} link={link} />);
    fireEvent.click(await screen.findByRole("button", { name: "Keep this query" }));
    await answer("Keep");
    await waitFor(() =>
      expect(sent("DELETE").map((call) => call.url)).toContain(`${api}/drafts/reports/old`),
    );
  });

  test("the flow editor removes a deployed flow, as the script editor does", async () => {
    routes[`GET ${api}/drafts/orders/sync`] = () => [404, { code: "not_found", detail: "none" }];
    routes[`GET ${api}/resources/orders/sync`] = () => [
      200,
      {
        ownership: "ui",
        body: { nodes: { start: { type: "trigger", trigger: { type: "manual" } } }, edges: [] },
      },
    ];
    show(<FlowEditor root={root} link={link} path="orders/sync" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await answer("Remove");
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]).toMatchObject({
      url: `${api}/drafts/orders/sync`,
      body: { kind: "flow", deleted: true },
    });
  });
});
