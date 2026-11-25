---
title: Write a widget for your tenant
description: "Make a widget of your own in your repository with volvel widget new, preview it with volvel dev, deploy it, place it on a dashboard, update the page to a new version, and see when a removal is refused."
subjects: [widgets, widget-frame, apps]
moved_from:
  - build/writing-a-widget
---

## Write a widget for your tenant

By the end you will have a widget called Waiting room, written in Fernhill's repository: a number of visits that have checked in, drawn by your own code, deployed to Fernhill's Sandbox workspace and placed on a dashboard. You will also have changed it, raised its version and moved the dashboard to it. It takes about 30 minutes.

A widget is code, so it is the one part of a page that is not YAML. Its definition says what it reads, what can be set and what it can tell the page. Its view draws the result in a sandboxed frame. A builder places it with **Add to page**, sets it in the inspector and attaches actions to its events, the same as for a widget Volvel ships. To see what a widget can and cannot do on the page, read [How widgets are kept safe](../explanation/widgets/how-widgets-are-kept-safe).

## Before you start

- You are Devi Shah, a developer at Fernhill (`devi.shah@fernhill.example`). You need `deployment:write` in the Sandbox workspace to deploy, and `dashboard:write` to make a dashboard. The developer role has both there.
- Fernhill is set up: see [Set up the Fernhill example](../../start/how-to/example/set-up-the-fernhill-example).
- A checkout of the repository, built with `pnpm build`, and its dependencies installed. The commands below write `volvel` for what you run as `node packages/cli/dist/bin.js` from the checkout's root. Run them from `examples/fernhill`. Fernhill already depends on `@volvel/widget-frame`, `react` and `react-dom`, which the view uses. In another repository, install them first: `npm install @volvel/widget-frame react react-dom`.
- The CLI is signed in as you: `volvel login --url <instance address> --token "$KEY"`, with an API key made under your own **Account**. `volvel whoami` lists `Fernhill Veterinary Group (fernhill)`.
- If the Sandbox workspace holds resources made in the console that the repository has no file for, run `volvel pull --tenant fernhill --workspace sandbox` once first. The deploy below refuses otherwise (see the end of this page).

## Make the widget

:::steps
1. **Scaffold it.** From `examples/fernhill`:

   ```bash
   volvel widget new waiting-room
   ```

   It prints "Created the widget x/waiting-room in src/widgets/waiting-room: widget.ts, view.tsx and fixture.json." and "src/index.ts now exports it." It also adds `export * from "./widgets/waiting-room/widget.js";` to the repository's entry file, because a build reads only what the entry exports. The name is small letters, digits and `-`, starting with a letter, at most 41 characters.

2. **Say what it is.** Open `src/widgets/waiting-room/widget.ts`. Change `description`, which **Add to page** shows under the title:

   ```ts
   description: "How many visits are waiting to be seen.",
   ```

   Leave the rest as it is for now. It declares one data input, `value`, a summary: rows gathered into groups with a value for each. It declares one setting, `label`, a text field in the inspector's **Display** tab, with `Waiting room` as the value a new widget starts with. It declares one event, `clicked`. It is 4 cells wide and 3 high to start, and `version` is `0.1.0`. The definition is the whole of what a builder can see and set: see [The widget kind](../reference/kinds/widget) for every field.

3. **Draw it.** Open `src/widgets/waiting-room/view.tsx`. The scaffold counts rows. Change the line that shows the number to read the value the page worked out:

   ```tsx
   {config.label}: {String(summary?.rows[0]?.[summary.values[0] ?? ""] ?? 0)}
   ```

   The view is a React component. `createFrame` connects it to the page, and `useWidgetProps(frame)` gives it `config`, `data`, `state`, `size` and `theme` each time any changes. It draws only when `state.status` is `ready`. See [The widget frame](../reference/tenant-widgets/the-widget-frame) for all of it.

4. **Give it sample data.** `fixture.json` is what `volvel dev` gives the view. Change `data.value` to one number:

   ```json
   "value": {
     "shape": "summary",
     "columns": [{ "name": "waiting", "label": "Waiting", "type": "integer" }],
     "breakdowns": [],
     "values": ["waiting"],
     "rows": [{ "waiting": 4 }]
   }
   ```

5. **Check it builds.**

   ```bash
   volvel build
   ```

   The list has a line `widget     x/waiting-room`. The build bundles the view with its dependencies into one script. It refuses a view that does not compile, one that imports from `http://` or `https://`, one that calls `import()`, and one whose script is over 512 KB. The message names the widget.
:::

## Preview it

:::steps
1. **Start the preview.** Fernhill has apps, so name the mode:

   ```bash
   volvel dev --widgets
   ```

   It prints "2 widgets previewed at" an address ending in `/_dev/widgets`, and says each runs in the sandboxed frame under the content policy it has once deployed. It needs no instance and no sign-in. Open the address, then **Waiting room**.

2. **Try it.** The page shows the widget in the production frame. In the left column: the size (**1440**, **768**, **390**, or a width and height), the **Theme** (light or dark), the **State** (`ready`, `loading`, `empty`, `failed`, `forbidden`), a field for each setting, the data as JSON, and below the widget a log of the events it raises, each marked as passed or dropped with the reason. Press the widget: the log says `clicked passed the host's checks`.

3. **Save a change.** Edit `view.tsx` and save. The preview rebuilds in a moment and reloads the frame, with your settings kept. A view that does not build shows its error on the page.
:::

The preview is not the page. The page's own loading, empty and error states are drawn around your view, the same for every widget, and the preview only posts the state you choose.

## Deploy it

:::steps
1. **Preview the deploy.**

   ```bash
   volvel deploy --tenant fernhill --workspace sandbox --preview
   ```

   The list has `widget     x/waiting-room`, and it ends "Nothing was changed."

2. **Deploy.**

   ```bash
   volvel deploy --tenant fernhill --workspace sandbox
   ```

   It prints a line like "Deployed version 4 to sandbox (dev): 3 created, 6 updated, 0 deleted, 96 unchanged." and, among the lines under it, `created  widget     x/waiting-room`. The first number is the workspace's own version. The widget's version is the one in `widget.ts`.
:::

A deployed version never changes. It is kept by its type and version, and the same files serve every workspace of the tenant. If you change a file and deploy again with the same `version`, the deploy is refused: "x/waiting-room 0.1.0 is already deployed with other files. A version's files never change, because pages are placed with it: raise the widget's version."

## Place it on a dashboard

You make a dashboard of your own, which only you see until you share it. A widget placed in an app's page is the same, in **App Builder**.

:::steps
1. In the Sandbox workspace, open **Data**, then **Dashboards**, and press **New dashboard**. Type `Waiting now` in **Name** and press **Make the dashboard**.
2. Press **Add to page**, type `waiting`, and press :kbd[↵]. **Waiting room** is listed under **Understand data**, with "Your widget" beside its title and "How many visits are waiting to be seen." under it. It is placed, drawn by your code, and the inspector opens with **Data**, **Display**, **Actions** and **Rules**.
3. In **Data**, press the row **Source** (it says "Not set") and choose **Appointments**.
4. Under **Only include**, press **Condition**. Choose the field **Status**, leave **is**, tick **Checked in** and press **Add**.
5. Press **Done**.
:::

The dashboard shows a card **Waiting room** with a button reading "Waiting room: 6": the number of Fernhill's visits that are checked in. Reload: it is still there. Every viewer sees the rows they may read, because the server reads the data for each viewer; your view is only given the result.

## Change it and update the page

A page keeps the version it was placed with. Your dashboard uses `0.1.0` until someone moves it.

:::steps
1. In `widget.ts` raise `version` to `0.2.0` and add a setting to `config.properties`:

   ```ts
   loud: {
     type: "boolean",
     default: false,
     "x-volvel": { tab: "display", control: "switch", label: "Big type" },
   },
   ```

   Add `loud: false` to `defaults`. In `view.tsx` add `loud: boolean` to the config type of `createFrame`, and `fontSize: config.loud ? 32 : undefined` after `font: "inherit"` in the button's style.
2. Run `volvel deploy --tenant fernhill --workspace sandbox`. Both versions are now kept.
3. Open the dashboard, press **Edit** and choose the widget. The inspector says "Version 0.2.0 is deployed. This page uses 0.1.0." and "Adds Big type." Nothing is written yet. Press **Update to v0.2.0**.
4. The notice goes, **Big type** is in **Display**, and the dashboard uses `0.2.0` once it saves.
:::

Pages that are not updated keep drawing `0.1.0`. Press **Update to v0.2.0** on each. In a page kept as a file, the placed widget has a `version` field: write the new one there.

## Remove a widget

A widget that a page still places is not removed. Delete the widget's folder and its `export` line in the entry file, and deploy:

```text
Could not deploy to sandbox. A page still places this widget. Move each to another version or take the widget off it, then remove it.
  - the dashboard "Waiting now" places x/waiting-room 0.2.0
```

Take the widget off the dashboard, or delete the dashboard, and deploy again. The widget and its versions go.

To drop one old version while the widget stays, give the version to remove: `DELETE /api/v1/tenants/<tenant>/workspaces/<workspace>/widgets/waiting-room/versions/0.1.0`. It needs `deployment:write`. It is refused for a version a page places, and for the version the repository defines now.

## The result

`src/widgets/waiting-room` holds a definition, a view and a fixture. The Sandbox workspace has two versions of `x/waiting-room`. A dashboard of yours places the newest and shows the number of visits that are checked in. The widget is in **Add to page** for anyone who can edit a page in that workspace.

## If it does not work

- **"Could not deploy to sandbox. x/waiting-room 0.1.0 is already deployed with other files."** You changed a view or a definition without raising `version`. Raise it.
- **"This deploy would delete 8 resources made in the console, because this repository has no file for them."** The workspace has resources the repository does not. Run `volvel pull --tenant fernhill --workspace sandbox`, or deploy with `--allow-delete <path>` for each one that should go.
- **The build says a widget's `entry` is not a file of the repository.** `entry` is a path from the repository's root, such as `src/widgets/waiting-room/view.tsx`.
- **The build says a view imports from the network or uses `import()`.** A view has no network: bundle what it needs, and give it its data through a data input.
- **The widget is not in Add to page.** Its `surfaces` do not include the page's (`app` or `dashboard`), or the workspace has not been deployed since you wrote it.
- **The card says "This widget did not load".** The frame sent no `ready` within 10 seconds. Reload. If it stays, the view throws before `createFrame` runs: open the browser's console.
- **The card says "This widget was stopped: it sent too many messages".** A view raised more than 20 messages a second for 2 seconds. Look for an event raised on every render.
- **`frame.emit` throws.** The event is not in the widget's `events`, or the definition and the view disagree about its name. Event names start with a small letter and hold letters and digits.

## Related

- [The widget frame](../reference/tenant-widgets/the-widget-frame)
- [The widget kind](../reference/kinds/widget)
- [Give a widget data and events](widget-data-and-events)
- [How widgets are kept safe](../explanation/widgets/how-widgets-are-kept-safe)
- [Add a widget to the core pack](add-a-core-widget)
