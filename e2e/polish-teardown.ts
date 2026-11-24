import { existsSync, readFileSync, rmSync } from "node:fs";
import { request } from "@playwright/test";
import { sharedFile } from "./polish-setup.ts";

/**
 * The run's global teardown: deletes the polish tenant its workers shared, if one was built
 * (`polish-setup.ts`). The runner is the process that started the workers, so the file is named
 * for its own process id.
 */
export default async function teardown() {
  const file = sharedFile(process.pid);
  if (!existsSync(file)) return;
  const { tenant, W, waitingRun } = JSON.parse(readFileSync(file, "utf8")) as {
    tenant: { id: string; slug: string };
    W?: string;
    waitingRun?: string;
  };
  const base = process.env.E2E_URL ?? "http://localhost:8080";
  // The auth library refuses a sign-in that does not say where it comes from.
  const api = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  try {
    const signedIn = await api.post("/api/v1/auth/sign-in/email", {
      data: {
        email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
        password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
      },
    });
    // The tenant holds a flow run waiting for approval on purpose: a tenant with a run in
    // progress is not deleted, so it is canceled first.
    if (signedIn.ok() && W && waitingRun)
      await api.post(`/api/v1${W}/flow-runs/${waitingRun}/cancel`, { data: {} });
    const deleted = signedIn.ok()
      ? await api.post(`/api/v1/tenants/${tenant.id}/deletion`, { data: { confirm: tenant.slug } })
      : signedIn;
    if (!deleted.ok())
      console.warn(
        `The polish tenant ${tenant.slug} was not deleted: ${deleted.status()} ${await deleted.text()}`,
      );
  } finally {
    await api.dispose();
    rmSync(file, { force: true });
  }
}
