import { signInWithPassword } from "../sign-in.ts";
import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "docs"'s pictures (packages/docs/shots/docs.mjs), by the name a shot's `setup` gives. */
const page = (frontmatter: string, body: string) => `---\n${frontmatter}\n---\n\n${body}`;

/** A workspace of its own with a small site of pages, "guide", deployed. */
async function site(given: Given, slug: string, name: string) {
  const { call, tenant } = given;
  const workspace = await call("POST", `/tenants/${tenant.id}/workspaces`, {
    slug,
    name,
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${workspace.id}`;
  const pages: Record<string, string> = {
    "guide/index": page(
      "title: Front desk guide\ntype: explanation\nsubjects: [visits, billing]",
      "How the front desk works, from a booking to a bill.\n",
    ),
    "guide/front-desk/index": page(
      "title: At the front desk\npages: [booking, checking-in]",
      "Booking and checking in.\n",
    ),
    "guide/front-desk/booking": page(
      "title: Booking a visit\ndescription: Which slot to give, and what to ask.\ntype: how-to\nsubjects: [visits, front-desk]",
      "# Book a visit\n\nEvery booking is a row of the appointments table.\n\n1. Ask the owner for the pet's name.\n2. Give the next free slot.\n",
    ),
    "guide/front-desk/checking-in": page(
      "title: Checking in\ntype: tutorial\nsubjects: [check-in, visits]",
      "Welcome an owner who has just come through the door.\n",
    ),
    "guide/billing/index": page(
      "title: Billing\ntype: reference\nsubjects: [billing]",
      "What each visit costs.\n",
    ),
  };
  for (const [path, source] of Object.entries(pages)) {
    await call("PUT", `${W}/drafts/${path}`, {
      kind: "doc",
      schemaVersion: 1,
      create: true,
      body: { source },
    });
  }
  await call("PUT", `${W}/drafts/guide`, {
    kind: "app",
    schemaVersion: 1,
    create: true,
    body: { title: "Front desk guide", docs: "guide" },
  });
  await call("POST", `${W}/changes/deploy`, {});
  return { W, at: `/t/${tenant.id}/workspaces/${workspace.id}` };
}

export const scenes: Record<string, Scene> = {
  // A page whose top says it is a how-to guide about visits and the front desk.
  "docs-type": async (given) => ({ at: (await site(given, "docs-type", "Guide")).at }),

  // A page another person saves again and again, so that a save made from a page opened a
  // moment before is always one made over a version it did not see: the editor shows the
  // conflict. A second sign-in of the administrator stands for that other person.
  "docs-clash": async (given) => {
    const { W, at } = await site(given, "docs-clash", "Guide");
    const other = await given.page.context().browser()?.newContext();
    if (!other) throw new Error("The scene needs the browser to make a second session.");
    const stranger = await other.newPage();
    await signInWithPassword(
      stranger,
      process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
      process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
    );
    const path = "guide/front-desk/booking";
    const bump = async () => {
      try {
        await stranger.evaluate(
          async ([root, at]) => {
            const seen = await (await fetch(`/api/v1${root}/drafts/${at}`)).json();
            const now = await fetch(`/api/v1${root}/docs/page/${at}`);
            const source: string = now.ok ? (await now.json()).source : seen.body.source;
            await fetch(`/api/v1${root}/drafts/${at}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                kind: "doc",
                schemaVersion: 1,
                revision: seen.revision,
                body: { source: `${source.replace(/\n*Their line\.\n*$/, "\n")}\nTheir line.\n` },
              }),
            });
          },
          [W, path] as const,
        );
      } catch {
        // The browser is closed at the end of the run.
      }
    };
    // The first save makes the draft that the page then opens at.
    await bump();
    const timer = setInterval(() => void bump(), 400);
    timer.unref();
    return { at };
  },
};
