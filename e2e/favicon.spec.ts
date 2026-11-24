import { signInWithPassword } from "./sign-in.ts";
import { expect, test } from "./test.ts";

/**
 * Phase 18, M12: a logo set for the console gives it an icon. The icons are
 * drawn from the logo by the browser, at each size the platform keeps, and
 * the tab's icon is one of them from then on.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};

/** A logo that is wider than it is tall, in one flat colour that is easy to find again. */
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><rect width="200" height="100" fill="#ff00aa"/></svg>`;

test("a logo uploaded for the console becomes the icon in the tab, at every size, and goes when the logo does @instance", async ({
  browser,
}) => {
  const page = await (
    await browser.newContext({ viewport: { width: 1400, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  // What an icon is: its size, and the colour at its very middle.
  const read = (path: string) =>
    page.evaluate(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      const type = response.headers.get("content-type");
      const bytes = new Uint8Array(await response.arrayBuffer());
      // An .ico holds its PNG after a header of 22 bytes.
      const png = type === "image/x-icon" ? bytes.slice(22) : bytes;
      const image = await createImageBitmap(new Blob([png], { type: "image/png" }));
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      context.drawImage(image, 0, 0);
      const at = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
      return {
        status: response.status,
        type,
        width: image.width,
        height: image.height,
        middle: at(Math.floor(image.width / 2), Math.floor(image.height / 2)),
        top: at(Math.floor(image.width / 2), 1),
      };
    }, path);

  // The page names its icon, and an instance with no logo has the platform's own.
  await page.goto("/instance/branding");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.ico");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
  // Left over from an earlier run, a logo is taken off first.
  const remove = page.getByRole("button", { name: "Remove logo" });
  if (await remove.isVisible().catch(() => false)) {
    await remove.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Remove/ })
      .click();
    await expect(remove).toHaveCount(0);
  }
  const before = await read("/favicon.ico");
  expect(before).toMatchObject({ status: 200, type: "image/x-icon", width: 32, height: 32 });
  expect(before.middle.slice(0, 3)).not.toEqual([255, 0, 170]);

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(LOGO),
    });
  await expect(page.getByText("The logo is replaced.")).toBeVisible();
  // The icons follow the logo: drawn and sent one after another.
  await expect
    .poll(async () => (await read("/api/v1/instance/branding/icons/512")).middle)
    .toEqual([255, 0, 170, 255]);

  // Each size is the logo: its colour in the middle. It is twice as wide as it is tall, and
  // is fitted whole by its width, so the square's top edge is left clear.
  for (const size of [32, 180, 192, 512]) {
    const icon = await read(`/api/v1/instance/branding/icons/${size}`);
    expect(icon, String(size)).toMatchObject({
      status: 200,
      type: "image/png",
      width: size,
      height: size,
    });
    expect(icon.middle, String(size)).toEqual([255, 0, 170, 255]);
    expect(icon.top[3], String(size)).toBe(0);
  }
  const tab = await read("/favicon.ico");
  expect(tab.middle).toEqual([255, 0, 170, 255]);
  const manifest = await page.evaluate(async () => (await fetch("/site.webmanifest")).json());
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);

  // With the logo gone, so are its icons.
  await page.getByRole("button", { name: "Remove logo" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Remove/ })
    .click();
  await expect(page.getByRole("button", { name: "Remove logo" })).toHaveCount(0);
  await expect
    .poll(async () => (await read("/favicon.ico")).middle.slice(0, 3))
    .not.toEqual([255, 0, 170]);
  await page.context().close();
});
