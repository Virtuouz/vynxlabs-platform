import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DEFAULT_PRODUCT_NAME } from "./routes/branding.js";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.stop();
});

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

describe("the console's branding", () => {
  test("an instance nobody has branded shows the default name and no values", async () => {
    const branding = await t.anonymous.get("/instance/branding");
    expect(branding.status).toBe(200);
    expect(branding.body).toEqual({
      productName: DEFAULT_PRODUCT_NAME,
      named: false,
      logo: false,
      theme: { tokens: {}, dark: {} },
    });
    const css = await t.anonymous.get("/instance/theme.css");
    expect(css.headers["content-type"]).toContain("text/css");
    expect(css.body).not.toContain("--vx-");
  });

  test("an operator names it and sets tokens, and anyone may load them", async () => {
    const set = await t.admin.put("/instance/branding", {
      productName: "  Northwind Ops ",
      theme: {
        tokens: { action: "#7c3aed" },
        dark: { action: "#c4b5fd", "ink-subtle": "#8a94a3" },
      },
    });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.productName).toBe("Northwind Ops");
    expect(set.body.named).toBe(true);

    const css = (await t.anonymous.get("/instance/theme.css")).body as string;
    expect(css).toContain("--vx-action: #7c3aed;");
    expect(css).toContain("--vx-action: #c4b5fd;");
    expect(css).toContain("--vx-ink-subtle: #8a94a3;");
    // Only what was set: the console keeps its own value for the rest.
    expect(css).not.toContain("--vx-canvas");

    const back = await t.admin.put("/instance/branding", { productName: null });
    expect(back.body.productName).toBe(DEFAULT_PRODUCT_NAME);
    expect(back.body.theme.tokens).toEqual({ action: "#7c3aed" });
  });

  test("a value that could load something is refused", async () => {
    const refused = await t.admin.put("/instance/branding", {
      theme: { tokens: { canvas: "url(https://example.test/x.png)" } },
    });
    expect(refused.status).toBe(400);
    const unknown = await t.admin.put("/instance/branding", {
      theme: { tokens: { sparkle: "#ffffff" } },
    });
    expect(unknown.status).toBe(400);
  });

  test("a logo is set, served to anyone, and removed", async () => {
    expect((await t.anonymous.get("/instance/branding/logo")).status).toBe(404);
    const set = await t.admin.upload("/instance/branding/logo", PNG, "image/png", {}, "PUT");
    expect(set.status, JSON.stringify(set.body)).toBe(204);
    expect((await t.anonymous.get("/instance/branding")).body.logo).toBe(true);
    const logo = await t.anonymous.get("/instance/branding/logo");
    expect(logo.status).toBe(200);
    expect(logo.headers["content-type"]).toBe("image/png");
    expect(logo.bytes.equals(PNG)).toBe(true);

    expect(
      (await t.admin.upload("/instance/branding/logo", "hello", "text/html", {}, "PUT")).status,
    ).toBe(400);
    expect((await t.admin.delete("/instance/branding/logo")).status).toBe(204);
    expect((await t.anonymous.get("/instance/branding")).body.logo).toBe(false);
  });

  test("only an operator may brand the console", async () => {
    expect((await t.anonymous.put("/instance/branding", { productName: "Mine" })).status).toBe(401);
    await t.admin.post("/members", {
      email: "sam@example.com",
      name: "Sam",
      password: "a-good-long-password",
    });
    const sam = await t.signIn("sam@example.com", "a-good-long-password");
    expect((await sam.put("/instance/branding", { productName: "Mine" })).status).toBe(403);
    expect((await sam.upload("/instance/branding/logo", PNG, "image/png", {}, "PUT")).status).toBe(
      403,
    );
  });

  test("every branding route that changes something was exercised and audited", () => {
    expect(t.unaudited).toEqual([]);
    expect(t.unexercised((route) => route.includes("/instance/branding"))).toEqual([]);
  });
});
