import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { authFile, PEOPLE } from "./as.ts";
import { copySlug, FERNHILL_COPIES } from "./fernhill.ts";
import { signInToPortal } from "./sign-in.ts";
import { test } from "./test.ts";

/**
 * The `fernhill-copies` project, a dependency of `fernhill` only: makes the copies of Fernhill
 * that the project's workers walk, one each (`fernhill.ts`), and signs Jess in at each copy's
 * portal. A copy is made once per instance: one already there is left as it is, so a second
 * run starts at once. The copies are seeded side by side, by the example's own seed
 * (`examples/fernhill/setup/setup.mjs`, FERNHILL_SLUG) against the stand-ins they share.
 * A copy a run left half-made is deleted by hand and made again by the next run.
 */
const exec = promisify(execFile);
const seed = join(dirname(fileURLToPath(import.meta.url)), "../examples/fernhill/setup/setup.mjs");
const URL_ = process.env.E2E_URL ?? "http://localhost:8080";

test("Fernhill has its copies", async ({ browser, request }) => {
  test.setTimeout(1_200_000);
  const signedIn = await request.post(`${URL_}/api/v1/auth/sign-in/email`, {
    headers: { origin: URL_ },
    data: {
      email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
      password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
    },
  });
  test.fail(!signedIn.ok(), `The operator could not sign in: ${signedIn.status()}`);
  const listed = await request.get(`${URL_}/api/v1/tenants?search=fernhill-w&limit=200`);
  const have = new Set(((await listed.json()).items as { slug: string }[]).map((one) => one.slug));
  const wanted = Array.from({ length: FERNHILL_COPIES }, (_, index) => copySlug(index));
  const missing = wanted.filter((slug) => !have.has(slug));

  // The seed is the example's own, told which copy to make; a copy's seed writes no demo.json.
  const made = await Promise.allSettled(
    missing.map((slug) =>
      exec("node", [seed], {
        env: {
          ...process.env,
          FERNHILL_SLUG: slug,
          VOLVEL_URL: URL_,
          VOLVEL_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
          VOLVEL_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
        },
        maxBuffer: 64 * 1024 * 1024,
      }),
    ),
  );
  const failed = made.flatMap((one, index) =>
    one.status === "rejected"
      ? [
          `${missing[index]}: ${String((one.reason as { stderr?: string }).stderr ?? one.reason).slice(-1500)}`,
        ]
      : [],
  );
  if (failed.length > 0) throw new Error(`A copy of Fernhill was not made:\n${failed.join("\n")}`);

  // Jess's portal session is one tenant's: one for each copy.
  const jess = PEOPLE.jess;
  for (const slug of wanted) {
    mkdirSync(dirname(authFile("jess", slug)), { recursive: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInToPortal(page, slug, jess.email, jess.password);
    await context.storageState({ path: authFile("jess", slug) });
    await context.close();
  }
});
