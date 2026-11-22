---
title: Writing a widget
description: "How a widget is made: what it declares, what it is given to draw, and how the builder configures it without any code of its own."
---

A widget is a piece of a page: a table, a number, a chart, a goal. Every widget the product ships is made the same way, and so is every one that will come later. This page says how, and walks through a small one, `labs/goal`, from start to end.

:::alert[Developer widgets are not available yet]{type=info}
Everything here is true of the widgets the product ships today. A widget a developer writes for their own users, packaged in a repository and run in a sandboxed frame, is designed and not built. It would be a new kind of resource in a tenant's repository, run in a frame with no network, and shown to builders exactly as the product's own widgets are. When it is, it will be written as this page says.
:::

## The boundary

Two kinds of people work with a widget, and each keeps to their side.

- **A developer declares what a widget can do.** What it reads, what can be set, what it can tell the page, how big it may be.
- **A builder configures it.** They add it to a page, point it at their data, set it up in the inspector and say what its events do. They write no code.

The platform keeps the two apart. A widget cannot add a control to the inspector, read data nobody gave it, or do anything the page did not say. A builder cannot make a widget do more than its definition declared.

## A widget is two halves

A **definition** is data. It has no browser code, so the CLI, the control plane and the builder can all read it. It says:

| What | Says |
| --- | --- |
| `type` and `version` | Its name, as `pack/name` (`labs/goal`), and its version. |
| `title`, `description`, `category`, `icon` | What "Add to page" shows. The category (`records`, `action`, `understand`, `organize`, `content`) is how widgets are grouped there. |
| `surfaces` | Where it is offered: `app` for an app's page, `dashboard`. |
| `data` | What it reads, as named inputs. |
| `config` | What can be set, with a hint for each setting. |
| `events` | What it can tell the page. |
| `layout` | How big it may be, and what it does on a phone. |

A **view** is a component. It is given its configuration, the data the platform read for it, and a way to raise its events. It is given nothing else: no token, no way to fetch, no other widget's data. When the data is still loading, or empty, or could not be read, or the viewer may not read it, the frame around the widget says so, the same way for every widget. A view is only drawn when there is something to draw.

The view's props are:

| Prop | What it is |
| --- | --- |
| `config` | The widget's settings, with the definition's `defaults` filled in. |
| `data` | Each data input, read, by name. |
| `size` | Its width and height in cells, and whether the page is a phone's width. |
| `emit(event, payload)` | Raises an event the definition declared. |
| `building` | Whether the page is being built. A view may draw a hint for the builder. It never draws different data. |

A pack is the two together: `{ definitions, views }`. Definitions come from `@volvel/widgets`, which has no React in it. Views are written with `@volvel/widgets`, `@volvel/ui` and `react`, and nothing else.

## Data

A widget does not fetch. It declares each thing it reads as a named input with a shape, and the platform reads it under the viewer's permissions and hands it over.

| Shape | What the view gets |
| --- | --- |
| `rows` | Rows of a table or a query, a page at a time. It is how a table or a list reads. |
| `summary` | Rows gathered into groups with a value for each group (a total, a count, an average), or one line of values with no groups. |
| `record` | One row. |

A summary also says how many values it takes (`values: { min, max }`) and how many ways it may be broken down (`breakdowns: { min, max }`). A widget that shows one number takes one value and no breakdowns.

The `dataHints` say which of the data controls the builder gets for each input, in order: `source` (a table, a query, or on a dashboard SQL), `measure` ("Value"), `breakdown`, `conditions` ("Only include"), `sort` and `limit`. The builder fills them in. The widget never sees where its data came from.

## What can be set

`config` is a JSON Schema for the settings. Each setting carries an `x-volvel` hint, and the inspector is drawn from the hints alone. There is no other way to put a setting in it.

A hint says:

- `tab`: Data, Display, Actions or Rules;
- `level`: `main` is shown at once, `more` is under "More options";
- `control`: how it is drawn, one of a fixed set;
- `label` and `help`: the words next to it;
- for a `choice` or `segmented` control, `choices`; for a column control, `of`, the input it belongs to, and `types`, the column types it offers; `when`, to show it only when other settings have given values.

The controls are `text`, `markdown`, `number`, `switch`, `choice`, `segmented`, `format`, `column`, `columns` and `filter` for a setting, and `source`, `measure`, `breakdown`, `conditions`, `sort` and `limit` for a data input. A setting with no hint, or a hint with a control that does not exist, is refused when the pack is built.

Write labels and help in the reader's words: "A line under it", not "caption".

## Events

An event is something the viewer does to the widget that the page may react to. A definition declares each one with a name, the words the builder sees in the Actions tab ("When a row is clicked") and what it gives:

- `record`: a row, by its id (a row clicked);
- `group`: the values of a group's breakdown (a bar clicked);
- `nothing`.

The view raises it with `emit`. The host checks the payload against what was declared and drops anything else. What happens next is whatever the builder set up in the Actions tab, or nothing.

## Layout

`layout` gives `min`, `default` and optionally `max`, in the page's grid of twelve columns and rows of 40 pixels. The builder cannot resize the widget outside them. `phone` is what it does on a narrow screen when nobody has said: `stack` (full width, in reading order), `list` (as stack, but its view draws a list) or `hide`.

Draw to the size you are given. A view that only works at its default size will break when it is made smaller, or on a phone.

## Walkthrough: a goal

`labs/goal` is in the labs pack, which exists to prove that nothing in the builder is made for the product's own widgets alone. It shows how far a number is toward a target: "$45,000 of $60,000 this month", with a bar and "75%".

### The definition

It reads one number, so it declares one summary input with one value and no breakdowns, and the builder's Data tab gets a source, a Value and "Only include":

```ts
data: { value: { shape: "summary", values: { min: 1, max: 1 }, breakdowns: { min: 0, max: 0 } } },
dataHints: [
  {
    of: "value",
    controls: [
      { control: "source", label: "Source" },
      { control: "measure", label: "Value" },
      { control: "conditions", label: "Only include" },
    ],
  },
],
```

Its settings are the target, how the numbers look and a line under it, which are shown at once, and which way good news goes and whether to colour the bar, which are under "More options":

```ts
target: {
  type: "number",
  exclusiveMinimum: 0,
  "x-volvel": { tab: "display", control: "number", label: "Target" },
},
bands: {
  type: "boolean",
  "x-volvel": { tab: "display", level: "more", control: "switch", label: "Colour by how close" },
},
```

It declares one event, `click`, which gives nothing. It may be as small as 2 by 2 cells, starts at 3 by 3, and stacks on a phone. It is offered on apps and dashboards, in "Understand data".

### The view

The view reads the one value the platform gave it, works out the share, and draws what the definition promised:

1. The number, written as the format says.
2. A bar as full as the share is, never past its end, with a label for a screen reader.
3. The share reached, which can go past 100%.
4. The line under it.

It uses the kit's theme colours and nothing raw, so it follows light and dark and the instance's branding. A click raises `click`.

It does not draw loading, empty or failed. The frame does. It does not know where the number came from, or what a click does.

### What the builder sees

Nothing else was written. The builder finds Goal in "Add to page", picks a table, a Value (for example "Sum of Total") and a condition, types a target, and sets it to look like money. That is the same inspector, the same Data tab and the same Actions tab as for every other widget.

## Making a pack

A pack is a folder with two parts:

- `src/` holds the definitions, built with `tsc` and exported from the package;
- `views/` holds the views, exported from source as `./views`, as `{ definitions, views: { "labs/goal": GoalView } }`.

Check your definition with `definitionProblems` from `@volvel/widgets`, which gives each fault as a sentence, or declare it with `defineWidget`, which throws on the first build. A test of the definition and a test that draws the view with sample data are enough to start.

When a widget needs something the contract does not offer, that is for the contract to grow, for every widget. It is not for a widget to reach around.
