// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Interfaces } from "./screens/Interfaces.tsx";
import { Queries } from "./screens/Queries.tsx";
import { answer, show } from "./testing.tsx";

configure({ asyncUtilTimeout: 15_000 });

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
const sent = (method: string) =>
  calls.filter((call) => call.method === method && !call.url.includes("/me/preferences"));

const listed = (over: object) => ({
  path: "reports/fees",
  description: "",
  sql: "select 1",
  parameters: [],
  ownership: "ui",
  draft: null,
  ...over,
});

describe("Queries save on the draft they opened", () => {
  test("a drafted query opens with its draft's text and parameters, and Save sends its revision and keeps `required` (DAT-06, DAT-07)", async () => {
    routes[`GET ${api}/queries/schema`] = () => [200, { tables: [], functions: [], maySql: true }];
    routes[`GET ${api}/queries`] = () => [
      200,
      { items: [listed({ draft: "changed", sql: "select 1 where a = $1" })] },
    ];
    routes[`GET ${api}/drafts/reports/fees`] = () => [
      200,
      {
        path: "reports/fees",
        kind: "query",
        revision: 4,
        deleted: false,
        body: {
          sql: "select 2 where a = $1",
          parameters: [{ name: "limit", type: "integer", required: true, label: "Limit" }],
        },
      },
    ];
    routes[`PUT ${api}/drafts/reports/fees`] = () => [200, { revision: 5 }];
    history.replaceState(null, "", "/?query=reports/fees");
    show(<Queries root={root} link={link} />);
    // The draft's text is what is edited, not the deployed one.
    await waitFor(() => expect(document.body.textContent).toContain("Limit"));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]?.body).toMatchObject({
      kind: "query",
      revision: 4,
      body: { parameters: [{ name: "limit", type: "integer", required: true, label: "Limit" }] },
    });
  });

  test("a discarded draft puts the deployed text back, and the next save is a first draft (DAT-08)", async () => {
    let discarded = false;
    routes[`GET ${api}/queries/schema`] = () => [200, { tables: [], functions: [], maySql: true }];
    routes[`GET ${api}/queries`] = () => [
      200,
      { items: [listed(discarded ? {} : { draft: "changed" })] },
    ];
    routes[`GET ${api}/drafts/reports/fees`] = () =>
      discarded
        ? [404, { code: "not_found", detail: "none" }]
        : [
            200,
            {
              path: "reports/fees",
              kind: "query",
              revision: 3,
              deleted: false,
              body: { sql: "select 99" },
            },
          ];
    routes[`DELETE ${api}/drafts/reports/fees`] = () => {
      discarded = true;
      return [204, null];
    };
    routes[`PUT ${api}/drafts/reports/fees`] = () => [200, { revision: 1 }];
    history.replaceState(null, "", "/?query=reports/fees");
    show(<Queries root={root} link={link} />);
    const box = (await screen.findByLabelText("The query")) as HTMLTextAreaElement;
    // It opens as its draft, not as what is deployed.
    await waitFor(() => expect(box.value).toBe("select 99"));
    fireEvent.change(box, { target: { value: "select 99 -- typed since" } });
    fireEvent.click(await screen.findByRole("button", { name: "Discard draft" }));
    await answer("Discard");
    // The discarded text is gone from the editor: it shows the query as deployed again.
    await waitFor(() => expect(box.value).toBe("select 1"));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]?.body).toMatchObject({ body: { sql: "select 1" } });
    expect(sent("PUT")[0]?.body).not.toHaveProperty("revision");
  });
});

describe("the app list", () => {
  test("an app with unpublished edits can have only them discarded, and says who sees a draft (BLD-09, BLD-13)", async () => {
    routes[`GET ${api}/interfaces`] = () => [
      200,
      {
        items: [
          {
            path: "screens/shop",
            title: "Shop",
            deployed: true,
            draft: true,
            ownership: "console",
            app: "shop",
            version: 1,
          },
        ],
      },
    ];
    show(<Interfaces root={root} link={link} editable />);
    fireEvent.click(await screen.findByRole("button", { name: "Discard draft" }));
    expect(await answer("Discard")).toContain("goes back to how it was last deployed");
    await waitFor(() =>
      expect(sent("DELETE").map((call) => call.url)).toContain(`${api}/drafts/screens/shop`),
    );
    expect(sent("PUT")).toEqual([]);
    fireEvent.click(await screen.findByRole("button", { name: "Make an app" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Other builders of this workspace see the draft/)).toBeTruthy();
  });
});
