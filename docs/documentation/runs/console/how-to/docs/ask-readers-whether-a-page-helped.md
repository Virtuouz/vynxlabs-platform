# Run log: console/how-to/docs/ask-readers-whether-a-page-helped.md

- Instance http://localhost:8091, commit `14f7d5b9`, Maya Brooks, Sandbox, 1440 px, light.
1. Published my folder `D31 Notes` as the site `d31-site`. The menu then offered **Turn on page feedback…**.
2. The dialog **Ask readers of D31 Notes whether a page helped** listed: the table `docs-feedback` with `site_key, site, page, helpful, version and at`; the change to `d31-site`; "Nothing about who answered is kept…"; "Both are drafts until you deploy. The table is queried like any other. Turning this off later keeps the table and what is in it." The button read **Make the table and turn it on**.
3. The tree said **Deploy 4 changes**; the question read "Readers see them at once. With the documentation goes the table docs-feedback, where a site keeps its readers' answers. Nothing else is deployed." After **Deploy** the changes were gone.
4. On the served page the form "Was this page helpful?" with **Yes** and **No**. **Yes** gave "Thank you for saying." The page on the Documentation screen then read "1 found it helpful · 0 didn't".
- Not run: **Turn off page feedback…**, the 429 and 503 messages, a second browser, the table's rows (the Tables screen was not opened), a doc writer, 768 and 390 px, dark, keyboard only.
- The `docs-feedback` table now exists in the Sandbox workspace of this throwaway instance.
