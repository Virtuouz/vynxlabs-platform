// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ApiError,
  type AppContext,
  appContext,
  HelpPanel,
  logoUrl,
  RunError,
  runScript,
  runStream,
  session,
  setAppContext,
  signInUrl,
  table,
  totalOf,
  useFlowRun,
  useQuery,
  useRun,
  useSession,
} from "./index.ts";

/** Stands in for the browser's EventSource: a test says what the stream sends. */
class FakeStream extends EventTarget {
  static readonly CLOSED = 2;
  static opened: FakeStream[] = [];
  readyState = 0;
  constructor(readonly url: string) {
    super();
    FakeStream.opened.push(this);
  }
  send(event: string, data: unknown = {}) {
    if (event === "ready") this.readyState = 1;
    this.dispatchEvent(new MessageEvent(event, { data: JSON.stringify(data) }));
  }
  refuse() {
    this.readyState = FakeStream.CLOSED;
    this.dispatchEvent(new Event("error"));
  }
  close() {
    this.readyState = FakeStream.CLOSED;
  }
}

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
  FakeStream.opened = [];
  vi.stubGlobal("EventSource", FakeStream);
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
  runStream.reset();
  vi.unstubAllGlobals();
  setAppContext(undefined);
  document.body.innerHTML = "";
});

test("the context is read from the element the platform puts in the page", () => {
  setAppContext(undefined);
  expect(() => appContext()).toThrow("was not served by Volvel");
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
    { status: 200, body: { items: [{ id: "1", number: "A-1" }], nextCursor: "abc" } },
    { status: 201, body: { items: [{ id: "2", number: "A-2" }] } },
    { status: 404, body: { code: "not_found", detail: "The row was not found." } },
    { status: 200, body: { id: "2", number: "A-3" } },
    { status: 204, body: null },
  ];
  // `find()` answers the rows, as a script's does; `page()` the page and the next cursor.
  const found = await orders.find({
    filter: { column: "number", op: "contains", value: "A" },
    sort: ["-number"],
    limit: 10,
  });
  expect(found.map((row) => row.number)).toEqual(["A-1"]);
  const page = await orders.page({ limit: 1, cursor: "xyz" });
  expect(page.items[0]?.number).toBe("A-1");
  expect(page.nextCursor).toBe("abc");
  expect((await orders.insert({ number: "A-2" })).id).toBe("2");
  expect(await orders.get("missing")).toBeNull();
  expect((await orders.update("2", { number: "A-3" })).number).toBe("A-3");
  await orders.delete("2");

  const base = "/api/v1/tenants/t1/workspaces/w1";
  expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
    `GET ${base}/rows/orders?filter=${encodeURIComponent('{"column":"number","op":"contains","value":"A"}')}&sort=-number&limit=10`,
    `GET ${base}/rows/orders?limit=1&cursor=xyz`,
    `POST ${base}/rows/orders`,
    `GET ${base}/row/missing/orders`,
    `PATCH ${base}/row/2/orders`,
    `DELETE ${base}/row/2/orders`,
  ]);
});

test("a table's totals are asked for by name, and come back one item a group", async () => {
  answers = [
    {
      status: 200,
      body: {
        items: [{ by: { status: "open" }, values: { count: 2, "sum:total": 30 } }],
        truncated: false,
      },
    },
    { status: 200, body: { items: [{ by: {}, values: { count: 5 } }], truncated: false } },
  ];
  const totals = await table("orders").aggregate({
    group: ["status", "created_at:month"],
    measures: ["count", "sum:total"],
    filter: { column: "total", op: "gt", value: 0 },
    sort: ["-sum:total"],
    limit: 20,
  });
  expect(totals.items[0]?.values["sum:total"]).toBe(30);
  expect(totalOf(totals, "sum:total")).toBe(30);
  expect(totalOf({ items: [{ by: {}, values: { count: null } }], truncated: false }, "count")).toBe(
    0,
  );
  expect((await table("orders").aggregate()).items[0]?.values.count).toBe(5);
  const base = "/api/v1/tenants/t1/workspaces/w1";
  expect(calls.map((call) => call.url)).toEqual([
    `${base}/aggregate/orders?group=status%2Ccreated_at%3Amonth&measure=count%2Csum%3Atotal&filter=${encodeURIComponent('{"column":"total","op":"gt","value":0}')}&sort=-sum%3Atotal&limit=20`,
    `${base}/aggregate/orders`,
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

test("with the stream open, a run's end is learned as it happens, not by looking", async () => {
  answers = [
    { status: 201, body: { id: "r1", status: "queued", output: null, error: null } },
    // Read again when the stream connects, in case something was missed.
    { status: 200, body: { id: "r1", status: "running", output: null, error: null } },
    { status: 200, body: { id: "r1", status: "succeeded", output: { total: 3 }, error: null } },
  ];
  const started = Date.now();
  const result = runScript("orders/count");
  await waitFor(() => expect(FakeStream.opened).toHaveLength(1));
  const stream = FakeStream.opened[0] as FakeStream;
  expect(stream.url).toBe("/api/v1/tenants/t1/stream");
  stream.send("ready");
  // Once connected, the wait is for the run's own change, which comes now, well before
  // the next look would be taken; a log line is not a change.
  await new Promise((resolve) => setTimeout(resolve, 50));
  stream.send("log", { k: "log", id: "r1" });
  stream.send("run", { k: "run", id: "r1", s: "succeeded" });
  expect(await result).toEqual({ total: 3 });
  expect(Date.now() - started).toBeLessThan(1000);
  expect(calls.filter((call) => call.method === "GET")).toHaveLength(2);
});

test("useRun follows a run on the stream, and looks every two seconds without one", async () => {
  answers = [
    { status: 200, body: { id: "r1", status: "running", output: null, error: null } },
    { status: 200, body: { id: "r1", status: "succeeded", output: "done", error: null } },
  ];
  function Show() {
    const run = useRun<string>("r1");
    return (
      <p>
        {run.data?.status ?? "…"} {run.live ? "live" : "polled"} {run.ended ? "ended" : ""}
      </p>
    );
  }
  render(<Show />);
  await screen.findByText(/running/);
  const stream = FakeStream.opened[0] as FakeStream;
  act(() => stream.send("ready"));
  await screen.findByText(/live/);
  answers.unshift({
    status: 200,
    body: { id: "r1", status: "running", output: null, error: null },
  });
  act(() => stream.send("run", { k: "run", id: "r1", s: "succeeded" }));
  await screen.findByText("succeeded live ended");
});

test("a refused stream leaves useFlowRun looking by itself until the flow ends", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    answers = [
      { status: 200, body: { id: "f1", flow: "orders/handle", status: "running" } },
      { status: 200, body: { id: "f1", flow: "orders/handle", status: "running" } },
      { status: 200, body: { id: "f1", flow: "orders/handle", status: "succeeded" } },
    ];
    function Show() {
      const run = useFlowRun("f1");
      return <p>{`${run.data?.status ?? "…"} ${run.live ? "live" : "polled"}`}</p>;
    }
    render(<Show />);
    await screen.findByText("running polled");
    act(() => (FakeStream.opened[0] as FakeStream).refuse());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    await screen.findByText("succeeded polled");
    const reads = calls.filter((call) => call.url.endsWith("/flow-runs/f1")).length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    // An ended flow is not looked at again.
    expect(calls.filter((call) => call.url.endsWith("/flow-runs/f1")).length).toBe(reads);
  } finally {
    vi.useRealTimers();
  }
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
          {orders.data?.map((row) => (
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

test("the logo's address is given only when the tenant has one", () => {
  setAppContext({ ...context, tenant: { ...context.tenant, logo: true } });
  expect(logoUrl()).toBe("/api/v1/tenants/t1/portal/logo");
  setAppContext({ ...context, tenant: { ...context.tenant, logo: false } });
  expect(logoUrl()).toBeNull();
  // A page from a platform that does not say still gets the address.
  setAppContext(context);
  expect(logoUrl()).toBe("/api/v1/tenants/t1/portal/logo");
});

test("an end user's groups and attributes come with who they are", async () => {
  setAppContext({
    ...context,
    principal: {
      ...context.principal,
      groups: ["front-desk", "northside"],
      attributes: { clinic: "northside" },
    },
  });
  function Who() {
    const { groups, attributes } = useSession();
    return (
      <p>
        {groups.join(" ")} / {attributes.clinic}
      </p>
    );
  }
  render(<Who />);
  expect(screen.getByText("front-desk northside / northside")).toBeTruthy();

  answers = [
    {
      status: 200,
      body: {
        principal: {
          type: "end_user",
          id: "u1",
          name: "Ed",
          email: null,
          groups: ["a"],
          attributes: {},
        },
        signUp: false,
      },
    },
  ];
  expect((await session()).principal.groups).toEqual(["a"]);
});

describe("help in an app", () => {
  const answering = (topics: unknown[], status = 200) =>
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ terms: [], resources: [], topics }), { status }),
    );
  const booking = (url: string) => ({
    topic: "desk-booking",
    page: { title: "Booking a visit", url, app: "handbook" },
  });

  test("a page with the topic opens beside the app, as its docs app serves it", async () => {
    answering([booking(`${location.origin}/apps/fernhill/main/handbook/front-desk/booking`)]);
    render(<HelpPanel topic="desk-booking" />);
    const button = await screen.findByRole("button", { name: "Help" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    const panel = screen.getByRole("complementary", { name: "Booking a visit" });
    expect(panel.querySelector("iframe")?.getAttribute("src")).toBe(
      `${location.origin}/apps/fernhill/main/handbook/front-desk/booking`,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(globalThis as unknown as Window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  test("the sheet arrives and leaves with motion, and a press outside closes it", async () => {
    answering([booking(`${location.origin}/apps/fernhill/main/handbook/front-desk/booking`)]);
    render(
      <div>
        <HelpPanel topic="desk-booking" />
        <p>The app itself</p>
      </div>,
    );
    const button = await screen.findByRole("button", { name: "Help" });
    fireEvent.click(button);
    const panel = screen.getByRole("complementary", { name: "Booking a visit" });
    expect(panel.hasAttribute("data-drawer")).toBe(true);
    // It is drawn first at its starting style, then moved to rest.
    expect(panel.hasAttribute("data-starting-style")).toBe(true);
    await waitFor(() => expect(panel.hasAttribute("data-starting-style")).toBe(false));
    // A press inside it does nothing.
    fireEvent.pointerDown(panel);
    expect(panel.hasAttribute("data-ending-style")).toBe(false);
    fireEvent.pointerDown(screen.getByText("The app itself"));
    // It stays mounted while it leaves, with the ending style, then goes.
    expect(
      screen.getByRole("complementary", { hidden: true }).hasAttribute("data-ending-style"),
    ).toBe(true);
    await waitFor(() => expect(screen.queryByRole("complementary", { hidden: true })).toBeNull());
  });

  test("its colours follow the page's theme, and its own tokens when it has them", async () => {
    answering([booking(`${location.origin}/apps/fernhill/main/handbook/front-desk/booking`)]);
    render(<HelpPanel topic="desk-booking" />);
    fireEvent.click(await screen.findByRole("button", { name: "Help" }));
    const panel = screen.getByRole("complementary", { name: "Booking a visit" });
    expect(panel.style.background).toContain("var(--vx-surface");
    expect(panel.style.background).toContain("light-dark(");
    expect(panel.style.colorScheme).toBe("light dark");
  });

  test("documentation served at another address is linked to, since it cannot be shown inside", async () => {
    answering([booking("https://docs.fernhill.example/front-desk/booking")]);
    render(<HelpPanel topic="desk-booking">How to book</HelpPanel>);
    const link = await screen.findByRole("link", { name: "How to book" });
    expect(link.getAttribute("href")).toBe("https://docs.fernhill.example/front-desk/booking");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  test("nothing is drawn when no page has the topic, the person may not read it, or it cannot be asked", async () => {
    answering([]);
    const { container, unmount } = render(<HelpPanel topic="desk-booking" />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
    unmount();
    answering([], 403);
    const refused = render(<HelpPanel topic="desk-booking" />);
    await act(async () => {});
    expect(refused.container.innerHTML).toBe("");
  });
});

describe("a page of an app written as code, sandboxed (decision 0008)", () => {
  const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const seen: { url: string; init: RequestInit }[] = [];
  const respond = (reply: (url: string, init: RequestInit) => Response) => {
    seen.length = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      seen.push({ url, init });
      return reply(url, init);
    });
  };
  const header = (init: RequestInit, name: string) =>
    (init.headers as Record<string, string> | undefined)?.[name];

  test("calls the API with its token, and never with a cookie", async () => {
    setAppContext({ ...context, token: { token: "vxa_one", expiresAt: later(10) } });
    respond(() => Response.json({ principal: context.principal, signUp: false }));
    await session();
    expect(seen).toHaveLength(1);
    expect(header(seen[0]?.init as RequestInit, "authorization")).toBe("Bearer vxa_one");
    expect(seen[0]?.init.credentials).toBe("omit");
  });

  test("a page with no one signed in sends nothing, and still no cookie", async () => {
    setAppContext({ ...context, token: null });
    respond(() => Response.json({}));
    await session();
    expect(header(seen[0]?.init as RequestInit, "authorization")).toBeUndefined();
    expect(seen[0]?.init.credentials).toBe("omit");
  });

  test("an app made in the console has no token, and sends its cookie as before", async () => {
    respond(() => Response.json({}));
    await session();
    expect(seen[0]?.init.credentials).toBe("same-origin");
  });

  test("a token about to end is renewed first, once for calls made together", async () => {
    setAppContext({ ...context, token: { token: "vxa_old", expiresAt: later(1) } });
    respond((url) =>
      url.endsWith("/app-token")
        ? Response.json({ token: "vxa_new", expiresAt: later(10) })
        : Response.json({}),
    );
    await Promise.all([session(), session()]);
    const renewals = seen.filter((one) => one.url.endsWith("/app-token"));
    expect(renewals).toHaveLength(1);
    expect(header(renewals[0]?.init as RequestInit, "authorization")).toBe("Bearer vxa_old");
    const others = seen.filter((one) => !one.url.endsWith("/app-token"));
    expect(others.map((one) => header(one.init, "authorization"))).toEqual([
      "Bearer vxa_new",
      "Bearer vxa_new",
    ]);
    expect(appContext().token?.token).toBe("vxa_new");
  });

  test("a token refused while the page slept is renewed and the call made once more", async () => {
    setAppContext({ ...context, token: { token: "vxa_slept", expiresAt: later(10) } });
    let first = true;
    respond((url) => {
      if (url.endsWith("/app-token"))
        return Response.json({ token: "vxa_woke", expiresAt: later(10) });
      if (first) {
        first = false;
        return Response.json({ code: "unauthenticated" }, { status: 401 });
      }
      return Response.json({ principal: context.principal, signUp: true });
    });
    expect((await session()).signUp).toBe(true);
    expect(header(seen.at(-1)?.init as RequestInit, "authorization")).toBe("Bearer vxa_woke");
  });

  test("a sign-in that has ended is said, not hidden", async () => {
    setAppContext({ ...context, token: { token: "vxa_gone", expiresAt: later(10) } });
    respond(() =>
      Response.json({ code: "unauthenticated", detail: "Open the page again." }, { status: 401 }),
    );
    await expect(session()).rejects.toMatchObject({ status: 401 });
  });

  test("the run stream is read with fetch and the token, not with an EventSource", async () => {
    setAppContext({ ...context, token: { token: "vxa_stream", expiresAt: later(10) } });
    const encoder = new TextEncoder();
    let push: ((text: string) => void) | undefined;
    respond(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              push = (text) => controller.enqueue(encoder.encode(text));
            },
          }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
    );
    const heard: unknown[] = [];
    const stop = runStream.listen("r1", (change) => heard.push(change));
    await waitFor(() => expect(push).toBeDefined());
    expect(FakeStream.opened).toHaveLength(0);
    expect(seen[0]?.url).toBe("/api/v1/tenants/t1/stream");
    expect(header(seen[0]?.init as RequestInit, "authorization")).toBe("Bearer vxa_stream");
    expect(seen[0]?.init.credentials).toBe("omit");
    push?.("retry: 3000\n\nid: 1\nevent: ready\ndata: {}\n\n");
    push?.(': ping\n\nid: 2\nevent: run\ndata: {"k":"run","id":"r1","s":"succeeded"}\n\n');
    await waitFor(() => expect(heard).toEqual(["refresh", { k: "run", id: "r1", s: "succeeded" }]));
    expect(runStream.connected).toBe(true);
    stop();
  });
});
