import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "@playwright/test";
import { fernhillTenant } from "./fernhill.ts";
import { signInWithPassword } from "./sign-in.ts";

/**
 * The people the specs sign in as, signed in once by `auth.setup.ts` (the `setup` project)
 * and kept as storage state in `e2e/.auth/<who>.json`. A spec that is not about signing in
 * takes one with `asPerson` and does not use the form: each form sign-in is a page load, two
 * fills and a request, and 116 of them were a large part of the suite's time.
 */
export const FERNHILL_PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";

export const PEOPLE = {
  operator: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
    fernhill: false,
    portal: false,
  },
  maya: person("maya.brooks"),
  rowan: person("rowan.ellis"),
  devi: person("devi.shah"),
  amara: person("amara.okafor"),
  // An end user of the front desk: signed in at Fernhill's portal, not the console.
  jess: { ...person("jess.morgan"), portal: true },
} as const;

function person(local: string) {
  return {
    email: `${local}@fernhill.example`,
    password: FERNHILL_PASSWORD,
    fernhill: true,
    portal: false,
  };
}

export type Who = keyof typeof PEOPLE;

const here = dirname(fileURLToPath(import.meta.url));
/**
 * A console session is the person's own, the same in every copy of Fernhill. A portal session
 * is one tenant's (a cookie for each), so Jess has one for each copy: `jess.json` for the
 * first `fernhill`, `jess-<copy>.json` for a copy. Without `slug`, a portal person's is the
 * session for this worker's Fernhill.
 */
export const authFile = (who: Who, slug?: string) => {
  if (!PEOPLE[who].portal) return join(here, ".auth", `${who}.json`);
  const tenant = slug ?? fernhillTenant();
  return join(here, ".auth", tenant === "fernhill" ? `${who}.json` : `${who}-${tenant}.json`);
};

/** A person by key (`maya`) or by address (`maya.brooks@fernhill.example`). */
export function whoIs(who: string): Who | undefined {
  if (who in PEOPLE) return who as Who;
  return (Object.keys(PEOPLE) as Who[]).find((key) => PEOPLE[key].email === who);
}

/** A new context holding the person's saved session; `options` are the context's own (viewport...). */
export async function asPerson(
  browser: Browser,
  who: string,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const key = whoIs(who);
  if (!key) throw new Error(`asPerson: nobody called ${who}; see PEOPLE in e2e/as.ts`);
  if (!existsSync(authFile(key))) {
    throw new Error(
      `No saved session for ${key}: run the "setup" project first (e2e/auth.setup.ts).`,
    );
  }
  return browser.newContext({ storageState: authFile(key), ...options });
}

/** `asPerson`, and its first page: the console, with that person in it. */
export async function pageAs(
  browser: Browser,
  who: string,
  options: BrowserContextOptions = {},
): Promise<Page> {
  const page = await (await asPerson(browser, who, options)).newPage();
  const key = whoIs(who) as Who;
  // A saved session can be gone (a sign-out elsewhere, a changed password): sign in again.
  if (!PEOPLE[key].portal) {
    await ensureSignedIn(page, key);
    await page.goto("/");
  }
  return page;
}

async function ensureSignedIn(page: Page, key: Who) {
  const me = await page.context().request.get("/api/v1/me");
  if (!me.ok()) await signInWithPassword(page, PEOPLE[key].email, PEOPLE[key].password);
}

/**
 * For a page that already has a context (made by a spec for its own width and so on): puts the
 * person's saved session into it, and opens the console as the form's sign-in left it.
 */
export async function signInAs(page: Page, who: string, password?: string) {
  const key = whoIs(who);
  if (!key || !existsSync(authFile(key))) {
    // Someone a spec made itself, or a saved session that was never made: the form.
    const known = key ? PEOPLE[key] : undefined;
    if (!known && password === undefined) throw new Error(`signInAs: nobody called ${who}`);
    await signInWithPassword(page, known?.email ?? who, known?.password ?? (password as string));
    return;
  }
  const state = JSON.parse(readFileSync(authFile(key), "utf8")) as {
    cookies: Parameters<BrowserContext["addCookies"]>[0];
  };
  await page.context().addCookies(state.cookies);
  await ensureSignedIn(page, key);
  await page.goto("/");
}

const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";

/**
 * A member of a tenant who is no one else: made by the operator, signed in through the form in
 * a browser of their own. A spec that changes what a member keeps (the width of a pane, a
 * shortcut setting) does it as this person, so that it does not change the operator's, which
 * every other spec running at the same time is signed in as.
 */
export async function ownMember(
  browser: Browser,
  operator: Page,
  tenantId: string,
  options: BrowserContextOptions = {},
): Promise<Page> {
  const email = `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@e2e.example`;
  const password = "an-own-member-password-1";
  const made = await operator.evaluate(
    async ([id, address, secret, role]) => {
      const response = await fetch(`/api/v1/tenants/${id}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: address,
          name: "An own member",
          password: secret,
          bindings: [{ roleId: role }],
        }),
      });
      return { status: response.status, text: await response.text() };
    },
    [tenantId, email, password, TENANT_ADMIN] as const,
  );
  if (made.status >= 300) throw new Error(`ownMember: ${made.status} ${made.text}`);
  const page = await (await browser.newContext(options)).newPage();
  await signInWithPassword(page, email, password);
  return page;
}
