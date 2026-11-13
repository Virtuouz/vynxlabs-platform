// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ApiError,
  type AppContext,
  appContext,
  RunError,
  runScript,
  setAppContext,
  signInUrl,
  table,
  useQuery,
  useSession,
} from "./index.ts";

const context: AppContext = {
  api: "/api/v1",
  tenant: { id: "t1", slug: "acme", name: "Acme" },
  workspace: { id: "w1", slug: "main" },
  app: { path: "portal", title: "Orders" },
  base: "/apps/acme/main/portal/",
  portal: "/portal/acme",
  principal: { type: "end_user", id: "u1", name: "Ed", email: "ed@customer.example" },
};

const calls: { method: string; url: string; body: unknown }[] = [];
let answers: { status: number; body: unknown }[] = [];

beforeEach(() => {
  setAppContext(context);
  calls.length = 0;
  answers = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({
      method: init.method ?? "GET",
      url,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const answer = answers.shift() ?? { status: 200, body: {} };
    return new Response(answer.body === null ? "" : JSON.stringify(answer.body), {
      status: answer.status,
    });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAppContext(undefined);
  document.body.innerHTML = "";
});

test("the context is read from the element the platform puts in the page", () => {
  setAppContext(undefined);
  expect(() => appContext()).toThrow("was not served by the platform");
  document.body.innerHTML = `<script type="application/json" id="vx-context">${JSON.stringify(context)}</script>`;
  expect(appContext().tenant.slug).toBe("acme");
});

test("a table reads and writes rows through the public API", async () => {
  interface Order {
    readonly __row?: { id: string; number: string };
    readonly __insert?: { number: string };
  }
  const orders = table<Order>("orders");
  answers = [
    { status: 200, body: { items: [{ id: "1", number: "A-1" }], nextCursor: "abc" } },
    { status: 201, body: { items: [{ id: "2", number: "A-2" }] } },
    { status: 404, body: { code: "not_found", detail: "The row was not found." } },
    { status: 200, body: { id: "2", number: "A-3" } },
    { status: 204, body: null },
  ];
  const page = await orders.find({
    filter: { column: "number", op: "contains", value: "A" },
    sort: ["-number"],
    limit: 10,
  });
  expect(page.items[0]?.number).toBe("A-1");
  expect(page.nextCursor).toBe("abc");
  expect((await orders.insert({ number: "A-2" })).id).toBe("2");
  expect(await orders.get("missing")).toBeNull();
  expect((await orders.update("2", { number: "A-3" })).number).toBe("A-3");
  await orders.delete("2");

  const base = "/api/v1/tenants/t1/workspaces/w1";
  expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
    `GET ${base}/rows/orders?filter=${encodeURIComponent('{"column":"number","op":"contains","value":"A"}')}&sort=-number&limit=10`,
    `POST ${base}/rows/orders`,
    `GET ${base}/row/missing/orders`,
    `PATCH ${base}/row/2/orders`,
    `DELETE ${base}/row/2/orders`,
  ]);
});

test("a refusal carries the server's code and its problems by field", async () => {
  answers = [
    {
      status: 400,
      body: {
        code: "validation_failed",
        detail: "The row is not valid.",
        errors: [{ path: "/number", message: "is required" }],
      },
    },
  ];
  const error = await table("orders")
    .insert({})
    .catch((caught) => caught);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 400,
    code: "validation_failed",
    message: "The row is not valid.",
  });
  expect(error.errors).toEqual([{ path: "/number", message: "is required" }]);
});

test("a script is started and waited for, and a failed run is an error", async () => {
  answers = [
    { status: 201, body: { id: "r1", status: "queued", output: null, error: null } },
    { status: 200, body: { id: "r1", status: "running", output: null, error: null } },
    { status: 200, body: { id: "r1", status: "succeeded", output: { total: 3 }, error: null } },
  ];
  expect(await runScript<{ total: number }>("orders/count", { since: "today" })).toEqual({
    total: 3,
  });
  expect(calls[0]).toMatchObject({
    method: "POST",
    url: "/api/v1/tenants/t1/workspaces/w1/runs",
    body: { script: "orders/count", input: { since: "today" } },
  });
  expect(calls[2]?.url).toBe("/api/v1/tenants/t1/workspaces/w1/runs/r1");

  answers = [
    {
      status: 201,
      body: { id: "r2", status: "failed", output: null, error: { message: "No stock." } },
    },
  ];
  await expect(runScript("orders/place")).rejects.toThrow(RunError);
});

test("the sign-in address sends the person back to where they were", () => {
  expect(signInUrl("/apps/acme/main/portal/orders/7?tab=2")).toBe(
    "/portal/acme/sign-in?return=%2Fapps%2Facme%2Fmain%2Fportal%2Forders%2F7%3Ftab%3D2",
  );
});

test("useQuery loads, reloads, and useSession starts from who the page was served to", async () => {
  answers = [
    { status: 200, body: { items: [{ id: "1", number: "A-1" }], nextCursor: null } },
    {
      status: 200,
      body: {
        items: [
          { id: "1", number: "A-1" },
          { id: "2", number: "A-2" },
        ],
        nextCursor: null,
      },
    },
  ];
  function Orders() {
    const { principal, signedIn } = useSession();
    const orders = useQuery(() => table("orders").find(), []);
    return (
      <div>
        <p>{signedIn ? `Hello ${principal.name}` : "Hello stranger"}</p>
        {orders.loading && !orders.data ? <p>Loading</p> : null}
        <ul>
          {orders.data?.items.map((row) => (
            <li key={String(row.id)}>{String(row.number)}</li>
          ))}
        </ul>
        <button type="button" onClick={orders.reload}>
          Again
        </button>
      </div>
    );
  }
  render(<Orders />);
  expect(screen.getByText("Hello Ed")).toBeTruthy();
  expect(screen.getByText("Loading")).toBeTruthy();
  await screen.findByText("A-1");
  screen.getByText("Again").click();
  await waitFor(() => expect(screen.getByText("A-2")).toBeTruthy());
});

describe("flows", () => {
  test("startFlow returns at once, and runFlow waits for what the flow gives", async () => {
    const { runFlow, startFlow, flowRun, FlowRunError } = await import("./client.ts");
    const calls: { method: string; url: string; body: unknown }[] = [];
    let reads = 0;
    let ending: "succeeded" | "failed" = "succeeded";
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body ? JSON.parse(init.body as string) : undefined });
      const run =
        method === "POST" || ++reads < 2
          ? { id: "f1", flow: "orders/handle", status: "running" }
          : ending === "succeeded"
            ? { id: "f1", flow: "orders/handle", status: "succeeded", output: { sent: true } }
            : { id: "f1", flow: "orders/handle", status: "failed", error: { message: "Refused." } };
      return new Response(JSON.stringify(run), { status: method === "POST" ? 201 : 200 });
    });
    const started = await startFlow("orders/handle", { id: "1" }, { idempotencyKey: "k1" });
    expect(started).toMatchObject({ id: "f1", status: "running" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      body: { flow: "orders/handle", input: { id: "1" }, idempotencyKey: "k1" },
    });
    expect(calls[0]?.url).toMatch(/\/flow-runs$/);
    expect((await flowRun("f1")).status).toBe("running");

    expect(await runFlow("orders/handle", { id: "1" })).toEqual({ sent: true });
    reads = 0;
    ending = "failed";
    await expect(runFlow("orders/handle")).rejects.toThrow(FlowRunError);
    reads = 0;
    await expect(runFlow("orders/handle")).rejects.toThrow("Refused.");
  });
});
