import { newId } from "@volvel/db";
import { afterAll, describe, expect, test } from "vitest";
import { parseTrustedProxies } from "./config.js";
import { startTestApp, type TestApp } from "./testing.js";

/**
 * HOST-05, API-15, API-20: the address of a caller is what the proxy in front of the
 * instance says it saw, and what the caller wrote before it is not believed. Limits count
 * by that address, in the table every replica shares.
 */
const apps: TestApp[] = [];
afterAll(async () => {
  await Promise.all(apps.map((app) => app.stop()));
});

/** Sends `count` sign-in attempts, each naming a different made-up address first. */
async function attempts(
  app: TestApp,
  count: number,
  url: string,
  headerFor: (index: number) => Record<string, string>,
  payload: object,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const response = await app.app.inject({
      method: "POST",
      url,
      headers: { origin: "http://localhost:8080", ...headerFor(index) },
      payload,
    });
    statuses.push(response.statusCode);
  }
  return statuses;
}
const forged = (index: number) => ({
  // What a caller writes, then what the one proxy appended: the same real address every time.
  "x-forwarded-for": `10.1.${Math.floor(index / 250)}.${(index % 250) + 1}, 203.0.113.9`,
});
const member = { email: "nobody@example.com", password: "wrong-password-1" };
const enduser = (tenant: string) => `/api/v1/tenants/${tenant}/end-user-auth/sign-in`;

describe("whose address is believed", { timeout: 60_000 }, () => {
  test("with one proxy, an address the caller wrote does not give a limit a new count", async () => {
    const app = await startTestApp({ config: { authLimits: true } });
    apps.push(app);
    const statuses = await attempts(app, 24, "/api/v1/auth/sign-in/email", forged, member);
    expect(statuses.slice(0, 20).every((status) => status !== 429)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429, 429, 429]);
    const tenant = newId();
    const users = await attempts(app, 24, enduser(tenant), forged, {
      email: "a@example.com",
      password: "wrong-password-1",
    });
    expect(users.slice(20)).toEqual([429, 429, 429, 429]);
  });

  test("with none trusted, a header is not read at all", async () => {
    const app = await startTestApp({ config: { authLimits: true, trustedProxies: 0 } });
    apps.push(app);
    // Each names a different last address too; with none trusted they are one caller.
    const header = (index: number) => ({ "x-forwarded-for": `198.51.100.${index + 1}` });
    const statuses = await attempts(app, 22, "/api/v1/auth/sign-in/email", header, member);
    expect(statuses.slice(20)).toEqual([429, 429]);
    const users = await attempts(app, 22, enduser(newId()), header, {
      email: "a@example.com",
      password: "wrong-password-1",
    });
    expect(users.slice(20)).toEqual([429, 429]);
  });

  test("callers behind the proxy are counted each by their own address", async () => {
    const app = await startTestApp({ config: { authLimits: true } });
    apps.push(app);
    const own = (index: number) => ({ "x-forwarded-for": `203.0.113.${index + 1}` });
    const statuses = await attempts(app, 24, "/api/v1/auth/sign-in/email", own, member);
    expect(statuses.includes(429)).toBe(false);
  });

  test("an address the caller names in the library's own header is not believed", async () => {
    const app = await startTestApp({ config: { authLimits: true } });
    apps.push(app);
    const header = (index: number) => ({
      "x-volvel-client-address": `192.0.2.${index + 1}`,
      "x-forwarded-for": "203.0.113.9",
    });
    const statuses = await attempts(app, 22, "/api/v1/auth/sign-in/email", header, member);
    expect(statuses.slice(20)).toEqual([429, 429]);
  });
});

describe("TRUSTED_PROXIES", () => {
  test("is a number of proxies, or networks, and says what it refuses", () => {
    expect(parseTrustedProxies(undefined)).toBe(1);
    expect(parseTrustedProxies("")).toBe(1);
    expect(parseTrustedProxies("0")).toBe(0);
    expect(parseTrustedProxies("2")).toBe(2);
    expect(parseTrustedProxies("10.0.0.0/8, 172.16.0.0/12,::1")).toEqual([
      "10.0.0.0/8",
      "172.16.0.0/12",
      "::1",
    ]);
    expect(parseTrustedProxies("11")).toMatch(/from 0 to 10/);
    expect(parseTrustedProxies("10.0.0.0/33")).toMatch(/not a network: 10.0.0.0\/33/);
    expect(parseTrustedProxies("proxy.internal")).toMatch(/not a network/);
  });
});
