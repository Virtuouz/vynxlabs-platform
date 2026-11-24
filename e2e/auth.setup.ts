import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { authFile, PEOPLE, type Who } from "./as.ts";
import { signInWithPassword } from "./sign-in.ts";
import { expect, test } from "./test.ts";

/**
 * The `setup` project: signs in each person the specs use, once, and saves their session to
 * `e2e/.auth/<who>.json` (not in git). Fernhill's people are signed in only when the instance
 * has Fernhill, which the CI groups that never use it do not seed (E2E_GROUP a and b).
 */
const withoutFernhill = process.env.E2E_GROUP === "a" || process.env.E2E_GROUP === "b";

for (const who of Object.keys(PEOPLE) as Who[]) {
  const one = PEOPLE[who];
  test(`sign in ${who}`, async ({ browser }) => {
    test.skip(one.fernhill && withoutFernhill, "This group does not seed Fernhill.");
    mkdirSync(dirname(authFile(who)), { recursive: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    if (one.portal) {
      await page.goto("/portal/fernhill/");
      await page
        .getByRole("link", { name: "Sign in" })
        .or(page.getByRole("button", { name: "Sign in" }))
        .first()
        .click();
      await page.getByLabel(/Email/).first().fill(one.email);
      const next = page.getByRole("button", { name: "Continue" });
      if (await next.count()) await next.click();
      await page
        .getByLabel(/Password/)
        .first()
        .fill(one.password);
      await page
        .getByRole("button", { name: /Sign in/ })
        .last()
        .click();
      await expect(page.getByText("Front desk").first()).toBeVisible({ timeout: 20_000 });
    } else {
      await signInWithPassword(page, one.email, one.password);
    }
    await context.storageState({ path: authFile(who) });
    await context.close();
  });
}
