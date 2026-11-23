---
title: Your first app
description: Make an app in the App Builder that lists Fernhill's visits, tidy its columns, publish it and open it.
subjects: [apps, app-builder]
---

You will have a published app with one page, a table of Fernhill's appointments with a title and six columns, and you will have opened it as a person who uses it does. It takes about 15 minutes.

## Before you start

- You can sign in to the console as Maya Brooks, `maya.brooks@fernhill.example`, a tenant admin of Fernhill. Making and publishing an app needs `resource:write` and `deployment:write`, which a tenant admin has. The seeded password is `fernhill-demo-2026`.
- Fernhill is set up, and its Sandbox is a :term[dev workspace]{id=dev-workspace}. The app reads the table `appointments`.
- A browser at least as wide as a laptop screen.

:::steps
1. **Open the App Builder.** Sign in as Maya and check that the bar at the top shows **Sandbox**. Press **Build**, then choose **App Builder** in the menu beside it. The list is headed "Apps over this workspace's tables, built without code".

2. **Make the app.** Press **Make an app**. In **Name** type `tut Visits`. The **Address** fills in as `tut-visits`. Press **Make the app**. The builder opens. The top says **tut Visits**, "1 draft change" and "Saved. Not published yet.". The page list has one page, **tut Visits**, and the canvas says "Nothing on this page yet".

3. **Add a table.** Press **Add to page**. In the dialog, under **WORK WITH RECORDS**, press **Table**. The table is added at the end of the page. Its settings open, and say "Table needs a source to show."

4. **Choose where it reads from.** In the settings, under **ROWS IT USES**, press **Source**. In the dialog **Where it reads from**, choose **Appointments**. The canvas fills with appointments: Number, Pet name, Status, Starts at, Pet, Species, Client code and Clinic.

5. **Give it a title.** Choose the **Display** tab. Press **Title** under **HEADING**, type `Visits` and press :kbd[Enter]. The table is headed **Visits**.

6. **Hide two columns.** Under **COLUMNS**, which says "8 of 8 shown", press the eye beside **Pet** (**Hide Pet**), then the eye beside **Client code**. It now says "6 of 8 shown". The table keeps Number, Pet name, Status, Starts at, Species and Clinic.

   ::screenshot{name=start/tut-visits-builder alt="The App Builder with a table of appointments headed Visits, and its Display settings showing 6 of 8 columns shown"}

7. **Publish.** Press **Publish** at the top. The check reads "Deploys to Sandbox for the first time. Nobody sees it until then.", with "All data sources found" passed and "2 CHANGES": "Added page tut Visits" and "Added table Visits". Press **Publish 2 changes**. The message "Published. People who open the app now see this." appears.

8. **Open the app.** The address is `/apps/fernhill/sandbox/tut-visits/` on the instance. Open it in the same browser. The header shows **tut Visits** and Maya's address, and the page shows the table headed **Visits** with 25 rows. The foot of the table reads "Showing 25 of" the number of appointments, and **Show 25 more** brings more.
:::

## What you built

- An app `tut Visits`, listed under **Build**, **Apps** with the label **APP BUILDER** and the address `/apps/fernhill/sandbox/tut-visits/`. Who may open it is **Staff only** unless you change it.
- One page, **tut Visits**, with one table widget on it reading `appointments`.
- Version 1 of the app, deployed to the Sandbox. It reaches the production workspace only when the Sandbox is promoted.

Next, [build an invoices app](../../console/tutorials/invoices-app), with a record sheet, a form and a button only some people may press.
