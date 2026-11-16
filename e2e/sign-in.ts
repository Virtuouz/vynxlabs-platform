import type { Page } from "@playwright/test";

/**
 * Signs in with a password from the console's own form. The auth library allows
 * three sign-ins in ten seconds from one address, and every spec signs in from
 * the same one, so a sign-in refused with 429 waits out the window and tries again.
 * It returns once the form has gone, wherever the console then opens: it reopens
 * the last place a member was.
 */
export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(password);
  for (let attempt = 1; ; attempt += 1) {
    const answer = page.waitForResponse(
      (response) =>
        response.url().includes("/auth/sign-in/email") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    if ((await answer).status() !== 429 || attempt === 4) break;
    await page.waitForTimeout(10_500);
  }
  await page
    .getByRole("heading", { name: "Sign in" })
    .waitFor({ state: "detached", timeout: 15_000 });
}
