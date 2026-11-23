---
title: Building an app
topic: build-screens-editor
description: "Every control, state and key of the App Builder workbench: its header, the pages and widgets pane, the page, the settings pane, saving and undo, what makes it read only, and what a clash of drafts looks like."
subjects: [app-builder, apps]
moved_from:
  - build/app-builder-editor
---

The workbench is where one app is built. It shows the page as the people who open the app will see it, with live rows, and it sets whatever is selected in a pane beside it. It has a header, a pane on the left of the pages and the widgets on the current page, the page itself in the middle, and a settings pane on the right.

It is reached from the [App Builder list](app-builder), by the name of an app, at `screens/screens/<app>` under the workspace. The page being built is kept in the address as `?page=`, so a reload opens the same page. The help topic is `build-screens-editor`. It is also the topic of every address that starts with `screens/`, the preview included.

A change is saved as a draft after a moment. The draft is shared by the builders of the workspace, and people who use the app see it only when it is published. Each part of the workbench has its own page: [pages and their settings](../../app-builder/pages), [the settings pane](../../app-builder/inspector), [laying out a page](../../../how-to/app-builder/lay-out-a-page), [the phone and tablet layout](../../../how-to/app-builder/set-the-phone-layout) and [publishing](../../../how-to/app-builder/publish-an-app).

::screenshot{name=console/app-builder-workbench alt="The App Builder workbench at desktop width: the app's name and the Publish button in the header, the pages and widgets on the left, a page with a table in the middle, and the settings of the selected table on the right."}

## The header

One row under the breadcrumbs. On the left:

| Control | What it does |
| --- | --- |
| The app's name | The title of the app. |
| Pencil (**Rename the app**) | Turns the name into a field, **Name of the app**, with a counter "n of 100". Enter keeps the name, Escape and leaving the field are told which. A name past 100 characters is not saved and not cut: Enter leaves it for you to shorten. Not drawn when the workbench is read only. |
| **N draft changes** | A pill that appears when the draft differs from what is published. It opens the publish check. Under 768 px wide it is not drawn. |
| **N to fix** | A pill that appears when saving the draft was refused for something that must be fixed first. It opens a list, "To fix before it can be published", in the words of the page: "Money: needs at least 1 button". |
| The status | "Saving…" while a change waits or is saved; "Saved. Not published yet." when the draft is saved and differs from what is published; "Published." when it does not; "Not saved: …" with the reason when a save failed. Below 1280 px wide the words are kept for a screen reader and are not drawn. |

On the right, from left to right:

| Control | What it does |
| --- | --- |
| **Desktop**, **Tablet**, **Phone** | The size the page is drawn at: the full width of the room, 768 px and 390 px. The arrow keys move between them. Only **Phone** is drawn in a device frame. See [the phone and tablet layout](../../../how-to/app-builder/set-the-phone-layout). |
| **View as** | **Me**, then each group of the tenant. It changes what is drawn, not whose rows: see below. |
| Undo, Redo | Take back and redo one change at a time. A button says what it would undo, such as "Undo moving Invoices", and its tooltip says "Nothing to undo" when there is nothing. The workbench keeps the last 100 changes in memory. Typing in one field is one change if the pauses are shorter than 1 second. A reload empties them. |
| **Preview** | Saves what is unsaved, then opens the draft as people will use it, in a new tab. See below. |
| **Publish** | Saves what is unsaved and opens the publish check, "Ready to publish" or "Not ready to publish". It is off while there is something to fix, or while a save has failed. |
| **More ways to publish** (the arrow) | **Publish**, **Open the published app** and **Restore an earlier draft**. **Open the published app** is off until the app has an address, with the tooltip "Publish once, and the app has an address.". |
| **Hide pages and widgets**, **Hide the settings** | Fold the left and the right pane. The button then reads **Show pages and widgets** or **Show the settings**. The choice is remembered on this device. Only in a window 1024 px wide or more. |

On a window narrower than 1024 px the two panes are sheets. A bar under the header, **Pages and widgets**, opens the left one, and choosing a widget opens the settings as a sheet titled **Settings**. Undo and Redo move behind a **⋯** button (its label is "More: undo, redo and the screen size"). Under 640 px **Desktop**, **Tablet**, **Phone** and **View as** move behind it too, and **Preview** shows only its icon. The name, **Preview** and **Publish** stay on the row.

### View as

**View as** lists **Me** and the groups of the tenant, members' and end users'. Choosing a group draws the page the way a member of that group sees it: a widget limited to other groups is drawn faded with "Hidden for" and the group's name. A line under the page says "Rows are yours: View as shows what" the group "sees of the page, not their rows." You are still the one reading the rows, and you can still change the page. **Try as <group> first** in the publish check chooses it for you.

### Preview

**Preview** opens `…/screens/<app>/preview` in a new tab, with the page you are on when it is one of the app's menu pages. The tab's top bar says "Preview of the draft", the workspace's name and "Actions change" the workspace's "rows." It has the **Desktop**, **Tablet**, **Phone** switch, **Open the published app** when the app is published, and **Close**. The app is drawn as the person previewing it, with their groups, so what is limited to a group shows for a member of it. Buttons really run: a button that updates a row updates it. In the workbench's own page a button never runs.

If the draft cannot be read, the preview says "You may not read this app's draft, or it is no longer here. Ask whoever builds it, or open the published app." When the app has no draft, the preview shows what is published.

## The pages and widgets pane

| Part | What it holds |
| --- | --- |
| **Pages** | One row per page, with its kind's icon, its title and its kind: **Page**, **Record page**, **Side sheet** or **Modal**. The **+** (**Add a page**) is drawn while the app has fewer than 20 pages. Choosing a row shows the page and its own settings. A row has a grip to drag by, and on a pointed or focused row arrows to move it earlier or later. The order is the order of the app's menu. See [pages and their settings](../../app-builder/pages). |
| **On this page** | The widgets of the page as an outline, with Section and Tabs holding theirs. Choosing one selects it on the page. "Nothing yet." when the page is empty. Drag a row, or press :kbd[Alt]+:kbd[↑] or :kbd[Alt]+:kbd[↓] on it, to move it in the outline. |
| **Add to page** :kbd[A] | Opens **Add to page**. It is off when the page holds 30 widgets, and the tooltip says "A page holds at most 30 widgets.". See [laying out a page](../../../how-to/app-builder/lay-out-a-page). |

A line at the foot says "Drag in the outline or on the page to reorder. Alt with the arrow keys moves the chosen widget in the outline." It is drawn from 1024 px.

## The page

The middle is the page drawn from this workspace's rows, as you may read them, on twelve columns with the column guides behind. What you can do on it:

- **Click** a widget to select it, :kbd[Esc] to let go. Click a title to rename it in place. Drag a widget to move it and its corner to size it. A note while you drag gives the size and place, such as "8 × 5 · col 1 · row 3".
- A side sheet or a modal is drawn as it opens, with a bar that gives its kind, size and width, such as "Side sheet · Medium · 720px". The size handle on its edge is a slider named **Size**: drag it, or press :kbd[←] and :kbd[→], :kbd[Home] and :kbd[End]. It snaps to **Small** (480 px), **Medium** (720), **Large** (960), **Extra large** (1200) or **Full**. A size wider than the room is drawn smaller, and "Drawn at N %" says by how much.
- A page that opens on one record, a record page, a side sheet or a modal, has a line above it, "Preview of" the page "for" a record, with a list of up to 25 rows of its table to draw it with. When the table has no rows the line says so and "Add a row in Data, or choose another table."
- An empty page says "Nothing on this page yet", with **Add to page** and, when the workspace has tables, the starts **A list of** and **A record page** for the table the app reads most.
- On **Tablet** and **Phone** a banner above the page says how much of the layout is made by hand. See [the phone and tablet layout](../../../how-to/app-builder/set-the-phone-layout).
- A table whose row click opens a side sheet shows that sheet over the page while the table is selected and **Actions** is open. See [the settings pane](../../app-builder/inspector).

The page never runs an action: a button pressed here does nothing. **Preview** is where buttons run.

## Saving

The workbench saves 700 ms after the last change, and :kbd[⌘S] or :kbd[Ctrl]+:kbd[S] saves at once. Leaving the workbench while a change is unsaved asks "A change is not saved yet.". The status in the header says where a save stands. A save that is refused is shown as "Not saved:" and the reason.

### When someone else saved first

A draft belongs to the workspace, not to a person. Every save says which version of the draft it was made on. If another builder saved after you opened the app, nothing is overwritten and nothing of yours is saved. A notice appears: "Someone else saved this app after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." and a button, **Load their version**. It asks "Load their version?": "What you changed since you opened the app is replaced by what they saved." Press **Load theirs** to take their draft, or reload the page to read it. Until you do, the status reads "Not saved:" and the reason.

### Restore an earlier draft

**More ways to publish**, then **Restore an earlier draft**, opens a dialog of the same name: "Each save keeps what it replaced. Restoring one makes it the draft; Undo takes it back." The control plane keeps the newest 30 versions that saves put aside. The list is newest first: when the save was made (the time and "(1m ago)" in the last day, else the date and time), who made it, and what it did, such as "Added page Appointments, added page Appointment detail and 4 more", or "The draft was set aside". The arrow keys, :kbd[Home] and :kbd[End] move in the list. Beside it a preview gives the version's title, its pages with their widget counts, and "Restoring it changes the draft" with the list of what would change. **Restore** is off when the version is the same as the draft now. **Not now** closes the dialog. A restore is one change, which Undo takes back, and it shows "Restored the draft saved" and when, with **Undo**. With no versions the dialog says "No earlier drafts yet. Each change you save keeps the draft it replaced."

## Keys

| Keys | What they do |
| --- | --- |
| :kbd[A] | Opens **Add to page**, when focus is not in a field. A single key can be turned off in the keyboard shortcuts of the console. |
| :kbd[⌘S], :kbd[Ctrl]+:kbd[S] | Save now. |
| :kbd[⌘Z], :kbd[Ctrl]+:kbd[Z] | Undo, outside a field. |
| :kbd[⇧⌘Z], :kbd[Ctrl]+:kbd[Y] | Redo, outside a field. |
| Arrow keys on a selected widget | Move it one cell. With :kbd[Shift], make it one cell wider, narrower, taller or shorter. On a phone, :kbd[↑] and :kbd[↓] change the order. |
| :kbd[Delete] | Remove the selected widget. |
| :kbd[Ctrl]+:kbd[D], :kbd[⌘D] | Duplicate it. |
| :kbd[Esc] | Let go of the selection, or cancel a drag. |
| :kbd[Alt]+:kbd[↑], :kbd[Alt]+:kbd[↓] | Move the chosen row of **On this page**. |
| Arrow keys on **Desktop**, **Tablet**, **Phone** | Move between the sizes. |

## States

| State | What you see |
| --- | --- |
| Loading | A skeleton of the workbench. |
| Not found | A red notice with the control plane's words, when the app is neither a draft nor deployed. |
| Production, or no write permission | A line under the header: "Read only: this is the production workspace. Apps are changed in a dev workspace and arrive here by promotion." or "Read only: you may look at this but not change it. Changing apps needs the resource:write or interface:write permission in this workspace." The app is shown as it is published, nothing is saved, and the header has **Open the app** in place of **Publish**. |
| Managed in the repository | A notice: "This app is managed in the repository, so it is shown as it is published and cannot be changed here. Taking it over lets you change it here: the next publish then moves it out of the repository, and changes made there no longer reach it." with **Take over**. After **Take over**, or when the app already has a draft, it says "You are taking this app over from the repository. The next publish moves it out of the repository, and changes made there no longer reach it." See [Take over a repository app](../../../how-to/app-builder/take-over-a-repository-app). |
| Removed in your drafts | A notice: "This app is removed in your drafts. Nothing changes until that draft is deployed. It is shown as it is published, and cannot be changed here until the removal is taken back." with **Keep this app**. |
| No app serves it | A notice: "No app serves this yet, so nobody can open it." with **Make an app for it**. It asks for an **Address** (filled from the name) and makes the app draft. |
| A clash of drafts | The notice and **Load their version** above. |
| A save failed | The status reads "Not saved:" and the reason, in red. **Publish** is off. |
| Publish refused | "You can change this app but not publish it here. Ask someone who may deploy to this workspace: your draft is kept." |

## Permissions

| Action | Needs |
| --- | --- |
| Open and look | `resource:read`, or `interface:read` alone. |
| Change the draft, undo, restore | `resource:write`, or `interface:write` alone, in a dev workspace. The workspace's summary says whether you may; a production workspace is read only for everyone. |
| **Preview** | The permission to read the draft. Pressing a button there runs it with your own permissions in the app. |
| **Publish** | `deployment:write`, or `interface:write` alone, which deploys only an interface and the app that serves it. |
| The publish check | `deployment:read`, or `interface:write` alone for the interface and app that are named. |

## Related

- [App Builder](app-builder): the list this opens from.
- [Pages and their settings](../../app-builder/pages) and [the settings pane](../../app-builder/inspector).
- [Publish an app](../../../how-to/app-builder/publish-an-app): the check, the preview and what a publish does.
- [How an app is made](../../../explanation/app-builder/how-an-app-is-made).
- [The dashboard builder](../data/dashboard-builder) uses the same workbench.
