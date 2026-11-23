---
title: Rename or remove a query
description: Change a query's path or title without breaking the dashboards that name it, take back a draft, and remove a query with a draft that can be undone.
subjects: [queries, dashboards]
---

## Rename or remove a query

By the end you will have renamed a query as a draft, seen which dashboards the rename touches, and, separately, removed a query with a draft that you can take back until it is deployed.

## Before you start

- A dev workspace is open, and you hold `resource:write`.
- The query is saved. **Name and path** is off ("Save the draft first.") while the editor has changes you have not saved. Press **Save** first.
- A query that the tenant's repository defines cannot be renamed or removed here. **Name and path** says "It is defined in the repository's code. Change its path or title there, and give it key: …", and in place of **Remove** the screen says "Managed in the repository: the query is removed there."

## Rename a query

:::steps
1. Open **Data**, then **Queries**, and choose the query in **Saved queries**.
2. Press **Name and path**. The dialog "Name and path of <path>" shows the **Key**, which never changes, then **Path** and **Title**.
3. Type the new **Path**, and a **Title** if you want a name for lists. Titles are up to 200 characters.
4. Read the list under the fields when the path changes. "These dashboards are saved as drafts with the new path" names the dashboards the console keeps: each is saved as a draft whose widgets name the new path. "These dashboards are the repository's, so they are not changed here" names the repository's dashboards, which find the query by its key until the path is changed in the repository.
5. Press **Save as a draft**. A notice says "A draft renames <old> to <new>." with **Review and deploy**.
6. Choose the query by its new path in **Saved queries**. It lists "Renamed from <old>, once deployed." and carries the **Draft** pill.
7. Deploy the query, and the dashboards it drafted, from the **Deploy** screen. Nothing changes for anyone until then.
:::

To take the rename back before it is deployed, open the query and press **Discard draft**, then **Discard** in "Discard this draft?". The query goes back to how it was last deployed, and the dashboard drafts the rename made are set aside with it. A dashboard draft you changed since is kept, because it is your work.

## Remove a query

:::steps
1. Open the query. A deployed query shows **Remove**.
2. Press **Remove** and read "Remove this query?": "This saves a draft that removes it. Nothing changes until that draft is deployed." Press **Remove**.
3. The header shows **Removing** and a notice says "This query is removed in your drafts. Nothing changes until that draft is deployed." The editor is read-only and shows what is deployed now.
4. To take it back, press **Keep this query** and then **Keep**. The draft that removes it is thrown away.
5. To go on, deploy the removal from the **Deploy** screen.
:::

A query that was never deployed has no **Remove**: its button is **Discard draft**, and discarding it deletes it.

## The result

A renamed query keeps its key, history and what is bound to it. The old path answers for 90 days, and a deployed dashboard's widget records the query's key when the dashboard is deployed, so a widget goes on running after the old path stops answering. A dashboard from the repository shows "Names `<old>`, now `<new>`: change it in the repository" until its path is changed there. See [How dashboards the workspace keeps are changed](../../explanation/queries/dashboard-resources).

## If it does not work

- **Name and path is off.** The tooltip says why: the query is defined in the repository, is being removed ("Keep it to give it another name."), or has unsaved changes ("Save the draft first.").
- **"<path> is the path of a query. Choose another, or rename that one first."** The path is taken. The dialog keeps what you typed and shows the reason under the fields.
- **"The manifest is not valid. /path: is written in lowercase letters, digits, hyphens and underscores, in folders"** The path has capitals, spaces or other marks. Use lowercase letters, digits, hyphens and underscores, with a slash between folders.
- **After saving the rename the screen says "There is no query at <old path>".** The screen is still at the old address. Choose the query by its new path in **Saved queries**. The same happens after **Discard draft** on a renamed query: choose the query by its old path. This is how the screen behaves today.
- **Remove is not there.** The query has a draft, so the button is **Discard draft**, or it is the repository's.
