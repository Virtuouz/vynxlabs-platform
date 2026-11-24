# Run log: console/how-to/queries/keep-a-dashboard-as-a-resource.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch `phase-31-write-the-docs`).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No other width or theme was run, and no keyboard-only pass.
- Everything made for this run starts `qry31`.

## The steps as followed
1. On `qry31 Clinic week` (a member's dashboard with a stat and two tables), ⋯ > **Keep it as a resource of the workspace…** opened "Keep it as a resource" with "A copy is saved as a draft of a dashboard resource…" and **Its path, such as boards/lending**. Path `qry31/clinic-week`, **Save the draft**.
2. The list showed `qry31/clinic-week` with the tag **Resource**, **Draft, never deployed**, **The workspace's**, **Everyone here**. Its title was the path.
3. `dashboards/at/qry31/clinic-week`: the title (from the body), description, the pill **Draft, never deployed**, **Edit**, **Name and path**, **Discard draft**, ⋯ (whose menu has **Description…** only). "Kept by the workspace, at qry31/clinic-week. You see the rows you may read."
4. Deployed the draft alone with `POST changes/deploy` (the Sandbox holds other writers' drafts). The page then showed **Edit**, **Name and path**, **Remove**.
5. **Edit**: the editor, toolbar with Saved., Undo, Redo, **Refreshes**, **Done** and no **Share**. Set **Refreshes** to Every 15 minutes, **Done**: the page showed the **Draft** pill, "Refreshes every 15 minutes" and **Discard draft** in place of **Remove**.
6. **Discard draft**: "Discard this draft? The dashboard goes back to how it was last deployed. One that was never deployed is gone." After **Discard** the page was back to deployed with **Remove**, and "Refreshes every 5 minutes". **Remove**: "Remove this dashboard? This saves a draft that removes it. Nothing changes until that draft is deployed."
7. **Name and path** opened "Name and path of qry31/clinic-week" with Key, Path, Title (not saved).
## Not run
- **Keep this dashboard** after a removal. Saving a rename. A repository dashboard. A production workspace. The refusals of a deploy. The draft clash. 390 px and dark.

## Second run, 2026-11-23 (second agent)
- Instance http://localhost:8091 at commit `87000022`, headless Chromium. Done in a tenant of the checker's own, `qry31chk` (workspace Sandbox, dev): Ann Qry (`tenant_admin`), Vic Qry (`viewer`), Wes Qry (`app_maintainer`), a table `visits`, a data source on the local Postgres. Fernhill's people and data were not used.
- Kept Ann's dashboard as `chk/board`, deployed it; edited a Table to read a saved query (Where it reads from: Visits, All visits, Pets since, SQL written here); **Done** showed **Draft**.
- Remove: "Remove this dashboard?" then **Removing** with the notice; **Keep this dashboard**: "Keep this dashboard? This throws away the draft that removes it. The dashboard stays as it was last deployed." and **Keep** put it back.
- Rename: Name and path with Path `chk/board-2` and a Title; the page moved to the new address with "A draft renames chk/board to chk/board-2." and **Review and deploy**; deployed with the query rename.
- Draft clash in the editor: two tabs; the second change said "Not saved: someone else saved this dashboard" and the notice with **Copy what I wrote** and **Load their version**.
- Deploy refusals: a draft with a Stat and no source: `preview` and `deploy` answer 400 "The bundle's manifests are not valid" / "Stat needs a source to show". A deploy that removed the query a dashboard reads went through, and the widget said "The query chk/all-visits-2 was not found.": the page's claim that a table or query that is not there stops the deploy was wrong and was corrected, here and in the explanation page.
- 390 px and dark: the dashboard and its editor. Not run: a repository dashboard (no repository in this tenant).
