---
title: Run an action from a widget
description: Add a row action to a Table that asks to confirm and then updates the clicked record, and see what it asks and what it does when it is published.
subjects: [widgets, app-builder]
---

## Run an action from a widget

By the end each row of a Table has a **Mark done** button. It asks first and then changes that row's **Status**.

## Before you start

- A Table of appointments on an app page, as in [Choose what a widget shows](choose-what-a-widget-shows). You need `resource:write` or `interface:write` to build it.
- Whoever presses the button needs to be allowed to open the app. The change is made on appointments they can see, and the server checks the button's **Who can run it** again.

## Add the action

:::steps
1. Select the Table and open the **Actions** tab. Under **Row actions**, press **+ Row action**. A row action is shown at the end of each row on hover, and in the detail sheet.
2. In **Says**, type `Mark done`. The button carries these words.
3. Under **What Mark done does**, press **Add a step** and choose **Update the record**. It says "The clicked appointment". Press **+ Set another field**, choose **Status**, press the value beside "becomes" and type `done`. Press **Done**.
4. Press **Add a step** again and choose **Ask to confirm**. It is put first. Its words are made from the record unless you write them: here "Mark done for the appointment A-7687 of Willow on Dec 4?". You can write your own title and text, name the button, and ask for fields.
5. Leave **If it fails** on **Show the error and stop**. In **When it is done, say** you can write a notice for when every step has worked.
6. Under **Can be pressed when**, choose **Only when…** to gray the button for rows where a rule does not hold; the reason is a tooltip. Under **Who can run it**, choose **Group** to limit it to people in a group.
7. Press **Publish**, then **Publish N changes**, and open the app from **Apps**.
:::

Other steps you can add: **Make a record**, **Remove the record**, **Run a flow**, **Run a script**, **Open a page** and **Show a message**. An action has up to eight steps and the data steps run together: if one fails, none is saved.

## The result

On the published page each row has a **Mark done** button. Pressing it opens "Mark done for the appointment …?" with **Cancel** and **Mark done**. After **Mark done** the row's status is `done` and the page reads the rows again: the **booked** group's count drops by one.

## If it does not work

- **The buttons are grayed in the builder.** In the builder row actions are drawn but cannot be pressed; use the published app.
- **"An action has no steps yet."** The tab lists it under **Needs fixing**: add a step.
- **A step is refused when the action runs.** The server says why; nothing is saved when a step that changes data fails.
- To make a click on the row itself run an action, use **When a row is clicked** on the same tab and choose **Run an action**.
