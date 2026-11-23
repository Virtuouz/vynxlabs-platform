---
title: Write a widget
description: "How a widget is declared and drawn in Volvel's own source, taking the Goal widget from its definition to its test."
subjects: [widgets, apps]
moved_from:
  - build/writing-a-widget
---

:::alert[Developer widgets are not available]{type=info}
This page is for contributors to Volvel's own source. A widget a developer writes for their own users, packaged in a tenant's repository, is not built: a repository cannot add a widget, and no page loads one. Every widget is declared in a pack that is compiled into the console and into the app runtime. The widgets Volvel ships are in the **core** pack. A second pack, **labs**, exists for tests and holds no widget that "Add to page" offers.
:::

## Write a widget

By the end you will have declared a widget, drawn it, added it to the core pack, tested it, and seen it in **Add to page**. The worked example is the Goal widget, `core/goal`, which shows how far a number is toward a target.

## Before you start

- A checkout of Volvel's source, with its dependencies installed.
- The widget needs a name of the form `pack/name`, in small letters: `core/goal`.
- Read how the contract keeps two kinds of people apart. A **developer** declares what a widget reads, what can be set, what it can tell the page and how big it may be. A **builder** adds it to a page, points it at data, sets it in the inspector and says what its events do, and writes no code. A widget cannot add a control to the inspector, read data nobody gave it or do anything the page did not say.

A widget is two halves. The **definition** is data and holds no browser code: the CLI, the control plane and the builder all read it. The **view** is a React component that is given the widget's configuration and data and draws them. A view is given no token and no way to fetch.

## Steps

:::steps
1. **Declare what it reads.** In `packages/widgets-core/src/index.ts`, call `defineWidget` with a `type`, a `version` (`x.y.z`), a `title`, a one-line `description`, a `category`, an `icon` and the `surfaces` it is offered on. Under `data`, name each input and its shape. Goal reads one summary: one or two values and no breakdown.

   ```ts
   data: { value: { shape: "summary", values: { min: 1, max: 2 }, breakdowns: { min: 0, max: 0 } } },
   dataHints: [
     {
       of: "value",
       controls: [
         { control: "source", label: "Source" },
         { control: "measure", label: "Value" },
         { control: "conditions", label: "Only include", help: "For example: Status is Paid." },
       ],
     },
   ],
   ```

2. **Declare what can be set.** `config` is a JSON Schema with an `x-volvel` hint on each property. The inspector is drawn from the hints alone. Goal puts "Goal" (`target`) and "Goal from a column" (`goalFrom`) in the Data tab under the group "Progress", and its looks in the Display tab.

   ```ts
   target: {
     type: "number",
     exclusiveMinimum: 0,
     "x-volvel": hint({
       tab: "data",
       group: "Progress",
       control: "number",
       label: "Goal",
       help: "A fixed amount. Or take it from a column below.",
       order: 1,
     }),
   },
   ```

3. **Declare what it tells the page, and its size.** Goal has one event, `click`, which gives nothing. It may be as small as 2 by 2 cells and starts at 3 by 3, and it stacks on a phone.

   ```ts
   defaults: { goodWhen: "up", bands: false, reached: "green", percent: true },
   events: { click: { gives: "nothing", label: "When it is clicked" } },
   layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 }, phone: "stack" },
   ```

4. **Add it to the pack.** Put the definition in the `CORE_WIDGETS` list at the foot of `packages/widgets-core/src/index.ts`. `defineWidget` throws when the definition is wrong, so a pack fails when it is built, not when a page is drawn. Write `words` for every setting the schema does not explain: the generated documentation draws a widget's page from the hints and the words, and a setting with neither is a gap there.

5. **Write the view.** Make `packages/widgets-core/views/goal.tsx`. It reads the one value it was given, works out the share, and draws the number, a bar that never passes its end with a label for a screen reader, the share, which can pass 100%, and the line under it. It uses only `react`, `@volvel/widgets` and `@volvel/ui`. Use the kit's color classes and no raw colors, so it follows light and dark. Size what you draw by the cell's width with a container query such as `@[14rem]/cell:`, not by the window.

   The view does not draw loading, empty, failed or forbidden: the frame around the widget does, the same way for every widget. It does not know where its data came from or what a click does. It is a button (`role="button"`) only when the page does something on `click`, which `listens("click")` says.

6. **Register the view.** In `packages/widgets-core/views/index.ts` add the view to `corePack.views`, under its type: `"core/goal": GoalView`. A definition with no view, or a type in two packs, throws when the registry is built.

7. **Test it.** Copy `packages/screens/src/goal.test.tsx`. Check the definition with `definitionProblems`, which returns each fault as a sentence, and draw the view with sample data in happy-dom. Run it.

   ```bash
   npx vitest run packages/screens/src/goal.test.tsx
   ```

8. **Look at it.** Open an app in **App Builder**, press **Add to page**, and find the widget under its category. Goal is in **Understand data** with "How far a number is toward a target". Add it, point it at a table, and set it up in the inspector. Reload, and look at it in light and dark and at phone width.
:::

## The result

The widget is in **Add to page**, drawn from its definition, and its settings are in the inspector's tabs: **Data**, **Display**, **Actions** and **Rules**. The builder sets it up the way they set any widget. The widget's page in the generated reference is drawn from the definition.

The Goal widget in the builder has a Data tab with a source, a **Value** and **Only include**, and a group **Progress** with **Goal** and **Goal from a column**, which wins when both are set. Its Display tab has **A line under it**, **Numbers**, **Show the percentage**, **When reached, the bar** (**Turns green** or **Stays**), and under **More**, **Good news is** and **Color by how close**.

## What the contract offers

### The definition

| Field | Says |
| --- | --- |
| `type`, `version` | `pack/name` and `x.y.z`. |
| `title`, `description`, `category`, `icon` | What **Add to page** shows. A category is `records`, `action`, `understand`, `organize` or `content`, shown as **Work with records**, **Take action**, **Understand data**, **Organize** and **Content**. The icon is a platform widget's name, a page icon, or `globe`, `radio` or `table-2`; any other name draws a puzzle piece. |
| `surfaces` | `app`, `dashboard`, or both. |
| `data`, `dataHints` | What it reads, and the Data tab's controls for each input, in order. |
| `config`, `words`, `defaults`, `initialData` | What can be set, what each setting is, what the widget is when it is added, and a source a widget starts with. |
| `events` | What it can tell the page, each with the words the Actions tab shows. |
| `layout` | `min`, `default` and `max` sizes in the page's grid of 12 columns and rows of 40 pixels, `phone` (`stack`, `list` or `hide`), and `frame` (`card` or `none`). |
| `role` | `container` or `filters`. Only the core pack may set it. |

A type is `pack/name` in small letters, at most 31 characters before the slash and 41 after. A version is `x.y.z`. A data input's name and an event's name start with a small letter, and are up to 41 characters of letters and digits. Sizes are 1 to 12 wide and 1 to 40 high, and the default may not be smaller than the minimum or larger than the maximum. `version` is checked for its shape. This page does not say that a deploy pins it.

### Data

A widget does not fetch. The platform reads each input under the viewer's permissions and hands it over.

| Shape | What the view gets |
| --- | --- |
| `rows` | Rows of a table or a query, a page at a time, with `more`, `total`, `groups`, `sortBy` and `sorted`. |
| `summary` | Rows gathered into groups with a value for each group, or one line of values with no groups. It may carry `previous` and a `trend`. A summary says how many values it takes and how many breakdowns. |
| `record` | One row. |
| `approvals` | The steps of the workspace's flows that wait for a decision. A widget that reads it is read for a member only. |

An input may come from a table, a query, SQL or the workspace's approvals. SQL is never offered on an app's page.

### Settings and controls

Each setting has a hint with a `tab` (`data`, `display`, `actions` or `rules`), an optional `group`, a `level` (`main`, or `more` under "More options"), a `control`, a `label`, and optionally `help`, `of`, `types`, `choices`, `when` and `order`. A setting with no hint, or a hint with a control that does not exist, is refused when the pack is built.

There are 28 controls. For a setting: `text`, `markdown`, `number`, `switch`, `choice`, `segmented`, `format`, `column`, `columns`, `filter`, `action`, `actions`, `page`, `tabs`, `pageFilters`, `position`, `tiles`, `slots`, `icon`, `groups`, `fields` and `groupRows`. For a data input: `source`, `measure`, `breakdown`, `conditions`, `sort` and `limit`.

A widget cannot add a control, and a pack cannot add a custom inspector section. The console registers its own sections for some widgets, among them Goal, Chart, Stat and Pivot, in its own source. For a `slots` setting a pack gets only "its places are drawn by the widget" unless the console registers a drawer for it.

### What a view is given

| Prop | What it is |
| --- | --- |
| `config` | The settings, with `defaults` filled in. |
| `data` | Each input, read, by name. |
| `size` | `w` and `h` in cells, and whether the page is a phone's width. |
| `emit(event, payload)` | Raises a declared event. The host checks the payload against the declaration. |
| `building`, `viewing` | Whether the page is being built, and whether it is viewed as a group. A view may draw a hint for the builder and never different data. |
| `title`, `viewer`, `selectedRecord` | The widget's title, the person looking, and the record whose sheet is open. |
| `act`, `can`, `why` | Runs an action the widget holds, says whether one may be pressed, and why not. Absent while building. |
| `decide`, `refresh` | Decides a waiting approval, and reads the data again. |
| `listens`, `choices`, `close` | Whether the page does something when an event is raised, what a reference or choice column offers, and a way to close the sheet or modal the widget is shown in. |
| `place`, `tab`, `filters` | A container's (`role: "container"`) drawing of the widgets placed in it, its open tab, and a filter widget's (`role: "filters"`) values and how to set them. |

There are no hooks to call. Actions are data: a step is `update`, `create`, `delete`, `flow`, `script`, `open`, `close`, `message`, `narrow` or `rows`, and the server runs the first five.

### Helpers

`@volvel/widgets` exports `formatValue`, `formatNumber`, `formatDay`, `numberOf`, `sentenceCase`, `choiceWords`, `mustGive`, `countText`, `readerLocale`, `moneyFormatOf`, `parseMoney`, `moneyText` and `FORMAT_SCHEMA`. Numbers follow the reader's browser language, and use en-US when it gives none.

## If it does not work

- **The pack throws "`<type>` has a definition but no view".** Add the view to `corePack.views`.
- **The pack throws "`<type>` is declared twice" or "is in two packs".** A type is one widget.
- **`definitionProblems` says a config has no `x-volvel` hint.** Give every property a hint, or the inspector cannot draw it.
- **A view fails the import check.** A pack's views may import `react`, `@volvel/widgets`, `@volvel/ui` and their own files, and nothing else: `apps/console/src/enforce.test.ts` holds this.
- **The widget is not in "Add to page".** Its `surfaces` do not include the page's surface, or it is not in `CORE_WIDGETS`.
- **A widget needs something the contract does not offer.** The contract grows, for every widget. A widget does not reach around it.
