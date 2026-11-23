---
title: Keep a dashboard as a resource of the workspace
description: Turn a dashboard of your own into one the workspace keeps, deploy it, change it as a draft, rename it, and take a removal back.
subjects: [dashboards, resources]
---

## Keep a dashboard as a resource of the workspace

By the end you will have a dashboard the workspace keeps: versioned, deployed and promoted with the rest of the workspace, and open to everyone who may see dashboards. Yours stays as it was.

## Before you start

- A dev workspace is open, and the dashboard is one of your own. You hold `dashboard:write` to open its menu and `resource:write` to keep it and to change a kept dashboard.
- Only a dev workspace changes a kept dashboard. In a production workspace one is looked at, not changed.
- If it reads SQL written in a widget, `sql:read`; if it reads a data source's table, `data_source:read`. A kept dashboard is saved only by someone who holds what it reads.

## Keep it

:::steps
1. Open **Data**, then **Dashboards**, and open your dashboard.
2. Press **⋯**, then **Keep it as a resource of the workspace…**. The dialog "Keep it as a resource" asks for **Its path, such as boards/lending**.
3. Type a path in lowercase letters, digits, hyphens and underscores, with a slash between folders, and press **Save the draft**. A notice says "<path> is saved as a draft. Deploy it to keep it." with **Review and deploy**.
4. In the list under **Dashboards** the copy appears with a **Resource** tag, **Draft, never deployed**, **The workspace's** under **Whose** and **Everyone here** under **Seen by**.
5. Open the **Deploy** screen of the workspace and deploy the dashboard. It is now a deployed resource, and its page opens at `dashboards/at/<path>`.
:::

::screenshot{name=console/dashboard-resource alt="A dashboard the workspace keeps, with a Draft pill and the buttons Edit, Name and path and Discard draft beside its title."}

## Change it, rename it, take a removal back

:::steps
1. Open the kept dashboard. Beside its title are **Edit**, **Name and path** and **Remove**.
2. Press **Edit**. The page opens in the editor with **Done**. Change a widget or **Refreshes**. Every change is saved as a draft on the revision you opened, so the toolbar says "Saved." and the page keeps the draft after a reload.
3. Press **Done**. The page shows the **Draft** pill and **Discard draft** in place of **Remove**. It is read with the draft over what is deployed.
4. To describe it, press **⋯**, then **Description…**. A kept dashboard has no **Name and description…** here: its name is its path.
5. To rename it, press **Name and path**. The dialog "Name and path of <path>" keeps the **Key**, and **Save as a draft** changes the path and title as a draft. The old path answers for 90 days.
6. To throw away your changes, press **Discard draft** and confirm "Discard this draft?": "The dashboard goes back to how it was last deployed. One that was never deployed is gone."
7. To remove it, press **Remove** and confirm "Remove this dashboard?": "This saves a draft that removes it. Nothing changes until that draft is deployed." The page then says "This dashboard is removed in your drafts." and shows **Removing**. Press **Keep this dashboard** to take the removal back.
8. Deploy the draft from the **Deploy** screen when you are done. Nothing changes for anyone before.
:::

## The result

The dashboard is a resource: it has a path and a key, and is promoted to the linked production workspace with a version. Everyone who holds `dashboard:read` sees it, each seeing only the rows they may read.

## If it does not work

- **"Something already exists at this path."** The path is taken. The dialog keeps what you typed.
- **The deploy refuses it.** A deployed dashboard must be finished: a widget with no source, or a table or query that is not there, stops the deploy. The **Deploy** screen lists each. A dashboard of your own is saved while unfinished and says what it reads that the workspace lacks.
- **"This dashboard is defined by the code in the tenant's repository. Changing it here saves a draft that takes it over…"** The repository defines it. Editing here takes it over: once deployed it is a file that the console and the repository both edit. Remove its definition from the code, or the next deploy from the repository takes it back. **Remove** is not offered: the repository removes it.
- **Edit is not there.** The workspace is a production workspace, or the dashboard is being removed.
- **Someone else saved the draft first.** The draft-clash notice offers your version or theirs.
- **Keep it as a resource is not in the menu.** It is in the menu of a dashboard of your own, not of one the workspace keeps.
