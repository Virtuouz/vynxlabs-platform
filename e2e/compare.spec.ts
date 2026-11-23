import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * Run comparison (phase 15, P3-7): a script that worked fails after a
 * deploy, and its run page says what changed since it last worked: the
 * version, with the source's difference one press away.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const stamp = Date.now().toString(36);

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
const call = (page: Page, method: string, path: string, body?: unknown): Promise<any> =>
  page.evaluate(
    async ([method, path, body]) => {
      // A draft save names the draft it saw: its revision now, or none when there is none.
      if (
        method === "PUT" &&
        String(path).includes("/drafts/") &&
        body &&
        typeof body === "object" &&
        !("revision" in body) &&
        !("create" in body)
      ) {
        const seen = await fetch(`/api/v1${path}`);
        if (seen.ok) body = { ...body, revision: (await seen.json()).revision };
      }
      const response = await fetch(`/api/v1${path}`, {
        method: method as string,
        headers: body ? { "content-type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      if (response.status >= 300) throw new Error(`${method} ${path}: ${response.status} ${text}`);
      return text ? JSON.parse(text) : null;
    },
    [method, path, body] as const,
  );

const script = (code: string) => ({
  kind: "script",
  schemaVersion: 1,
  body: {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});

test("a run that fails after a deploy says the version changed, and shows the source's difference", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `compare-${stamp}`,
    name: "Compare",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const finished = async (id: string) => {
    await expect
      .poll(async () => (await call(page, "GET", `${W}/runs/${id}`)).status, { timeout: 90_000 })
      .toMatch(/succeeded|failed/);
    return (await call(page, "GET", `${W}/runs/${id}`)).status as string;
  };

  await call(
    page,
    "PUT",
    `${W}/drafts/stock/check`,
    script("export default async () => ({ stock: 4 });\n"),
  );
  await call(page, "POST", `${W}/changes/deploy`, {});
  const worked = (
    await call(page, "POST", `${W}/runs`, { script: "stock/check", input: { sku: "A-1" } })
  ).id;
  expect(await finished(worked)).toBe("succeeded");

  await call(
    page,
    "PUT",
    `${W}/drafts/stock/check`,
    script('export default async () => {\n  throw new Error("The warehouse moved");\n};\n'),
  );
  await call(page, "POST", `${W}/changes/deploy`, {});
  const broke = (
    await call(page, "POST", `${W}/runs`, { script: "stock/check", input: { sku: "A-1" } })
  ).id;
  expect(await finished(broke)).toBe("failed");

  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/runs/${broke}`);
  const since = page.getByRole("region", { name: "Since it last worked" });
  await expect(since).toBeVisible({ timeout: 30_000 });
  await expect(since.getByText("v1 then, v2 now")).toBeVisible();
  await expect(since.getByText("The same as the last success")).toBeVisible();
  await expectNoAxeViolations(page, "a failed run, compared with its last success");
  await since.getByRole("link", { name: /Compare the source/ }).click();
  const diff = page.getByTestId("source-diff").first();
  await expect(diff).toBeVisible({ timeout: 30_000 });
  await expect(diff).toContainText("The warehouse moved");
  await expect(diff).toContainText("stock: 4");

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
