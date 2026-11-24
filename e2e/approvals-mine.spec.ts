import { signInAs } from "./as.ts";
import { fernhillTenant } from "./fernhill.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * The overview's count of approvals is the queue "Decide" opens (phase 22, M5). It runs
 * against the Fernhill example (`examples/fernhill/setup/setup.mjs`), where the clinics
 * workspace has flows that wait for a decision. A viewer sees them waiting but may not
 * decide them, so the overview says so and offers no Decide button; whoever may decide is
 * told how many wait for them, and the queue lists exactly those.
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = fernhillTenant();
const WORKSPACE = process.env.E2E_FERNHILL_WORKSPACE ?? "clinics";

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
const get = (page: Page, path: string): Promise<any> =>
  page.evaluate(async (path) => (await fetch(`/api/v1${path}`)).json(), path);

/** The workspace's address in the API and in the console. */
async function open(page: Page) {
  const tenants = await get(page, "/tenants");
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const workspaces = await get(page, `/tenants/${tenant.id}/workspaces`);
  const workspace = workspaces.items.find((one: { slug: string }) => one.slug === WORKSPACE);
  test.skip(!workspace, `No workspace ${WORKSPACE} in ${TENANT}.`);
  return {
    api: `/tenants/${tenant.id}/workspaces/${workspace.id}`,
    console: `/t/${tenant.id}/workspaces/${workspace.id}`,
  };
}

for (const person of [
  { email: "amara.okafor@fernhill.example", who: "the viewer" },
  { email: "devi.shah@fernhill.example", who: "the developer" },
  { email: "maya.brooks@fernhill.example", who: "the practice owner" },
]) {
  test(`as ${person.who}, the overview's count matches the queue Decide opens @fernhill @access`, async ({
    page,
  }) => {
    await signInAs(page, person.email, PASSWORD);
    const where = await open(page);
    const summary = await get(page, `${where.api}/summary`);
    test.skip(!summary.approvalsWaiting, "Nothing waits for a decision in this workspace.");
    const mine = (await get(page, `${where.api}/approvals?mine=true`)).items.length;
    expect(summary.approvalsWaitingMine).toBe(mine);

    await page.goto(`${where.console}/overview`);
    if (mine > 0) {
      await expect(page.getByText(`waiting for you`).first()).toBeVisible();
      await page.getByRole("button", { name: "Decide" }).click();
      await expect(page).toHaveURL(new RegExp(`${where.console}/approvals`));
      // The queue lists exactly what the overview counted.
      await expect(page.getByRole("radio", { name: /Waiting for you/ })).toContainText(
        String(mine),
      );
    } else {
      // Nothing is the viewer's to decide: the overview says so, and offers no Decide.
      await expect(page.getByText("waiting for someone else to decide")).toBeVisible();
      await expect(page.getByRole("button", { name: "Decide" })).toHaveCount(0);
      await page.getByRole("button", { name: "See who" }).click();
      await expect(page).toHaveURL(/show=others/);
      await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    }
  });
}
