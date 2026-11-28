import { asPerson } from "./as.ts";
import { copySlug, fernhillTenant } from "./fernhill.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * Apps written as code, isolated (decision 0008, #28). Two tenants' code apps are served at the
 * same address: this worker's Fernhill and another. Each page is sandboxed, so in a real browser
 * it has no origin of its own: it reads no cookie and no storage, cannot read another tenant's
 * app, and cannot act with the console's session. It acts with the app token it was served,
 * which reaches only what apps use. And the app still works: its files load by their content
 * name, and its calls carry the token.
 */
const TENANT = fernhillTenant();
const OTHER = TENANT === "fernhill" ? copySlug(0) : "fernhill";

/** What a page of the app can do, asked from inside it. */
async function probe(page: Page) {
  return page.evaluate(async (other) => {
    const out: Record<string, unknown> = { origin: self.origin };
    try {
      out.cookie = document.cookie;
    } catch (error) {
      out.cookie = (error as Error).name;
    }
    try {
      localStorage.setItem("probe", "1");
      out.storage = "kept";
    } catch (error) {
      out.storage = (error as Error).name;
    }
    const context = JSON.parse(document.getElementById("vx-context")?.textContent ?? "{}");
    const token = context.token?.token as string | undefined;
    out.token = token?.slice(0, 4);
    const auth: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
    out.session = (
      await fetch(`/api/v1/tenants/${context.tenant.id}/session`, { headers: auth })
    ).status;
    // The console's own account, and its list of tenants: not something apps use.
    out.me = (await fetch("/api/v1/me", { headers: auth })).status;
    out.tenants = (await fetch("/api/v1/tenants", { headers: auth })).status;
    // As a client built before 0.7 calls: with the page's cookie, and an EventSource. The page
    // has no cookie; the platform's script sends the token in its place.
    const old = await fetch(`/api/v1/tenants/${context.tenant.id}/session`, {
      credentials: "same-origin",
    });
    out.oldClient = old.status === 200 ? (await old.json()).principal.type : old.status;
    out.oldStream = await new Promise((resolve) => {
      const stream = new EventSource(`/api/v1/tenants/${context.tenant.id}/stream`);
      const done = (what: string) => {
        stream.close();
        resolve(what);
      };
      stream.addEventListener("ready", () => done("ready"));
      stream.addEventListener("error", () => done(`error ${stream.readyState}`));
      setTimeout(() => done("no answer"), 10_000);
    });
    // Another tenant's app at the same address.
    try {
      out.other = `read ${(await fetch(other)).status}`;
    } catch {
      out.other = "refused";
    }
    return out;
  }, `/apps/${OTHER}/clinics/pet-portal/`);
}

const ISOLATED = {
  origin: "null",
  cookie: "SecurityError",
  storage: "SecurityError",
  token: "vxa_",
  session: 200,
  me: 403,
  tenants: 403,
  other: "refused",
};

test("@access @fernhill a member of staff's page of a code app is sandboxed, and works with its token", async ({
  browser,
}) => {
  // Maya runs the practice: at the console's address she has the console's session.
  const page = await (await asPerson(browser, "maya")).newPage();
  const failed: string[] = [];
  page.on("requestfailed", (request) => failed.push(request.url()));
  const served = await page.goto(`/apps/${TENANT}/clinics/front-desk/`);
  expect(served?.headers()["content-security-policy"]).toContain("sandbox allow-scripts");
  // The app drew: its script and styles came by their content name, and its calls were answered.
  await expect(page.locator("body")).toContainText("Front desk");
  expect(failed.filter((url) => url.includes("/_apps/"))).toEqual([]);
  expect(await probe(page)).toEqual({ ...ISOLATED, oldClient: "member", oldStream: "ready" });
  // A reload draws it again: nothing was kept in the browser, and nothing was needed.
  await page.reload();
  await expect(page.locator("body")).toContainText("Front desk");
});

test("@access @fernhill an end user's page of a code app is sandboxed, and works with its token", async ({
  browser,
}) => {
  // Jess works the front desk: she is signed in at Fernhill's portal, not the console.
  const page = await (await asPerson(browser, "jess")).newPage();
  await page.goto(`/apps/${TENANT}/clinics/front-desk/`);
  await expect(page.locator("body")).toContainText("Front desk");
  expect(await probe(page)).toEqual({ ...ISOLATED, oldClient: "end_user", oldStream: "ready" });
});
