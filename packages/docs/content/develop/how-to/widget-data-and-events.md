---
title: Give a widget data and events
description: "Declare the data a widget reads and the event it raises, bind them in a page's file, and have a press on the widget narrow the page, taking Fernhill's Clinic load gauge as the example."
subjects: [widgets, widget-frame]
---

## Give a widget data and events

By the end a dashboard of Fernhill's shows two Clinic load gauges. Each reads its numbers from Fernhill's tables, and pressing one narrows a table on the same page to that clinic. It takes about 20 minutes.

A widget's view has no network. It is given the data its definition declares, read by the server under the viewer's permissions, and it can tell the page only about events its definition declares. This page shows the two declarations, the two bindings in a page's file, and what happens when they disagree. For the first widget from start to deploy, see [Write a widget for your tenant](writing-a-widget).

## Before you start

- Fernhill is set up, and it has the widget `x/clinic-load` in its repository: `examples/fernhill/src/widgets/clinic-load`. It is deployed to the Sandbox workspace with the example. See [Set up the Fernhill example](../../start/how-to/example/set-up-the-fernhill-example).
- You are Devi Shah (`devi.shah@fernhill.example`) in `examples/fernhill`, with the CLI signed in as you, as in [Write a widget for your tenant](writing-a-widget). You need `deployment:write` in the Sandbox workspace.
- A dashboard of the workspace is a file in the repository, `platform/boards/<name>.dashboard.yaml`. If the workspace holds resources the repository has no file for, run `volvel pull --tenant fernhill --workspace sandbox` first.

## Declare what it reads

Open `src/widgets/clinic-load/widget.ts`. Its `data` has two inputs, each with the shape of what the view is given:

```ts
data: {
  visits: {
    shape: "summary",
    label: "Visits",
    sources: ["table", "query"],
    values: { min: 1, max: 1 },
    breakdowns: { min: 1, max: 1 },
  },
  clinics: { shape: "rows", label: "Clinics", sources: ["table", "query"] },
},
```

- `visits` is a **summary**: rows gathered into groups, with one value for each group. Here it is one value, a count, broken down one way, by clinic. The view finds its clinic's row.
- `clinics` is **rows**: the clinics table, which holds each clinic's `opens` and `closes`. The gauge works out its capacity from the hours.
- `sources` says where a builder may point the input: a `table`, a `query`, `sql` or `approvals`. Left out: a table or a query, and SQL on a dashboard.
- `dataHints` is what the inspector's **Data** tab offers for each input: **Visits from**, **Count**, **Clinic column**, **Only include**, and **Clinics from**. An input with no hints cannot be chosen in the console, so `volvel widget new` writes them.

The other shapes are `record`, one row, and `approvals`. See [What a widget view is given](../reference/tenant-widgets/what-a-view-is-given).

## Declare what it can tell the page

In the same file, `events` has one event:

```ts
events: {
  clinicChosen: {
    gives: "group",
    label: "When the gauge is pressed",
    payload: {
      type: "object",
      required: ["group"],
      additionalProperties: false,
      properties: {
        group: {
          type: "object",
          required: ["clinic"],
          additionalProperties: false,
          properties: { clinic: { type: "string", minLength: 1, maxLength: 40 } },
        },
      },
    },
  },
},
```

- The name starts with a small letter and holds letters and digits, up to 41 characters. A name with a hyphen is refused when the repository is built.
- `label` is what the **Actions** tab calls the event: "When the gauge is pressed".
- `gives` says what the event hands to an action: a `record` (`{record: "<id>"}`), a `group` (`{group: {…}}`, such as the row of a chart's bar), or `nothing`.
- `payload` is a JSON Schema for what the view sends. The page checks every message against it and drops what does not fit. Left out, the shape `gives` names is checked. The checker reads `type`, `enum`, `const`, `properties`, `required`, `additionalProperties`, `items`, the length, size and count limits, `pattern`, `anyOf`, `oneOf` and `allOf`. A schema with a keyword it does not read, such as `$ref`, admits nothing.

In the view, raise it with the same payload:

```tsx
onClick={() => frame.emit("clinicChosen", { group: { clinic: config.clinic } })}
```

## Bind both in a page

:::steps
1. Make `platform/boards/clinic-load.dashboard.yaml`:

   ```yaml
   schemaVersion: 3
   body:
     title: Clinic load
     description: Today's visits against what each clinic can take. Press a gauge to see that clinic's visits.
     widgets:
       # The filter the gauges narrow. Its name, `clinic`, is what the event refers to.
       - id: filters
         type: core/filter
         at: { x: 0, y: 0, w: 12, h: 2 }
         config:
           reset: true
           filters:
             - name: clinic
               label: Clinic
               type: choice
               from: { table: appointments, column: clinic }
       - id: load-northside
         type: x/clinic-load
         version: 1.0.0
         title: Northside today
         at: { x: 0, y: 2, w: 4, h: 4 }
         config:
           clinic: northside
         data:
           # One entry for each input the definition declares.
           visits:
             source:
               visual:
                 table: appointments
                 filters:
                   - { column: starts_at, op: last, value: { count: 1, unit: day } }
                   - { column: status, op: in, value: [booked, checked_in, in_exam, done] }
                 groupBy:
                   - column: clinic
                 measures:
                   - { fn: count, as: visits }
           clinics:
             source:
               visual:
                 table: clinics
         on:
           # The widget raises clinicChosen with {group: {clinic: "northside"}}.
           # The page sets its `clinic` filter to the `clinic` of that group.
           clinicChosen:
             steps:
               - { do: narrow, filter: clinic, from: clinic }
       - id: load-riverside
         type: x/clinic-load
         version: 1.0.0
         title: Riverside today
         at: { x: 4, y: 2, w: 4, h: 4 }
         config:
           clinic: riverside
           perHour: 2
           busyAt: 60
           fullAt: 80
         data:
           visits:
             source:
               visual:
                 table: appointments
                 filters:
                   - { column: starts_at, op: last, value: { count: 1, unit: day } }
                   - { column: status, op: in, value: [booked, checked_in, in_exam, done] }
                 groupBy:
                   - column: clinic
                 measures:
                   - { fn: count, as: visits }
           clinics:
             source:
               visual:
                 table: clinics
         on:
           clinicChosen:
             steps:
               - { do: narrow, filter: clinic, from: clinic }
       - id: visits
         type: core/table
         title: Visits
         at: { x: 0, y: 6, w: 12, h: 9 }
         data:
           rows:
             source:
               visual:
                 table: appointments
                 sort:
                   - { by: starts_at, descending: true }
                 limit: 50
             filters:
               - { filter: clinic, column: clinic }
         config:
           columns:
             - { column: starts_at, label: When }
             - { column: pet_name, label: Pet }
             - { column: clinic }
             - { column: status }
   ```

   A placed widget names the `version` it was placed with, its `config` (checked against the definition's schema), its `data` by input name, and an action for each event under `on`. The `config` of the Northside gauge is only the clinic: the other settings are the definition's `defaults`.
2. Deploy:

   ```bash
   volvel deploy --tenant fernhill --workspace sandbox
   ```

   It prints "Deployed version" and a number, and `created  dashboard  boards/clinic-load`.
3. In the Sandbox workspace, open **Data**, then **Dashboards**, then **Clinic load**. Two gauges are drawn, each with its clinic's name, the visits booked today, the capacity and the share, and a table of visits under them.
4. Press the **Riverside today** gauge, or focus it with :kbd[Tab] and press :kbd[↵]. The **Clinic** filter reads `riverside`, a **Clear** button appears beside it, and the table lists Riverside's visits only.
:::

## When the action changes something

The step above only narrows the page, so it runs at once. If you wire `clinicChosen` to a step that changes something (`script`, `flow`, `create`, `update` or `delete`), a person who presses the gauge is first asked to confirm, in a dialog the page draws outside the frame. It names the widget, the event and what will happen (for example "Run the script 'Close open orders'?"), and **Cancel** is where focus starts. Nothing runs until they choose **Confirm**. A frame can raise an event without a click, so the page asks, as it cannot tell the two apart. While one confirmation is open, a further event that would change something is dropped. The inspector's **Actions** tab says this beside such an event. Platform widgets are not asked about this way.

## The result

Each gauge is given the two inputs the file binds, as read for you. A press on a gauge raises `clinicChosen`. The page checks it against the payload schema, and the step `narrow` sets the page's `clinic` filter to the `clinic` of the group. Everything the filter narrows follows. The same file narrows a table, and could narrow a chart.

A person who may read fewer visits sees fewer in each gauge, because the server applies the table's rules for each viewer. The gauge is the same code.

## If it does not work

- **The gauge says "No clinic has the code "…"".** `config.clinic` is not a `code` in the clinics table. The codes are `northside`, `riverside` and `hilltop`.
- **The gauge shows 0 visits.** The `visits` input has no row for that clinic: check the table, the conditions and that the breakdown is the `clinic` column.
- **A press does nothing.** The page dropped the message. Run `volvel dev --widgets`, open **Clinic load** and press it: the log says `dropped` with the reason, such as `the widget does not declare an event "…"` or `"clinicChosen": …` followed by the schema's complaint. The page filters messages the same way.
- **The press narrows nothing.** The step names a filter that no **Search and filter** widget on the page declares, or `from` is not a field of the group.
- **The deploy is refused with "…places x/clinic-load 1.0.0".** A page places a version that the workspace does not have. Deploy the version first, or place the one it has.

## Related

- [Write a widget for your tenant](writing-a-widget)
- [What a widget view is given](../reference/tenant-widgets/what-a-view-is-given)
- [The widget frame](../reference/tenant-widgets/the-widget-frame)
- [How widgets are kept safe](../explanation/widgets/how-widgets-are-kept-safe)
