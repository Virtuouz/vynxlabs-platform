---
title: Take over a repository app
description: Open an app that the repository manages, see it read only, take it over so you can change it in the console, and know what the next publish does.
subjects: [app-builder, repository]
---

## Take over a repository app

By the end you will have an app that was written in the tenant's repository open for editing in the App Builder, and you will know that the next publish moves it out of the repository.

## Before you start

- An app that the repository manages. The **App Builder** list says "Managed in the repository: the app is removed there." in its last column. Fernhill's Clinic operations is one.
- A dev workspace, and `resource:write` or `interface:write` there. A production workspace is read only for every app.
- Be sure you want this. After the next publish the console is where the app is changed, and changes made in the repository no longer reach it.
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

## Steps

:::steps
1. Open **Build**, then **App Builder**, and press the name of the app. The workbench opens read only: the header says **Published.** and has **Open the app** where **Publish** would be, and the pages and widgets are shown as they are published.
2. Read the notice under the header: "This app is managed in the repository, so it is shown as it is published and cannot be changed here. Taking it over lets you change it here: the next publish then moves it out of the repository, and changes made there no longer reach it."
3. Press **Take over**. The notice becomes "You are taking this app over from the repository. The next publish moves it out of the repository, and changes made there no longer reach it." **Preview** and **Publish** appear, and the pages can be changed.
4. Make your change, as in [Lay out a page](lay-out-a-page). Each save is a draft of the app.
5. Publish it as in [Publish an app](publish-an-app).
:::

Pressing **Take over** changes nothing by itself. The draft is made by your first change, so you can press it, look around and leave without a draft.

## The result

Your draft is the app's first draft over the repository's version. When you publish it, the app is deployed from the console and is no longer the repository's. The notice you read is the screen's own statement of that. Until you publish, the repository's version is the one people use.

## If it does not work

- **There is no Take over button.** The workbench is read only for another reason: the workspace is in production, or you lack the permission. The line under the header says which: "Read only: this is the production workspace. Apps are changed in a dev workspace and arrive here by promotion." or "Read only: you may look at this but not change it. Changing apps needs the resource:write or interface:write permission in this workspace."
- **The app's Rename and Remove do nothing.** For a repository app **Rename** is disabled, with a tooltip that says to change its path or title in the repository's code, and **Remove** is not drawn. A removal is made in the repository. The server refuses a draft that removes a repository app: "is managed in the repository. Remove it there, or take it over first."
- **Someone else already has a draft.** The notice reads "You are taking this app over" and you work on their draft. See [Building an app](../../reference/screens/build/app-builder-editor).

## Related

- [App Builder](../../reference/screens/build/app-builder): the list and its states.
- [How an app is made](../../explanation/app-builder/how-an-app-is-made).
