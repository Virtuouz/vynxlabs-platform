import type { Page } from "@playwright/test";

/**
 * Signs in with a password from the console's own form. The auth library allows twenty
 * sign-ins a minute from one address: each worker sends an address of its own (see
 * `test.ts`), so a 429 is rare, and when it comes it says how long to wait (Retry-After).
 * It returns once the form has gone, wherever the console then opens: it reopens
 * the last place a member was.
 *
 * Most specs do not sign in through the form: `as.ts` gives a person already signed in.
 * This is for the specs that test the form, and for members a spec makes itself.
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
    const response = await answer;
    if (response.status() !== 429 || attempt === 4) break;
    const told = Number(response.headers()["retry-after"]);
    await page.waitForTimeout((Number.isFinite(told) && told > 0 ? told : 10) * 1000 + 500);
  }
  await page
    .getByRole("heading", { name: "Sign in" })
    .waitFor({ state: "detached", timeout: 15_000 });
}
