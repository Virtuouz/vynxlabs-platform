import { expect, test } from "vitest";
import { injectContext } from "./pages.js";

const html = `<!doctype html><html><head><title>App</title></head><body>
<h1><!--vx:title--></h1>
<div><!--vx:pages--><i class="pulse"></i><i class="pulse"></i><!--/vx:pages--></div>
</body></html>`;

const at = (app: unknown) =>
  injectContext(html, { base: "/apps/a/", themeHref: "/theme.css", data: { app } });

test("the page that draws before the script has run says the app's name and its pages", () => {
  const page = at({
    title: "Clinic <performance>",
    pages: [
      { id: "m", title: "Money" },
      { id: "v", title: "Visits" },
    ],
  });
  expect(page).toContain("<title>Clinic &lt;performance&gt;</title>");
  expect(page).toContain("<h1>Clinic &lt;performance&gt;</h1>");
  expect(page).toContain("Money</span>");
  expect(page).toContain("Visits</span>");
  // The grey shapes are what stood there before the names were known.
  expect(page).not.toContain("pulse");
});

test("an app with no pages named keeps the shapes, and a page with no markers is as it was", () => {
  const page = at({ title: "Clinic performance" });
  expect(page).toContain("pulse");
  expect(page).toContain("<h1>Clinic performance</h1>");
  const plain = injectContext("<html><head></head><body>x</body></html>", {
    base: "/a/",
    themeHref: "/t.css",
    data: { app: { title: "T" } },
  });
  expect(plain).toContain("<body>x</body>");
});
