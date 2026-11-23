// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { notify } from "./ask.tsx";
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
  let made = false;
  let current = oidc;
  let domains: object[] = [];
  // The list says what the provider is now, as the server does.
  routes[`GET ${base}`] = () => [200, { items: made ? [current] : [] }];
  routes[`POST ${base}`] = () => {
    made = true;
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
  expect(said).toContain("operators of this instance keep their passwords");
  expect(said).toContain("open sessions end now, except yours");
  await screen.findByRole("button", { name: "Stop requiring it" });
  expect(sent("PATCH")[1]?.body).toEqual({ enforce: true });

  // Turning it off says whom it signs in, and that passwords come back, and asks first.
  fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
  const off = await answer("Cancel");
  expect(off).toContain("Turn off Acme Login?");
  expect(off).toContain("It signs in members with an email in acme.example.");
  expect(off).toContain("those members can use a password again");
  // D12: turning it off does not stop a directory from pushing, and says so.
  expect(off).toContain("keeps pushing while it is off");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(sent("PATCH")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
  await answer("Turn off");
  await screen.findByRole("button", { name: "Turn on" });
  expect(sent("PATCH")[2]?.body).toEqual({ enabled: false });
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
  // A row with no group chosen is not saved, and says so (GOV-18).
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Row 2");
  expect(sent("PUT")).toHaveLength(0);
  // Taken out, the rest is saved.
  fireEvent.click(screen.getByRole("button", { name: "Remove mapping 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(1));
  expect(sent("PUT")[0]?.body).toEqual({ items: [{ value: "*", groupId: "g1" }] });
});

test("a mapping an access release made is shown read only, with the way to the release (GOV-19)", async () => {
  routes[`GET ${base}`] = () => [200, { items: [saml] }];
  routes["GET /api/v1/tenants/t1/end-user-groups?limit=200"] = () => [
    200,
    { items: [{ id: "g1", name: "customers" }] },
  ];
  routes[`GET ${base}/p2/group-maps`] = () => [
    200,
    {
      items: [
        { value: "gold", groupId: "g1", groupName: "customers", managedBy: "release" },
        { value: "*", groupId: "g1", groupName: "customers", managedBy: "hand" },
      ],
    },
  ];
  routes[`PUT ${base}/p2/group-maps`] = (body) => [200, body];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Customers" }));
  fireEvent.click(screen.getByRole("tab", { name: "Groups" }));
  await screen.findByLabelText("Group at the provider");
  // Only the one made by hand has fields and a remove button.
  expect(screen.getAllByLabelText("Group at the provider")).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: /Remove mapping/ })).toHaveLength(1);
  const link = screen.getByRole("link", { name: /release/i }) as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/t/t1/releases");
  expect(screen.getByText("gold")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove mapping 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(1));
  expect(sent("PUT")[0]?.body).toEqual({ items: [] });
});

test("attributes keep a value with an equals sign, and a line that is not whole is said (GOV-18)", async () => {
  let current = saml;
  routes[`GET ${base}`] = () => [200, { items: [current] }];
  routes[`PATCH ${base}/p2`] = (body) => {
    current = { ...current, config: (body as { config: object }).config };
    return [200, current];
  };
  routes[`GET ${base}/p2/group-maps`] = () => [200, { items: [] }];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Customers" }));
  fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
  const field = await screen.findByLabelText("Attributes");
  fireEvent.change(field, { target: { value: "customer_id = urn:x?a=b\nregion: r" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Line 2");
  expect(sent("PATCH")).toHaveLength(0);
  fireEvent.change(field, { target: { value: "customer_id = urn:x?a=b" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toHaveLength(1));
  expect(sent("PATCH")[0]?.body).toMatchObject({
    config: { attributes: { customer_id: "urn:x?a=b" } },
  });
});

test("scopes keep the space that was typed (GOV-14)", async () => {
  routes[`GET ${base}`] = () => [200, { items: [oidc] }];
  routes[`GET ${base}/p1/group-maps`] = () => [200, { items: [] }];
  routes[`PATCH ${base}/p1`] = (body) => [200, { ...oidc, ...(body as object) }];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
  const field = (await screen.findByLabelText("Scopes")) as HTMLInputElement;
  for (const typed of ["openid", "openid ", "openid g", "openid groups"]) {
    fireEvent.change(field, { target: { value: typed } });
    expect(field.value).toBe(typed);
  }
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toHaveLength(1));
  expect(sent("PATCH")[0]?.body).toMatchObject({ config: { scopes: ["openid", "groups"] } });
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

test("adding a domain says what happened: proved at once at the instance, a record to publish in a tenant (INS-18)", async () => {
  const toast = vi.spyOn(notify, "success").mockImplementation(() => 0);
  const instanceBase = "/api/v1/instance/identity-providers";
  routes[`GET ${instanceBase}`] = () => [200, { items: [oidc] }];
  routes[`GET ${instanceBase}/p1`] = () => [200, oidc];
  routes[`GET ${instanceBase}/p1/domains`] = () => [200, { items: [] }];
  routes[`POST ${instanceBase}/p1/domains`] = (body) => [
    201,
    {
      id: "d1",
      domain: (body as { domain: string }).domain,
      verified: true,
      verifiedAt: "2026-11-22T10:00:00Z",
      checkedAt: null,
      problem: null,
      record: null,
    },
  ];
  history.replaceState(null, "", "/?provider=p1");
  show(<SingleSignOn base="/instance" />);
  fireEvent.click(await screen.findByRole("tab", { name: "Domains" }));
  fireEvent.change(await screen.findByLabelText("Email domain"), {
    target: { value: "acme.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
  await waitFor(() => expect(toast).toHaveBeenCalled());
  expect(toast.mock.calls[0]?.[0]).toBe("acme.example is added. It needs no proof here.");
  expect(String(toast.mock.calls[0]?.[0])).not.toContain("record");
});

test("adding a domain in a tenant says to prove it with the record shown (INS-18, GOV-21)", async () => {
  const toast = vi.spyOn(notify, "success").mockImplementation(() => 0);
  routes[`GET ${base}`] = () => [200, { items: [oidc] }];
  routes[`GET ${base}/p1/group-maps`] = () => [200, { items: [] }];
  routes[`GET ${base}/p1/domains`] = () => [200, { items: [] }];
  routes[`POST ${base}/p1/domains`] = (body) => [
    201,
    {
      id: "d1",
      domain: (body as { domain: string }).domain,
      verified: false,
      verifiedAt: null,
      checkedAt: null,
      problem: null,
      record: { name: "_vx.acme.example", value: "vx" },
    },
  ];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  fireEvent.click(screen.getByRole("tab", { name: "Domains" }));
  fireEvent.change(await screen.findByLabelText("Email domain"), {
    target: { value: "acme.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
  await waitFor(() => expect(toast).toHaveBeenCalled());
  expect(toast.mock.calls[0]?.[0]).toBe(
    "acme.example is added. Prove it is yours with the record shown.",
  );
});

test("a stored client secret can be removed, for a public client (GOV-13)", async () => {
  routes[`GET ${base}`] = () => [200, { items: [oidc] }];
  routes[`GET ${base}/p1/group-maps`] = () => [200, { items: [] }];
  routes[`PATCH ${base}/p1`] = (body) => [200, { ...oidc, ...(body as object) }];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
  fireEvent.click(await screen.findByLabelText("Remove the stored client secret"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toHaveLength(1));
  expect(sent("PATCH")[0]?.body).toMatchObject({ clientSecret: null });
});

test("after an edit, removing the last domain turns the header off with the provider (GOV-16)", async () => {
  let current: IdentityProvider = { ...oidc, enabled: true, enforce: true };
  let domains: object[] = [
    {
      id: "d1",
      domain: "acme.example",
      verified: true,
      verifiedAt: "2026-11-01T10:00:00Z",
      checkedAt: null,
      problem: null,
      record: { name: "_vx.acme.example", value: "vx" },
    },
  ];
  routes[`GET ${base}`] = () => [200, { items: [current] }];
  routes[`GET ${base}/p1/group-maps`] = () => [200, { items: [] }];
  routes[`GET ${base}/p1/domains`] = () => [200, { items: domains }];
  routes[`PATCH ${base}/p1`] = (body) => [200, { ...current, ...(body as object) }];
  routes[`DELETE ${base}/p1/domains/d1`] = () => {
    domains = [];
    // The server turns a provider of members with no proved domain left off.
    current = { ...current, enabled: false, enforce: false };
    return [204, null];
  };
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
  fireEvent.change((await screen.findAllByLabelText("Name"))[0] as HTMLElement, {
    target: { value: "Acme Login 2" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toHaveLength(1));
  await screen.findByRole("button", { name: "Stop requiring it" });

  fireEvent.click(screen.getByRole("tab", { name: "Domains" }));
  await screen.findByText("acme.example");
  // The provider's own Remove is in the header; the domain's is the last.
  fireEvent.click(screen.getAllByRole("button", { name: "Remove" }).at(-1) as HTMLElement);
  await answer("Remove");
  await screen.findByRole("button", { name: "Turn on" });
  expect(screen.queryByRole("button", { name: "Stop requiring it" })).toBeNull();
});

test("a proved domain whose record is gone says since when, and stays proved (GOV-25)", async () => {
  routes[`GET ${base}`] = () => [200, { items: [oidc] }];
  routes[`GET ${base}/p1/group-maps`] = () => [200, { items: [] }];
  routes[`GET ${base}/p1/domains`] = () => [
    200,
    {
      items: [
        {
          id: "d1",
          domain: "acme.example",
          verified: true,
          verifiedAt: "2026-11-01T10:00:00Z",
          checkedAt: "2026-11-12T10:00:00Z",
          problem: "No TXT record _vx.acme.example with the value vx was found.",
          recordGoneAt: "2026-11-10T10:00:00Z",
          record: { name: "_vx.acme.example", value: "vx" },
        },
      ],
    },
  ];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  fireEvent.click(screen.getByRole("tab", { name: "Domains" }));
  await screen.findByText("acme.example");
  expect(document.body.textContent).toContain("record gone since");
  expect(document.body.textContent).toContain("No TXT record");
});

test("WLK-12: saving an issuer that dropped the client secret says so, and says what to do", async () => {
  routes[`GET ${base}`] = () => [200, { items: [oidc] }];
  routes[`PATCH ${base}/p1`] = (body) => [
    200,
    { ...oidc, config: (body as { config: object }).config, hasSecret: false },
  ];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
  fireEvent.change(await screen.findByLabelText("Issuer"), {
    target: { value: "https://other.acme.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await answer("Change it");
  expect(await screen.findByText(/client secret was dropped/i)).toBeTruthy();
  expect(screen.queryByText("The provider was saved.")).toBeNull();
});

test("settings and a group mapping left unsaved say so, and can be put back (GOV-33)", async () => {
  routes[`GET ${base}`] = () => [200, { items: [oidc] }];
  routes[`GET ${base}/p1/group-maps`] = () => [200, { items: [] }];
  routes["GET /api/v1/tenants/t1/groups?limit=200"] = () => [200, { items: [] }];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
  const name = (await screen.findAllByLabelText("Name"))[0] as HTMLInputElement;
  expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
  fireEvent.change(name, { target: { value: "Acme Login 2" } });
  const bar = await screen.findByRole("region", { name: "Unsaved changes" });
  fireEvent.click(within(bar).getByRole("button", { name: "Discard" }));
  expect(name.value).toBe("Acme Login");
  expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "Groups" }));
  await screen.findByRole("button", { name: "Add a mapping" });
  expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add a mapping" }));
  const mapping = await screen.findByRole("region", { name: "Unsaved changes" });
  expect(mapping.textContent).toContain("group mapping");
  fireEvent.click(within(mapping).getByRole("button", { name: "Discard" }));
  expect(screen.queryByLabelText("Group at the provider")).toBeNull();
});

test("a list that stops at its limit says so, and goes on (GOV-34)", async () => {
  routes[`GET ${base}`] = () => [200, { items: [oidc] }];
  routes[`GET ${base}/p1/group-maps`] = () => [200, { items: [] }];
  routes["GET /api/v1/tenants/t1/groups?limit=200"] = () => [
    200,
    { items: [{ id: "g1", name: "Finance" }], nextCursor: "g-next" },
  ];
  routes["GET /api/v1/tenants/t1/groups?limit=200&search=ops"] = () => [
    200,
    { items: [{ id: "g9", name: "Ops" }], nextCursor: null },
  ];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));

  fireEvent.click(screen.getByRole("tab", { name: "Groups" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add a mapping" }));
  await screen.findByText("Showing the first 1 groups.");
  const picker = screen.getByRole("combobox");
  fireEvent.click(picker);
  fireEvent.keyDown(picker, { key: "ArrowDown" });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "ops" } });
  await waitFor(() =>
    expect(calls.some((call) => call.url.endsWith("/groups?limit=200&search=ops"))).toBe(true),
  );
});

test("the people who signed in are paged, and say so (GOV-34)", async () => {
  const link = (n: number) => ({
    id: `l${n}`,
    subject: `s-${n}`,
    principalType: "member",
    principalId: `m${n}`,
    email: `p${n}@acme.example`,
    name: null,
    createdAt: "2026-11-01T10:00:00Z",
    lastSignedInAt: null,
  });
  routes[`GET ${base}`] = () => [200, { items: [oidc] }];
  routes[`GET ${base}/p1/group-maps`] = () => [200, { items: [] }];
  routes[`GET ${base}/p1/links?limit=200`] = () => [200, { items: [link(1)], nextCursor: "c1" }];
  routes[`GET ${base}/p1/links?limit=200&cursor=c1`] = () => [
    200,
    { items: [link(2)], nextCursor: null },
  ];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  fireEvent.click(screen.getByRole("tab", { name: "People" }));
  await screen.findAllByText("p1@acme.example");
  await screen.findByText("Showing the first 1 people.");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findAllByText("p2@acme.example");
});

test("a member who may only read single sign-on is told so, and nothing offers to change it (GOV-37)", async () => {
  routes["GET /api/v1/me"] = () => [
    200,
    {
      principal: { type: "member", id: "m1", name: "Rae", email: "rae@acme.example" },
      instancePermissions: [],
      tenants: [],
    },
  ];
  routes["GET /api/v1/tenants/t1/access/member/m1"] = () => [
    200,
    { principal: {}, sources: [], permissions: [{ permission: "sso:read" }] },
  ];
  routes[`GET ${base}`] = () => [200, { items: [oidc] }];
  routes[`GET ${base}/p1/group-maps`] = () => [200, { items: [] }];
  show(<SingleSignOn base="/tenants/t1" />);
  // Even the way in is not offered.
  const connect = (await screen.findAllByRole("button", { name: "Connect a provider" }))[0];
  await waitFor(() => expect((connect as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Turn on" }) as HTMLButtonElement).disabled).toBe(
      true,
    ),
  );
  expect((screen.getByRole("button", { name: "Remove" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
  const field = (await screen.findAllByLabelText("Name"))[0] as HTMLElement;
  expect((field.closest("fieldset") as HTMLFieldSetElement | null)?.disabled).toBe(true);
  expect(document.body.textContent).toContain("You can see this provider, not change it");
  expect(document.body.textContent).toContain("sso:write");
});

test("a SAML provider is asked for a name ID format, and the one stored is kept (GOV-P2)", async () => {
  let current: IdentityProvider = saml;
  routes[`GET ${base}`] = () => [200, { items: [current] }];
  routes[`PATCH ${base}/p2`] = (body) => {
    current = { ...current, config: (body as { config: object }).config };
    return [200, current];
  };
  routes["GET /api/v1/tenants/t1/end-user-groups?limit=200"] = () => [200, { items: [] }];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Customers" }));
  fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
  const format = (await screen.findByLabelText("Name ID format")) as HTMLSelectElement;
  expect(format.value).toBe("");
  fireEvent.change(format, {
    target: { value: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toHaveLength(1));
  const first = sent("PATCH")[0]?.body as { config: { nameIdFormat: string } };
  expect(first.config.nameIdFormat).toBe("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
  // Asked for none again: sent as none, so the server clears it.
  await screen.findByText("The provider was saved.");
  fireEvent.change(screen.getByLabelText("Name ID format"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toHaveLength(2));
  const second = sent("PATCH")[1]?.body as { config: { nameIdFormat: null } };
  expect(second.config.nameIdFormat).toBe(null);
});

test("a SAML provider's metadata is read again by itself, and what it says is shown (GOV-P3)", async () => {
  let current: IdentityProvider = saml;
  routes[`GET ${base}`] = () => [200, { items: [current] }];
  routes[`PATCH ${base}/p2`] = (body) => {
    const config = (body as { config: Record<string, unknown> }).config;
    if (config.metadataUrl === "https://idp.example/gone") {
      return [400, { status: 400, detail: "The metadata could not be read from that address." }];
    }
    current = {
      ...current,
      config: {
        ...current.config,
        entryPoint: "https://idp.example/new-sso",
        certificates: ["-----BEGIN CERTIFICATE-----\nBBB\n-----END CERTIFICATE-----\n"],
      },
    };
    return [200, current];
  };
  routes["GET /api/v1/tenants/t1/end-user-groups?limit=200"] = () => [200, { items: [] }];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Customers" }));
  fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
  const read = (await screen.findByRole("button", {
    name: "Read the metadata",
  })) as HTMLButtonElement;
  expect(read.disabled).toBe(true);
  fireEvent.input(screen.getByLabelText("Metadata address"), {
    target: { value: "https://idp.example/gone" },
  });
  fireEvent.click(read);
  expect(await answer("Read the metadata")).toContain("ties between people");
  await screen.findByText("The metadata could not be read from that address.");
  fireEvent.input(screen.getByLabelText("Metadata address"), {
    target: { value: "https://idp.example/metadata" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Read the metadata" }));
  await answer("Read the metadata");
  await waitFor(() =>
    expect((screen.getByLabelText(/^Sign-in address/) as HTMLInputElement).value).toBe(
      "https://idp.example/new-sso",
    ),
  );
  // Only the metadata went: the address, entity ID and certificates it describes were not sent.
  expect(sent("PATCH")[1]?.body).toEqual({
    config: { metadataUrl: "https://idp.example/metadata" },
  });
  expect((screen.getByLabelText("Signing certificates") as HTMLTextAreaElement).value).toContain(
    "BBB",
  );
});

test("a member provider shows the address that starts a sign-in, an end users' does not (GOV-P5)", async () => {
  routes[`GET ${base}`] = () => [200, { items: [oidc, saml] }];
  show(<SingleSignOn base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  await screen.findByText(addresses.callback);
  expect(screen.getByText(addresses.start)).toBeTruthy();
  expect(screen.getByText(/tile in the provider's app list/)).toBeTruthy();
});

test("a person made by the instance's provider is said to have no access until an operator gives it (GOV-P4)", async () => {
  routes["GET /api/v1/instance/identity-providers"] = () => [200, { items: [oidc] }];
  routes["GET /api/v1/instance/identity-providers/p1/domains"] = () => [200, { items: [] }];
  show(<SingleSignOn base="/instance" />);
  fireEvent.click(await screen.findByRole("button", { name: "Acme Login" }));
  fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
  await screen.findByText(/has no access until an operator gives it, one person at a time/);
  // The instance's provider takes no default role: the server refuses one, so none is offered.
  expect(screen.queryByLabelText("Role given to a new member")).toBeNull();
});
