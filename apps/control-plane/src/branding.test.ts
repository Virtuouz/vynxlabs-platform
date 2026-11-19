import { crc32 } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { defaultIcon, pngSize } from "./kernel/icons.js";
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

/** A PNG text chunk: `tEXt`, "k" and nothing, with its checksum. A reader skips it. */
const TEXT_CHUNK = (() => {
  const body = Buffer.from("tEXtk\0v", "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length - 4);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, check]);
})();

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

  test("the console has an icon from the start, takes one of each size made from its logo, and gives them back", async () => {
    const raw = (url: string) => t.app.inject({ method: "GET", url });
    // Nobody has set a logo: the platform's own icon, as an .ico at the root and as a PNG by size.
    const first = await raw("/favicon.ico");
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("image/x-icon");
    expect(first.rawPayload.subarray(22).equals(defaultIcon(32))).toBe(true);
    const fallback = await raw("/api/v1/instance/branding/icons/180");
    expect(fallback.headers["content-type"]).toBe("image/png");
    expect(pngSize(fallback.rawPayload)).toEqual({ width: 180, height: 180 });
    expect((await raw("/api/v1/instance/branding/icons/64")).statusCode).toBe(404);

    // What is sent must be a PNG, and of the size its address says.
    const icon = (size: number, body: Buffer | string, type = "image/png") =>
      t.admin.upload(`/instance/branding/icons/${size}`, body, type, {}, "PUT");
    expect((await icon(32, "<svg/>", "image/svg+xml")).status).toBe(400);
    expect((await icon(32, "not an image")).status).toBe(400);
    const wrong = await icon(32, PNG);
    expect(wrong.status).toBe(400);
    expect(wrong.body.detail).toBe("The icon is 1 by 1 pixels, and this address takes 32 by 32.");
    expect((await icon(64, PNG)).status).toBe(404);
    expect(
      (await t.anonymous.upload("/instance/branding/icons/32", PNG, "image/png", {}, "PUT")).status,
    ).toBe(401);

    // One of each size, as a browser would draw them from a logo. A stand-in here: any PNG of the size.
    const drawn = (size: number) => {
      const png = Buffer.from(defaultIcon(size));
      // Told apart from the default by a text chunk a reader skips.
      return Buffer.concat([
        png.subarray(0, png.length - 12),
        TEXT_CHUNK,
        png.subarray(png.length - 12),
      ]);
    };
    for (const size of [32, 180, 192, 512]) {
      expect((await icon(size, drawn(size))).status, String(size)).toBe(204);
    }
    const tab = await raw("/favicon.ico");
    expect(tab.rawPayload.subarray(22).equals(drawn(32))).toBe(true);
    expect(tab.rawPayload.readUInt32LE(14)).toBe(drawn(32).length);
    expect((await raw("/api/v1/instance/branding/icons/512")).rawPayload.equals(drawn(512))).toBe(
      true,
    );
    // Set again, the one before it is not kept.
    expect((await icon(32, defaultIcon(32))).status).toBe(204);

    // The console named for a home screen, with the two large icons.
    await t.admin.put("/instance/branding", { productName: "Northwind Ops" });
    const manifest = await raw("/site.webmanifest");
    expect(manifest.headers["content-type"]).toContain("application/manifest+json");
    expect(manifest.json()).toMatchObject({
      name: "Northwind Ops",
      icons: [
        { src: "/api/v1/instance/branding/icons/192", sizes: "192x192" },
        { src: "/api/v1/instance/branding/icons/512", sizes: "512x512" },
      ],
    });

    // Removed, the console goes back to the platform's own.
    expect((await t.admin.delete("/instance/branding/icons")).status).toBe(204);
    expect((await raw("/favicon.ico")).rawPayload.subarray(22).equals(defaultIcon(32))).toBe(true);
  });

  test("a tenant's icons are its own, and its sign-in page names them", async () => {
    const tenant = (
      await t.admin.post("/tenants", { slug: "icons", name: "Icons", addCreator: true })
    ).body;
    const at = `/tenants/${tenant.id}/portal/icons`;
    const raw = (url: string) => t.app.inject({ method: "GET", url });
    // A tenant with no logo has no icon, and its pages name none.
    expect((await raw(`/api/v1${at}/32`)).statusCode).toBe(404);
    const before = await raw(`/portal/${tenant.slug}/sign-in`);
    expect(before.statusCode).toBe(200);
    expect(before.payload).not.toContain('rel="icon"');

    expect((await t.admin.upload(`${at}/32`, PNG, "image/png", {}, "PUT")).status).toBe(400);
    for (const size of [32, 180]) {
      const set = await t.admin.upload(`${at}/${size}`, defaultIcon(size), "image/png", {}, "PUT");
      expect(set.status, JSON.stringify(set.body)).toBe(204);
    }
    const served = await raw(`/api/v1${at}/180`);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(pngSize(served.rawPayload)).toEqual({ width: 180, height: 180 });
    const page = await raw(`/portal/${tenant.slug}/sign-in`);
    expect(page.payload).toContain(
      `<link rel="icon" type="image/png" sizes="32x32" href="/api/v1${at}/32"><link rel="apple-touch-icon" href="/api/v1${at}/180">`,
    );
    // Another tenant has none of it.
    const other = (
      await t.admin.post("/tenants", { slug: "plain", name: "Plain", addCreator: true })
    ).body;
    expect((await raw(`/api/v1/tenants/${other.id}/portal/icons/32`)).statusCode).toBe(404);

    expect((await t.admin.delete(at)).status).toBe(204);
    expect((await raw(`/api/v1${at}/32`)).statusCode).toBe(404);
    expect((await raw(`/portal/${tenant.slug}/sign-in`)).payload).not.toContain('rel="icon"');
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
    expect(
      t.unexercised(
        (route) => route.includes("/instance/branding") || route.includes("/portal/icons"),
      ),
    ).toEqual([]);
  });
});
