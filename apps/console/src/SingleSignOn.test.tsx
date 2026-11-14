// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SignIn } from "./screens/SignIn.tsx";
import { type IdentityProvider, SingleSignOn } from "./screens/SingleSignOn.tsx";
import { answer, show } from "./testing.tsx";

const base = "/api/v1/tenants/t1/identity-providers";
const addresses = {
  start: "https://vx.example/api/v1/sso/p1/start",
  callback: "https://vx.example/api/v1/sso/p1/callback",
  acs: "https://vx.example/api/v1/sso/p1/acs",
  metadata: "https://vx.example/api/v1/sso/p1/metadata",
  entityId: "https://vx.example/api/v1/sso/p1/metadata",
};
const oidc: IdentityProvider = {
  id: "p1",
  tenantId: "t1",
  audience: "members",
  protocol: "oidc",
  name: "Acme Login",
  config: { issuer: "https://login.acme.example", clientId: "console", scopes: ["openid"] },
  hasSecret: true,
  enabled: false,
  enforce: false,
  provision: false,
  defaultRoleId: null,
  paused: false,
  addresses,
  lastTest: null,
};
const saml: IdentityProvider = {
  ...oidc,
  id: "p2",
  audience: "end_users",
  protocol: "saml",
  name: "Customers",
  hasSecret: false,
  enabled: true,
  config: {
    entryPoint: "https://idp.example/sso",
    idpIssuer: "https://idp.example",
    certificates: ["-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----\n"],
    signed: "either",
    allowSha1: false,
    spCertificate: "ours",
  },
};

let calls: { method: string; url: string; body: unknown }[];
let routes: Record<string, (body: unknown) => [number, unknown]>;

beforeEach(() => {
  calls = [];
  routes = {};
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const [status, reply] = routes[`${method} ${address}`]?.(body) ?? [404, { detail: "No mock" }];
    return new Response(reply === null ? null : JSON.stringify(reply), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const sent = (method: string) => calls.filter((call) => call.method === method);

test("a provider is connected, tried out, given a domain, turned on and required", async () => {
  let stored: IdentityProvider[] = [];
  let current = oidc;
  let domains: object[] = [];
  routes[`GET ${base}`] = () => [200, { items: stored }];
  routes[`POST ${base}`] = () => {
    stored = [current];
    return [201, current];
  };
  routes[`GET ${base}/p1`] = () => [200, current];
  routes[`PATCH ${base}/p1`] = (body) => {
    current = { ...current, ...(body as object) };
    return [200, current];
  };
  routes[`POST ${base}/p1/tests`] = () => [
    201,
    { url: "https://login.acme.example/authorize?x=1" },
  ];
  routes[`GET ${base}/p1/domains`] = () => [200, { items: domains }];
  routes[`POST ${base}/p1/domains`] = (body) => {
    domains = [
      {
        id: "d1",
        domain: (body as { domain: string }).domain,
        verified: false,
        verifiedAt: null,
        checkedAt: null,
        problem: null,
        record: { name: "_vx-challenge.acme.example", value: "vx-domain=abc" },
      },
    ];
    return [201, domains[0]];
  };
  routes[`POST ${base}/p1/domains/d1/checks`] = () => {
    domains = [{ ...(domains[0] as object), verified: true }];
    return [200, domains[0]];
  };
  const opened = vi.spyOn(window, "open").mockImplementation(() => null);

  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Connect a provider" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Acme Login" } });
  fireEvent.change(within(dialog).getByLabelText("Issuer"), {
    target: { value: "https://login.acme.example" },
  });
  fireEvent.change(within(dialog).getByLabelText("Client ID"), { target: { value: "console" } });
  fireEvent.change(within(dialog).getByLabelText("Client secret"), { target: { value: "s3cret" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));

  // Straight to what to enter at the provider.
  await screen.findByRole("heading", { name: "Acme Login" });
  expect(sent("POST")[0]?.body).toEqual({
    audience: "members",
    protocol: "oidc",
    name: "Acme Login",
    config: { issuer: "https://login.acme.example", clientId: "console" },
    clientSecret: "s3cret",
  });
  expect(screen.getByText(addresses.callback)).toBeTruthy();
  // The secret is not kept on the page.
  expect(document.body.textContent).not.toContain("s3cret");

  // A try-out opens the provider in another tab, and its result is shown when asked for.
  fireEvent.click(screen.getByRole("button", { name: "Try signing in" }));
  await waitFor(() =>
    expect(opened).toHaveBeenCalledWith(
      "https://login.acme.example/authorize?x=1",
      "_blank",
      "noopener",
    ),
  );
  current = {
    ...current,
    lastTest: {
      at: new Date().toISOString(),
      ok: true,
      would: "A new account would be created, and would join finance.",
      subject: "u-1",
      email: "carol@acme.example",
      emailVerified: true,
      name: "Carol",
      groups: ["Finance Team"],
      attributes: {},
      received: { sub: "u-1" },
    },
  };
  fireEvent.click(await screen.findByRole("button", { name: "Show the result" }));
  await screen.findByText(/A new account would be created, and would join finance\./);
  expect(screen.getByText("Finance Team")).toBeTruthy();

  // A domain, with the record to publish.
  fireEvent.click(screen.getByRole("tab", { name: "Domains" }));
  fireEvent.change(await screen.findByLabelText("Email domain"), {
    target: { value: "acme.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
  await screen.findByText("vx-domain=abc");
  expect(screen.getByText("Not proved")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Check now" }));
  await screen.findByText("Proved");

  fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
  await screen.findByRole("button", { name: "Turn off" });
  expect(sent("PATCH")[0]?.body).toEqual({ enabled: true });

  // Requiring it says who keeps a password, and asks first.
  fireEvent.click(screen.getByRole("button", { name: "Require it" }));
  const said = await answer("Require it");
  expect(said).toContain("operators of this instance keep theirs");
  await screen.findByRole("button", { name: "Stop requiring it" });
  expect(sent("PATCH")[1]?.body).toEqual({ enforce: true });
});

test("a SAML provider's settings say what lowering the bar means, and group mapping is saved whole", async () => {
  let current = saml;
  routes[`GET ${base}`] = () => [200, { items: [current] }];
  routes[`PATCH ${base}/p2`] = (body) => {
    current = { ...current, config: (body as { config: object }).config };
    return [200, current];
  };
  routes["GET /api/v1/tenants/t1/end-user-groups?limit=200"] = () => [
    200,
    { items: [{ id: "g1", name: "customers" }] },
  ];
  routes[`GET ${base}/p2/group-maps`] = () => [200, { items: [{ value: "*", groupId: "g1" }] }];
  routes[`PUT ${base}/p2/group-maps`] = (body) => [200, body];

  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Customers" }));
  // SAML: the three values and the metadata address.
  await screen.findByText(addresses.acs);
  expect(screen.getAllByText(addresses.metadata).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
  const sha1 = await screen.findByLabelText("Accept SHA-1 signatures");
  expect(document.body.textContent).toContain("Turning this on is written to the audit log.");
  fireEvent.click(sha1);
  fireEvent.change(screen.getByLabelText("Attributes"), {
    target: { value: "customer_id = customerId" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toHaveLength(1));
  const body = sent("PATCH")[0]?.body as { config: Record<string, unknown>; provision: boolean };
  expect(body.config).toMatchObject({
    allowSha1: true,
    attributes: { customer_id: "customerId" },
    certificates: ["-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----"],
  });
  // This side's certificate is not something to send back.
  expect(body.config.spCertificate).toBeUndefined();
  // A provider of end users has no default role.
  expect("defaultRoleId" in body).toBe(false);

  fireEvent.click(screen.getByRole("tab", { name: "Groups" }));
  expect(((await screen.findByLabelText("Group at the provider")) as HTMLInputElement).value).toBe(
    "*",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add a mapping" }));
  const values = screen.getAllByLabelText("Group at the provider");
  fireEvent.change(values[1] as HTMLElement, { target: { value: " gold " } });
  // A row with no group chosen is left out.
  fireEvent.click(screen.getByRole("button", { name: "Save mapping" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(1));
  expect(sent("PUT")[0]?.body).toEqual({ items: [{ value: "*", groupId: "g1" }] });
});

test("signing in asks for the email first, then offers the organization's sign-in", async () => {
  routes["GET /api/v1/sso/providers?email=alice%40acme.example"] = () => [
    200,
    {
      providers: [{ id: "p1", name: "Acme Login", url: "/api/v1/sso/p1/start" }],
      password: false,
    },
  ];
  history.replaceState(null, "", "/?return=%2Ft%2Ft1%2Fmembers");
  show(<SignIn onSignedIn={() => {}} />);
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: "alice@acme.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  const link = await screen.findByRole("link", { name: "Sign in with Acme Login" });
  expect(link.getAttribute("href")).toBe("/api/v1/sso/p1/start?return=%2Ft%2Ft1%2Fmembers");
  // Required: there is no password to ask for.
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.getByText(/requires its own sign-in/)).toBeTruthy();
});

test("a sign-in the provider refused says why, once", async () => {
  history.replaceState(null, "", "/?sso_error=no_account&return=%2Fx");
  show(<SignIn onSignedIn={() => {}} />);
  expect((await screen.findByRole("alert")).textContent).toBe(
    "There is no account here for you yet. Ask your administrator for one.",
  );
  // The reason is taken out of the address. Where to go back to stays.
  expect(window.location.search).toBe("?return=%2Fx");
});
