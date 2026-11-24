import { type Browser, type BrowserContext, test as base } from "@playwright/test";

export * from "@playwright/test";

/**
 * Every journey is also a test of motion (phase 19, M1). Whatever a spec
 * opens, a sheet, a dialog, a popover or a panel marked `data-drawer`, has to
 * arrive with its starting style and leave with its ending one: those are
 * what its transition runs between, so one that has neither appeared or went
 * in a single frame. A spec has nothing to do for this but import `test` from
 * here, and a drawer added next year is held to it by whichever spec opens it.
 *
 * Under reduced motion nothing is asked: there it is right to be there or not.
 */

/** Runs in the page, before any of its own code. */
function watchOverlays() {
  const OVERLAY = '[role="dialog"], [data-drawer]';
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const report = (window as unknown as { __overlayFault?: (text: string) => void }).__overlayFault;
  const openedAt = new WeakMap<Element, string>();
  const named = (node: Element) =>
    node.getAttribute("aria-label") ??
    node.querySelector("h1, h2, h3")?.textContent ??
    (node.querySelector("[aria-label]")?.getAttribute("aria-label") ||
      node.textContent?.slice(0, 60)) ??
    node.tagName;
  const each = (node: Node, then: (overlay: Element) => void) => {
    if (!(node instanceof Element)) return;
    if (node.matches(OVERLAY)) then(node);
    for (const inner of node.querySelectorAll(OVERLAY)) then(inner);
  };
  let leaving = false;
  addEventListener("pagehide", () => {
    leaving = true;
  });
  // A panel that measures itself may leave its starting style before this is told it arrived.
  const started = new WeakSet<Element>();
  const ended = new WeakSet<Element>();
  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type !== "attributes" || !(change.target instanceof Element)) continue;
      if (change.attributeName === "data-starting-style") started.add(change.target);
      if (change.attributeName === "data-ending-style") ended.add(change.target);
    }
    for (const change of changes) {
      if (change.type !== "childList") continue;
      for (const node of change.addedNodes) {
        each(node, (overlay) => {
          if (openedAt.has(overlay)) return;
          openedAt.set(overlay, `${location.pathname} ${innerWidth}`);
          if (still() || overlay.closest("[data-motion-exempt]")) return;
          if (!overlay.hasAttribute("data-starting-style") && !started.has(overlay)) {
            report?.(`"${named(overlay)}" appeared without moving, at ${location.pathname}`);
          }
        });
      }
      for (const node of change.removedNodes) {
        each(node, (overlay) => {
          const from = openedAt.get(overlay);
          if (from === undefined || still() || leaving) return;
          // Going to another page takes the screen with it, and a window made narrower turns a
          // docked panel into a sheet: neither is a drawer closing.
          if (from !== `${location.pathname} ${innerWidth}`) return;
          if (!overlay.hasAttribute("data-ending-style") && !ended.has(overlay)) {
            report?.(`"${named(overlay)}" went without moving, at ${location.pathname}`);
          }
        });
      }
    }
  }).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-starting-style", "data-ending-style"],
  });
}

const faults: string[] = [];

/**
 * Each worker is a different address to the instance, which allows twenty sign-ins a minute
 * from one and works the caller out from X-Forwarded-For (one proxy hop is trusted). Workers
 * that signed in from one address would share that count.
 */
const workerAddress = () => {
  const n = Number(process.env.TEST_PARALLEL_INDEX ?? 0);
  return `10.32.${Math.floor(n / 250)}.${(n % 250) + 1}`;
};
const workerHeaders = () => ({ "X-Forwarded-For": workerAddress() });

export const test = base.extend<{ overlaysMove: undefined }, { watched: undefined }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's needs from this pattern
  extraHTTPHeaders: async ({}, use) => {
    await use(workerHeaders());
  },
  watched: [
    async ({ browser }, use) => {
      // Every context, however a spec makes it, is watched, and is this worker's address.
      const make = browser.newContext.bind(browser);
      (browser as Browser).newContext = async (...given) => {
        const [options] = given;
        const context: BrowserContext = await make({
          ...options,
          extraHTTPHeaders: { ...workerHeaders(), ...options?.extraHTTPHeaders },
        });
        await context.exposeFunction("__overlayFault", (text: string) => void faults.push(text));
        await context.addInitScript(watchOverlays);
        return context;
      };
      await use(undefined);
      browser.newContext = make;
    },
    { scope: "worker", auto: true },
  ],
  overlaysMove: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's needs from this pattern
    async ({}, use, info) => {
      faults.length = 0;
      await use(undefined);
      const found = faults.splice(0, faults.length);
      if (found.length > 0 && info.status === info.expectedStatus) {
        throw new Error(
          `Every sheet and dialog arrives and leaves with motion. These did not:\n  ${found.join("\n  ")}`,
        );
      }
    },
    { auto: true },
  ],
});
