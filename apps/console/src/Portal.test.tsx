// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Apps } from "./screens/Apps.tsx";
import { Branding, KIT, THEME_TOKENS } from "./screens/Branding.tsx";
import { Domains } from "./screens/Domains.tsx";
import { EndUsers } from "./screens/EndUsers.tsx";
import { refreshTenantTheme, useTenantTheme } from "./theme.ts";

configure({ asyncUtilTimeout: 5000 });

const base = "/tenants/t1";
let calls: { method: string; url: string; body: unknown; headers: Record<string, string> }[];
let routes: Record<string, (body: unknown) => [number, unknown]>;

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const url = new URL(address, "http://console.test");
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({
      method,
      url: `${url.pathname}${url.search}`,
      body,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    const handler = routes[`${method} ${url.pathname}`];
    const [status, answer] = handler
      ? handler(body)
      : [404, { status: 404, detail: `No mock for ${method} ${url.pathname}` }];
    return new Response(answer === null ? null : JSON.stringify(answer), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const sent = (method: string) => calls.filter((call) => call.method === method);

// ----- Apps -----

test("the apps of a workspace are listed with their addresses and who they are open to", async () => {
  routes[`GET /api/v1${base}/workspaces/w1/apps`] = () => [
    200,
    {
      items: [
        {
          id: "a1",
          path: "portal/orders",
          title: "Orders",
          description: "Customers follow their orders.",
          url: "https://apps.example.test/apps/acme/main/portal/orders/",
          domains: [
            { hostname: "orders.acme.example", url: "https://orders.acme.example/", enabled: true },
            { hostname: "old.acme.example", url: "https://old.acme.example/", enabled: false },
          ],
          files: 12,
          bytes: 348160,
          access: ["every end user", "Finance team"],
        },
        {
          id: "a2",
          path: "back-office",
          title: "Back office",
          description: null,
          url: "https://apps.example.test/apps/acme/main/back-office/",
          domains: [],
          files: 1,
          bytes: 900,
          access: [],
        },
      ],
    },
  ];
  render(<Apps root={`${base}/workspaces/w1`} />);
  const address = await screen.findByRole("link", {
    name: "https://apps.example.test/apps/acme/main/portal/orders/",
  });
  expect(address.getAttribute("target")).toBe("_blank");
  expect(screen.getByRole("link", { name: "orders.acme.example" }).getAttribute("href")).toBe(
    "https://orders.acme.example/",
  );
  // A hostname that is not enabled serves nothing, so it is not offered as a link.
  expect(screen.queryByRole("link", { name: "old.acme.example" })).toBeNull();
  const page = document.body.textContent ?? "";
  expect(page).toContain("Customers follow their orders.");
  expect(page).toContain("12 files, 340 KB");
  expect(page).toContain("1 file, 900 B");
  expect(page).toContain("every end user, Finance team");
  expect(page).toContain("Only staff whose role lets them read this workspace");
});

test("a workspace with no apps says where apps come from", async () => {
  routes[`GET /api/v1${base}/workspaces/w1/apps`] = () => [200, { items: [] }];
  render(<Apps root={`${base}/workspaces/w1`} />);
  await screen.findByText("No apps yet");
  expect(document.body.textContent).toContain("defineApp");
});

// ----- End users -----

const ada = {
  id: "u1",
  email: "ada@customer.example",
  name: "Ada",
  hasPassword: true,
  disabled: false,
  lastSignedInAt: "2026-11-10T09:00:00.000Z",
  createdAt: "2026-11-01T00:00:00.000Z",
};
const grace = { ...ada, id: "u2", email: "grace@customer.example", name: "Grace" };
const invited = { ...grace, hasPassword: false, lastSignedInAt: null as string | null };

test("inviting an end user shows the link once, and says to pass it on when no mail is sent", async () => {
  let users: (typeof invited)[] = [ada];
  routes[`GET /api/v1${base}/end-users`] = () => [200, { items: users, nextCursor: null }];
  routes[`POST /api/v1${base}/end-users`] = () => {
    users = [ada, invited];
    return [
      201,
      {
        endUser: invited,
        invitation: {
          url: "https://apps.example.test/portal/acme/invitation?token=abc",
          expiresAt: "2026-11-19T00:00:00.000Z",
          emailed: false,
        },
      },
    ];
  };
  render(<EndUsers base={base} />);
  await screen.findByText("ada@customer.example");
  expect(screen.getByText("Active")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Invite an end user" }));
  const form = (await screen.findByRole("dialog")).querySelector("form") as HTMLFormElement;
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: "grace@customer.example" } });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(screen.getByRole("dialog").textContent).toContain(
      "https://apps.example.test/portal/acme/invitation?token=abc",
    ),
  );
  // No name was typed, so none is sent.
  expect(sent("POST")[0]?.body).toEqual({ email: "grace@customer.example" });
  const dialog = screen.getByRole("dialog").textContent ?? "";
  expect(dialog).toContain("This instance sends no mail, so pass the link on yourself.");
  expect(dialog).toContain("It works once");
  expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  await screen.findByText("Invited");
});

test("a link that was emailed says so, and the search is sent to the server", async () => {
  routes[`GET /api/v1${base}/end-users`] = () => [200, { items: [ada], nextCursor: null }];
  routes[`POST /api/v1${base}/end-users/u1/links`] = () => [
    201,
    {
      url: "https://apps.example.test/portal/acme/reset?token=def",
      expiresAt: "2026-11-13T00:00:00.000Z",
      emailed: true,
    },
  ];
  render(<EndUsers base={base} />);
  fireEvent.click(await screen.findByText("Actions"));
  // Ada has a password, so she is offered a reset and not a new invitation.
  expect(screen.queryByText("New invitation link")).toBeNull();
  fireEvent.click(await screen.findByText("Password reset link"));
  await waitFor(() =>
    expect(screen.getByRole("dialog").textContent).toContain("It was also emailed to them."),
  );
  expect(sent("POST")[0]?.body).toEqual({ purpose: "reset" });

  fireEvent.input(screen.getByLabelText("Search by email or name"), { target: { value: "ada" } });
  await waitFor(() =>
    expect(calls.at(-1)?.url).toBe(`/api/v1${base}/end-users?limit=50&search=ada`),
  );
});

test("an end user is disabled and deleted through their own routes, and deleting asks first", async () => {
  let users = [ada];
  routes[`GET /api/v1${base}/end-users`] = () => [200, { items: users, nextCursor: null }];
  routes[`PATCH /api/v1${base}/end-users/u1`] = (body) => {
    users = [{ ...ada, ...(body as { disabled: boolean }) }];
    return [200, users[0]];
  };
  routes[`DELETE /api/v1${base}/end-users/u1`] = () => {
    users = [];
    return [204, null];
  };
  const confirm = vi.fn((_question: string) => false);
  vi.stubGlobal("confirm", confirm);
  render(<EndUsers base={base} />);
  fireEvent.click(await screen.findByText("Actions"));
  fireEvent.click(await screen.findByText("Disable"));
  await screen.findByText("Disabled");
  expect(sent("PATCH")[0]?.url).toBe(`/api/v1${base}/end-users/u1`);
  expect(sent("PATCH")[0]?.body).toEqual({ disabled: true });

  // A disabled account is offered no link, and can be enabled again.
  fireEvent.click(screen.getByText("Actions"));
  await screen.findByText("Enable");
  expect(screen.queryByText("Password reset link")).toBeNull();

  fireEvent.click(screen.getByText("Delete"));
  expect(confirm.mock.calls[0]?.[0]).toContain("Their rows in tables are kept.");
  expect(sent("DELETE")).toHaveLength(0);

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByText("Actions"));
  fireEvent.click(await screen.findByText("Delete"));
  await screen.findByText("No end users yet");
  expect(sent("DELETE")[0]?.url).toBe(`/api/v1${base}/end-users/u1`);
});

// ----- Branding -----

const portal = {
  signUp: false,
  theme: { tokens: { action: "#7c3aed" }, dark: {} },
  logo: false,
  mail: false,
  portalUrl: "https://apps.example.test/portal/acme/",
};

test("the kit's values written in the console are the ones in the kit's stylesheet", () => {
  const stylesheet = readFileSync(
    join(import.meta.dirname, "../../../packages/ui/src/tokens.css"),
    "utf8",
  );
  // The first `:root` block holds the light values, the second the dark ones.
  const [tokens, dark] = [...stylesheet.matchAll(/:root\s*\{([^}]*)\}/g)].map((block) =>
    Object.fromEntries(
      [...(block[1] ?? "").matchAll(/--vx-([a-z-]+):\s*([^;]+);/g)].map((line) => [
        line[1],
        line[2]?.trim(),
      ]),
    ),
  );
  expect(KIT).toEqual({ tokens, dark });
  expect(Object.keys(KIT.tokens)).toEqual(THEME_TOKENS);
});

test("branding saves only the tokens that are set, and shows the server's error on its field", async () => {
  routes[`GET /api/v1${base}/portal`] = () => [200, portal];
  routes[`PUT /api/v1${base}/portal`] = (body) => {
    const { theme } = body as { theme: { tokens: Record<string, string> } };
    return theme.tokens.surface === "url(x)"
      ? [
          400,
          {
            status: 400,
            code: "bad_request",
            detail: "That is not a theme.",
            errors: [
              { path: "/tokens/surface", message: "must be a plain colour, length or font list" },
            ],
          },
        ]
      : [200, { ...portal, theme }];
  };
  render(<Branding base={base} tenantId="t1" />);
  const action = (await screen.findByLabelText("action, light")) as HTMLInputElement;
  expect(action.value).toBe("#7c3aed");
  expect(action.placeholder).toBe("kit default");
  expect(screen.getAllByRole("textbox", { name: /, light$/ })).toHaveLength(THEME_TOKENS.length);
  expect(screen.getByRole("link", { name: portal.portalUrl })).toBeTruthy();
  expect(document.body.textContent).toContain("This instance sends no mail");
  // An override shows in its swatch, and an empty field shows the kit's own value.
  const swatch = (name: string) =>
    (document.querySelector(`[data-swatch="${name}"]`) as HTMLElement).style.background;
  expect(swatch("tokens-action")).toBe("#7c3aed");
  expect(swatch("tokens-surface")).toBe("#ffffff");
  expect(swatch("dark-surface")).toBe("#18212d");
  // The preview carries every value: the kit's, with what is typed over it.
  const preview = (scheme: string) =>
    (document.querySelector(`[data-preview="${scheme}"]`) as HTMLElement).style;
  expect(preview("light").getPropertyValue("--vx-action")).toBe("#7c3aed");
  expect(preview("dark").getPropertyValue("--vx-action")).toBe("#5cb8d6");

  fireEvent.input(screen.getByLabelText("surface, light"), { target: { value: "url(x)" } });
  fireEvent.input(screen.getByLabelText("ink, dark"), { target: { value: " #fafafa " } });
  fireEvent.input(screen.getByLabelText("line, light"), { target: { value: "   " } });
  expect(preview("dark").getPropertyValue("--vx-ink")).toBe("#fafafa");
  fireEvent.submit(action.closest("form") as HTMLFormElement);
  expect(
    (await screen.findByText("surface must be a plain colour, length or font list")).role,
  ).toBe("alert");
  expect(sent("PUT")[0]?.body).toEqual({
    theme: { tokens: { action: "#7c3aed", surface: "url(x)" }, dark: { ink: "#fafafa" } },
  });

  fireEvent.input(screen.getByLabelText("surface, light"), { target: { value: "" } });
  fireEvent.submit(action.closest("form") as HTMLFormElement);
  await screen.findByText("Saved.");
  expect(sent("PUT")[1]?.body).toEqual({
    theme: { tokens: { action: "#7c3aed" }, dark: { ink: "#fafafa" } },
  });
  expect(screen.queryByText("surface must be a plain colour, length or font list")).toBeNull();

  vi.stubGlobal("confirm", () => true);
  fireEvent.click(screen.getByRole("button", { name: "Reset to the kit's values" }));
  await screen.findByText("Reset to the kit's values.");
  expect(sent("PUT")[2]?.body).toEqual({ theme: { tokens: {}, dark: {} } });
  expect((screen.getByLabelText("action, light") as HTMLInputElement).value).toBe("");
});

test("self sign-up is saved when it is switched, and a logo is checked before it is sent", async () => {
  let current = portal;
  routes[`GET /api/v1${base}/portal`] = () => [200, current];
  routes[`PUT /api/v1${base}/portal`] = () => [200, current];
  routes[`PUT /api/v1${base}/portal/logo`] = () => {
    current = { ...portal, logo: true };
    return [204, null];
  };
  render(<Branding base={base} tenantId="t1" />);
  fireEvent.click(await screen.findByLabelText("People may create their own account"));
  await waitFor(() => expect(sent("PUT")[0]?.body).toEqual({ signUp: true }));

  const input = screen.getByLabelText(/Upload a logo/);
  expect(input.getAttribute("accept")).toBe("image/png,image/jpeg,image/webp");
  const tooBig = new File([new Uint8Array(600 * 1024)], "big.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [tooBig] } });
  expect((await screen.findByRole("alert")).textContent).toBe(
    "That image is 600 KB. A logo can be 512 KB at most.",
  );
  fireEvent.change(input, {
    target: { files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })] },
  });
  await screen.findByText("Choose a PNG, JPEG or WebP image.");
  expect(sent("PUT")).toHaveLength(1);

  const logo = new File(["png bytes"], "logo.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [logo] } });
  const image = await screen.findByAltText("The tenant's logo");
  expect(image.getAttribute("src")).toContain(`/api/v1${base}/portal/logo`);
  const upload = sent("PUT")[1];
  expect(upload?.url).toBe(`/api/v1${base}/portal/logo`);
  expect(upload?.headers["content-type"]).toBe("image/png");
  expect(upload?.body).toBe(logo);
});

// ----- Domains -----

const domain = {
  id: "d1",
  workspaceId: "w1",
  app: "portal/orders",
  hostname: "orders.acme.example",
  url: "https://orders.acme.example/",
  enabled: false,
  verifiedAt: null,
  checkedAt: null,
  checkError: null,
  challenge: { name: "_vx-challenge.orders.acme.example", value: "vx-domain=0123abcd" },
  createdAt: "2026-11-12T00:00:00.000Z",
};

test("adding a hostname shows its TXT record, a check shows what is missing, and enabling unverified explains itself", async () => {
  let domains: (typeof domain)[] = [];
  routes[`GET /api/v1${base}/domains`] = () => [200, { items: domains }];
  routes[`GET /api/v1${base}/workspaces`] = () => [
    200,
    {
      items: [
        { id: "w0", name: "Dev" },
        { id: "w1", name: "Main" },
      ],
    },
  ];
  routes[`GET /api/v1${base}/workspaces/w0/apps`] = () => [200, { items: [] }];
  routes[`GET /api/v1${base}/workspaces/w1/apps`] = () => [
    200,
    { items: [{ id: "a1", path: "portal/orders", title: "Orders" }] },
  ];
  routes[`POST /api/v1${base}/domains`] = () => {
    domains = [domain];
    return [201, domain];
  };
  const missing =
    "No TXT record _vx-challenge.orders.acme.example with the value vx-domain=0123abcd was found.";
  routes[`POST /api/v1${base}/domains/d1/checks`] = () => {
    domains = [{ ...domain, checkedAt: "2026-11-12T10:00:00.000Z", checkError: missing } as never];
    return [200, domains[0]];
  };
  routes[`PATCH /api/v1${base}/domains/d1`] = () => [
    409,
    {
      status: 409,
      code: "domain_not_verified",
      detail: "Create the DNS TXT record and run a check first.",
    },
  ];
  routes[`DELETE /api/v1${base}/domains/d1`] = () => {
    domains = [];
    return [204, null];
  };

  render(<Domains base={base} />);
  await screen.findByText("No hostnames yet");
  expect(document.body.textContent).toContain("the platform issues none");
  fireEvent.click(screen.getAllByRole("button", { name: "Add a hostname" })[0] as HTMLElement);
  await screen.findByRole("dialog");
  // The first workspace has no app to serve, so nothing can be added there.
  await screen.findByText(/This workspace has no apps/);
  expect((screen.getByRole("button", { name: "Add hostname" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.change(screen.getByLabelText("Workspace"), { target: { value: "w1" } });
  await screen.findByRole("option", { name: "Orders (portal/orders)" });
  fireEvent.input(screen.getByLabelText("Hostname"), {
    target: { value: " orders.acme.example " },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Add hostname" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.submit(screen.getByLabelText("Hostname").closest("form") as HTMLFormElement);

  await screen.findByText("_vx-challenge.orders.acme.example");
  expect(sent("POST")[0]?.body).toEqual({
    workspaceId: "w1",
    app: "portal/orders",
    hostname: "orders.acme.example",
  });
  // The dialog that added it is on its way out while this one opens.
  const details = () => screen.getAllByRole("dialog").at(-1)?.textContent ?? "";
  expect(details()).toContain("vx-domain=0123abcd");
  expect(details()).toContain("Not checked yet.");
  expect(screen.getByRole("button", { name: "Copy record name" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy record value" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Check now" }));
  await waitFor(() => expect(details()).toContain(missing));
  expect(sent("POST")[1]?.url).toBe(`/api/v1${base}/domains/d1/checks`);

  fireEvent.click(screen.getByRole("button", { name: "Enable" }));
  await waitFor(() => expect(details()).toContain("This hostname is not verified yet"));
  expect(sent("PATCH")[0]?.body).toEqual({ enabled: true });
  expect(details()).toContain("ask an operator of this instance");

  // The list behind the dialog shows the same state.
  const row = (await screen.findByRole("button", { name: /Details/, hidden: true })).closest("tr");
  expect(row?.textContent).toContain("Main");
  expect(row?.textContent).toContain("Not verified");
  expect(row?.textContent).toContain(missing);

  const confirm = vi.fn((_question: string) => true);
  vi.stubGlobal("confirm", confirm);
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  await screen.findByText("No hostnames yet");
  expect(confirm.mock.calls[0]?.[0]).toContain("sign-ins made at that hostname end");
  expect(sent("DELETE")[0]?.url).toBe(`/api/v1${base}/domains/d1`);
});

// ----- The tenant's colours in the console -----

test("the tenant's stylesheet is in the page while the tenant is shown, and is loaded again after a save", () => {
  // The test browser fetches no stylesheets. Without this it reports each one as an error.
  const browser = window as unknown as {
    happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: boolean } };
  };
  browser.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  const Shown = ({ tenantId }: { tenantId: string | undefined }) => {
    useTenantTheme(tenantId);
    return null;
  };
  const links = () =>
    [...document.head.querySelectorAll('link[rel="stylesheet"]')].map((link) =>
      link.getAttribute("href"),
    );
  const { rerender, unmount } = render(<Shown tenantId="t1" />);
  expect(links()).toEqual(["/api/v1/tenants/t1/theme.css"]);
  refreshTenantTheme("t1");
  expect(links()[0]).toMatch(/^\/api\/v1\/tenants\/t1\/theme\.css\?saved=\d+$/);
  rerender(<Shown tenantId="t2" />);
  expect(links()).toEqual(["/api/v1/tenants/t2/theme.css"]);
  rerender(<Shown tenantId={undefined} />);
  expect(links()).toEqual([]);
  unmount();
});
