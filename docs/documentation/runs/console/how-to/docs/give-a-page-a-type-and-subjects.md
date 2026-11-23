# Run log: console/how-to/docs/give-a-page-a-type-and-subjects.md

- Instance http://localhost:8091, commit `14f7d5b9`, Maya Brooks, Sandbox, 1440 px, light.
1. **New page here** in my folder with Type **How-to guide**: the page opened with Page details available. The instance's console is an older build than the source: the starter was "## Goal … ## If it does not work" and not the current outline with **Before you start** and **The result**.
2. **Page details**, **Type** options None, Tutorial, How-to guide, Reference, Explanation. Chose Reference; the one problem was "A reference is read, not followed, and this page has numbered steps. Move the steps to a how-to and link to it." and the footer still said the page would deploy.
3. **Add a subject** `Walk In!` and Enter gave the chip `walk-in`; five subjects (`walk-in`, `s-a` .. `s-d`) disabled the field with "Five is the most a page uses. Remove one to add another."
4. **Save draft** and a reload kept the type and the subjects.
5. After a deploy the served page showed REFERENCE over the title. A site with one page shows no cards or Related.
- Not run: cards and Related on a site with several types (read in code and `typed-*.html` goldens), the search window's **Kind of page** buttons, a page's own type over the folder's, **Use the folder's**, **Remove <subject>**, the offered subjects, 768 and 390 px, dark, keyboard.

## Second check, 2026-11-23 (second agent)

Pages of a how-to and an explanation type were deployed to a repository site: the home page showed **What do you want to do?** with a card for each ("1 page →"); the search window showed **Any kind**, **How-to guides** and **Explanations**. The warning for a typed page in an untyped folder read "…is a explanation, in a folder whose index says no type" (a wording fault of the product).
