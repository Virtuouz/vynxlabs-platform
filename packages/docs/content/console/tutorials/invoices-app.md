---
title: Build an invoices app
description: Make an app in the App Builder with a table of invoices, a sheet for one invoice, a form for a new one and a Mark paid button only Billing may press, then use it as two different people.
subjects: [apps, app-builder, permissions]
---

You will have a published app that lists Fernhill's invoices, opens one in a side sheet, makes a new one from a form, and marks one paid with a button that only the group Billing may press. You will use it as Rowan Ellis, who may, and see it as Maya Brooks, who may not. It takes about 40 minutes.

## Before you start

- You can sign in to the console as Maya Brooks, `maya.brooks@fernhill.example`, a tenant admin of Fernhill. The seeded password is `fernhill-demo-2026`, for everyone below too. Making and publishing an app needs `resource:write` and `deployment:write`.
- You can sign in as Rowan Ellis, `rowan.ellis@fernhill.example`, who is in both Practice managers and Billing. A second browser window is the easiest way.
- Fernhill is set up, and its Sandbox is a :term[dev workspace]{id=dev-workspace}, with its table `invoices` and the groups Practice managers and Billing. Maya is in Practice managers and not in Billing.
- A browser at least as wide as a laptop screen. If you have not made an app before, do [your first app](../../start/tutorials/your-first-app) first.

:::steps
1. **Make the app.** Sign in as Maya in the Sandbox. Press **Build**, then **App Builder**, then **Make an app**. In **Name** type `tut Invoices`. The **Address** fills in as `tut-invoices`. Press **Make the app**.

2. **Add the table.** Press **Add to page**, and under **WORK WITH RECORDS** press **Table**. In the settings press **Source**. In **Where it reads from** choose **Invoices**. The canvas fills with invoices: Number, Status, Appointment, Client code, Clinic, Total, Issued on and Payment ref. The money is drawn as dollars.

3. **Title it.** Choose the **Display** tab. Under **HEADING** press **Title**, type `Invoices` and press :kbd[Enter].

4. **Show the newest first.** Choose the **Data** tab. The row **Sorted by** reads "As they come". Press it, press **+ Then by**, and in **Sort by** choose **Created at**. Press **Done**. The row now reads "Sorted by Created at, newest first".

5. **Open an invoice when a row is clicked.** Choose the **Actions** tab. Under **WHEN A ROW IS CLICKED** press **Do**, and choose **Open record detail**, which says "Passes the clicked invoice along". The builder makes a second page, **Invoice detail**, as a **Side sheet**, with the invoice's fields in it, and the row now reads "Open Invoice detail" opening as **Side sheet**. Press **Done** in the menu.

6. **Add the Mark paid button.** Still on **Actions**, press **Row action** under **ROW ACTIONS**. In **Says** type `Mark paid`. Press **Add a step**, choose **Update the record**, press **Set another field**, choose **Status**, press **Status becomes**, type `paid` and press :kbd[Enter]. The action reads "Update the record, The clicked invoice, Status becomes Paid". Press **Row action** once: a second press makes a second action with no steps, and the check at **Publish** refuses it until you press **Remove Action** on it.

7. **Limit it to Billing.** Under **WHO CAN RUN IT**, which reads "Anyone who can open the app", press **Group**, choose **Billing** in the dialog **Groups**, and press **Done**. The action's text now reads "Only Billing can do this, on invoices they can see." Press **Back**. The row action is listed as **Mark paid**, "1 step", and the table says "Billing can run it."

   :::alert[This limit is checked on the server]{type=info}
   The screen says it is "Checked on the server too: hiding the button is not what stops other people." A button the person may not press is shown grayed out, not hidden.
   :::

8. **Add a form for a new invoice.** Press **Add to page**, and under **WORK WITH RECORDS** press **Form**. In **What should this form do?** leave **Create a record**. **Table** already reads **Invoices**: the table you are on. The dialog lists the fields with the table's rules: Number, Client code, Clinic and Total are required, Status is "Unpaid by default" and Issued on is "today by default". **Opens as** reads **Modal: “New invoice”**. Press **Create form**. The page list gains **New invoice**, a **Modal**, and the table gets a **New invoice** button.

   ::screenshot{name=console/tut-invoices-builder alt="The App Builder with the Invoices table, the pages Invoice detail and New invoice listed, and the table's Actions settings showing Mark paid limited to Billing"}

9. **Publish.** Press **Publish**. The check reads "Deploys to Sandbox for the first time. Nobody sees it until then.", passes "All data sources found", "5 actions are complete" and "New invoice form is valid", lists "6 CHANGES", and says "Try as Billing first". Press **Publish 6 changes**. The message "Published. People who open the app now see this." appears.

10. **Use it as Rowan.** In a second window sign in as Rowan and open `/apps/fernhill/sandbox/tut-invoices/` on the instance. The header shows **tut Invoices**. The newest invoice is at the top of the table headed **Invoices**, and each row has **Mark paid** at its end.

11. **Make an invoice.** Press **New invoice**. Fill in **Number** `TUT-001` (a number may be used once: if an earlier run of this tutorial left `TUT-001`, the form says "Another row already has this value." and you delete that row first, as in **What you built**), **Client code** `C-1001`, **Clinic** `northside` and **Total** `42.00`. **Status** already reads `unpaid` and **Issued on** has today's date. Press **Create invoice**. The window closes and the table's count goes up by one. The new row is first: `TUT-001`, `unpaid`, `$42.00`.

12. **Mark it paid.** On the `TUT-001` row press **Mark paid**. The status of the row changes to `paid`.

13. **See what Maya sees.** In the first window, as Maya, open `/apps/fernhill/sandbox/tut-invoices/`. **Mark paid** is grayed out on every row. Hover it: "Only Billing can do this."
:::

## What you built

- An app `tut Invoices` with three pages: the main page with the table, **Invoice detail** (a side sheet) and **New invoice** (a modal). It is listed under **Build**, **Apps**, with the label **APP BUILDER**.
- A **Mark paid** row action that sets `status` to `paid`, run only by the group Billing.
- A new invoice, `TUT-001`, in Fernhill's Sandbox `invoices` table. It is a real row. Delete it if you want the table as it was: **Data**, **Tables**, `invoices`, type `TUT-` in **Filter by number**, check the row, press **Delete**, then **Delete the row**.
- A published version of the app in the Sandbox. It reaches the production workspace `clinics` when the Sandbox is promoted: see [ship through review](ship-through-review).

Next, [put its numbers on a dashboard](dashboard-with-filters).
