---
title: Build a dashboard with filters
description: Make a dashboard of Fernhill's visits with a figure, a chart and a table, add a date and clinic filter that all three follow, and keep a filtered view in the address.
subjects: [dashboards, queries]
---

You will have a dashboard of your own with a figure, a chart and a table of appointments, a date filter and a clinic filter that all three follow, and a link that opens it filtered to one clinic. It takes about 25 minutes.

## Before you start

- You can sign in to the console as Maya Brooks, `maya.brooks@fernhill.example`, a tenant admin of Fernhill. The seeded password is `fernhill-demo-2026`. Reading the rows needs `data:read`. A dashboard shows each person the rows they may read.
- Fernhill is set up, with its Sandbox and the table `appointments`. See [Set up the Fernhill example](../../start/how-to/example/set-up-the-fernhill-example).
- A browser at least as wide as a laptop screen.

:::steps
1. **Make the dashboard.** Sign in as Maya in the Sandbox. Press **Data**, then choose **Dashboards** in the menu beside it. The list is headed "Questions asked of this workspace's tables, and their answers drawn". Press **New dashboard**. In **Name** type `tut Visit mix` and press **Make the dashboard**. The editor opens with "Saved.", a **Refreshes** menu, **Share** and **Done**, and the page says "Nothing on this page yet".

2. **Add a figure.** Press **Add to page**, and under **UNDERSTAND DATA** press **Stat**. In the settings press **Source**, and in **Where it reads from** choose **Appointments**. The stat shows the number of rows, for example 3,708. Under **WHAT IT SHOWS** the **Value** is **Count of rows**.

3. **Add the filters.** In **On this page** press **Stat**. On its **Data** tab press **Add Search and filter**. The page gains **Search and filter**, and its settings list **FILTERS**, starting with **Search**, which "Looks in Number".

4. **Add a date filter.** Press **+ Filter**. In **Add a filter** choose **Starts at**, which says **Date range**. The list now has **Starts**, "Date range · Last 30 days".

5. **Add a clinic filter.** Press **+ Filter** again and choose **Clinic**, which says **Text**. The list has **Clinic**, "Text · Any".

6. **Add a chart.** Press **Add to page**, and under **UNDERSTAND DATA** press **Chart**. For **Source** choose **Appointments**. The settings say "Follows 3 page filters · click to switch one off", and list **Search**, **Starts** and **Clinic**. The chart first counts appointments by week.

7. **Count by clinic.** Press **For each**, and in the dialog under "Good for grouping" choose **Clinic**, which says "3 values". Press :kbd[Esc]. The settings read "Reads as the number of appointments for each clinic. Drawn as bars; 3 clinics."

8. **Add a table.** Press **Add to page**, and under **WORK WITH RECORDS** press **Table**. For **Source** choose **Appointments**. It follows the same 3 page filters. **On this page** now lists **Search and filter**, **Stat**, **Chart** and **Table**.

9. **Finish editing.** Press **Done**. The page reads "Yours. Seen by: only you." The date control reads **Last 30 days**, the clinic box is empty, and the figure counts only the appointments of the last 30 days, fewer than the number **All time** gives in step 10.

   ::screenshot{name=console/tut-visit-mix alt="The finished dashboard: a Starts menu and a Clinic box above a figure, a bar chart by clinic and a table of appointments"}

10. **Use the date filter.** In **Starts** choose **All time**. The figure grows to every appointment. The address now ends `?f=` followed by `{"starts_at":null}`.

11. **Use the clinic filter.** In the **Clinic** box type `riverside` and press :kbd[Enter]. The figure drops to the appointments of that clinic. The address ends `?f={"starts_at":null,"clinic":"riverside"}`.

12. **Keep the view.** Copy the address and open it in a new tab, or reload. The same filters come back: **Starts** reads **All time**, **Clinic** reads `riverside`, and the figure is the same.
:::

## What you built

- A dashboard `tut Visit mix`, yours alone ("Yours. Seen by: only you."), listed under **Data**, **Dashboards**. **Share** is where you would show it to others.
- A figure, a chart and a table that read `appointments` and follow one set of filters.
- A link that keeps the filters: they are in the address.

Next, make an app that lets people act on rows in [build an invoices app](invoices-app).
