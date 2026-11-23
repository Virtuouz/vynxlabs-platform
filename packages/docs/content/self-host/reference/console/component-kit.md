---
title: Component kit
topic: instance-kit
description: "Every section, control and limit of the Component kit sheet: the console's parts drawn live, in the instance's own theme, for operators."
subjects: [branding]
moved_from:
  - instance/component-kit
---

The **Component kit** screen draws the console's parts as this instance draws them, in whichever theme is on. It is a reference for an operator who changes the console or its branding, and for whoever builds on the kit: set a color under **Console branding** and see here, at once, what changes. It is read-only: every sample is fixed, nothing is read from the instance and nothing is saved.

The screen is reached from **Instance**, then **Component kit**, at `/instance/kit`. F1 (**Help for this page**) opens the help topic `instance-kit`. The title is **Component kit**, with the label **Instance** above it, and the description: "The console's parts as this instance draws them, in whichever theme is on. A reference for anyone changing the console or its branding."

::screenshot{name=self-host/extensions-component-kit alt="The Component kit screen: the Tokens section with color swatches and their names, above the Type roles section."}

## Who sees it

The whole `/instance/*` area is for operators. Anyone else who opens an address there sees **For operators**: "This screen is part of running the instance, which only its operators can do. An operator of this instance can give you access." with a link, **Go to your tenants**. See [Operators](operators).

## Sections

The sections are on one page, in this order. Each has a small heading in capitals.

| Section | What it shows |
| --- | --- |
| **Tokens** | A swatch and the name of each of 19 colors: `canvas`, `structure`, `surface`, `raised`, `selected`, `sunken`, `line`, `line-strong`, `line-control`, `ink`, `ink-muted`, `ink-subtle`, `action`, `action-soft`, `attention`, `danger`, `success`, `code-bg`, `focus`. They are drawn from the instance's `--vx-` variables, so a change in **Console branding** shows here. |
| **Type roles** | Display large (26 px), Display (20 px), Title (16 px), Emphasis (15 px), Body (14 px), Body small (13 px), Meta (12 px), Label (11 px, capitals), and two sizes of code type. |
| **Corners and elevation** | Five boxes: Inner (tags, chips, cells), Control (buttons, inputs), Panel (tables, panels), Overlay (dialogs, sheets) and Raised (menus, toasts). |
| **Motifs** | The signal path (where you are and where it goes), port brackets (the one chosen object), the inset rule (an inspector's heading) and junctions (an ordered history). |
| **State and environment** | Every state pill, a pill with a time, a pill for an unknown state, the **Dev** and **Production** tags, and the tags **Draft**, **From repository**, **Live**, neutral, attention and danger, and a count badge. |
| **Actions** | Buttons in the variants primary, secondary, quiet, danger, dashed and promote, in three sizes (28, 36 and 40 px), loading, disabled and pressed. One primary per screen. The amber promote button is kept for the one action that changes production. |
| **Narrowing, stages and facts** | Filter chips with counts, a stepper (Review draft, Deploy to dev, Promote to production) and a list of facts (a timeout, retries, an on-failure script). |
| **Status with a next step** | A line with a title, a detail and a button, and an attention notice. |
| **Fields** | A required text field, an optional one with a hint, one with an error, a choice, a searchable choice, a yes or no, and a stored secret. |
| **Notices, loading and failing** | Plain, success, attention and danger notices, a failed-load state with its request ID and a retry, and a loading skeleton. |
| **A list, at each density** | A list at compact and at standard density, with state pills, paths and times. |
| **A grid of rows, from the keyboard** | A small grid with two editable columns and one row checked. |
| **Saving a page** | The save bar, with its **Save** and **Discard**. |
| **Tooltips, keys and menus** | A button with a tooltip and its key, a disabled button with a reason, key caps, a right-click menu, and a columns menu. |
| **Help beside a word, a folded section and a tree** | A defined term (the second mention is plain), a toggletip, a folded section, and a tree of pages. |
| **A page of documentation** | A rendered page with a keyboard hint, a warning, tabs for CLI and console, steps and a table. |
| **Rows checked, for a batch** | A list with two rows checked and a bar of batch actions. |
| **Panes, and a difference** | A pane splitter you can drag or move with the keyboard, and a side-by-side difference of two versions of a script. |
| **Values, cut and whole** | Durations, times, an identifier with a copy button, text cut in the middle and at the end, a page heading with a note, environment tags, and settings rows. |
| **Drawer** | A sample of the page builder's inspector: a header, tabs and the groups of rows it is made of (**Rows it uses**, **What it shows**, **Chart type**, **When a row is clicked**, **Style**, **Place in its cell**, **Columns**, **Steps**). |
| **The boards' parts** | Button variants (main, normal, quiet, danger, dashed), key caps, inline fields, a segmented control, switches, tabs, a popover, a menu, and buttons that open a **Dialog** and a **Side sheet**. |
| **Empty canvas** | The empty state for a screen with nothing yet, with its action. |

## Controls

| Control | What it does |
| --- | --- |
| **Dialog**, **Side sheet** (in **The boards' parts**) | Open a sample dialog and a sample side sheet, which close again. They save nothing. |
| A tree node, a segmented control, a switch, tabs, a filter chip | Change in place, so you can see their selected states. |
| The page's own **Color theme** button | Switches the console between light and dark. The kit is drawn in the theme that is on. |

## Which parts are not in `@volvel/ui`

The sheet draws two kinds of part. Most are in the `@volvel/ui` package, which an app can install. Some belong to the console alone and cannot be imported from `@volvel/ui`:

- Page and layout: the page header, the section label, the empty canvas, the filter chips, the stepper, the list of facts, the next-step line, and the settings rows.
- Data and status: the list (`DataTable`), the state pill, the environment tag, the tag, the monospace text, the time, the truncated text, the columns menu and the identifier with a copy button.
- Motifs: the signal path, port brackets, the inset rule and junctions.
- Editing: the save bar, the secret field, the pane splitter and the difference view.

## States

The screen has none of its own: it draws fixed samples. It shows the theme that is on, light or dark, and the instance's branding.

## Permissions

| Action | Needs |
| --- | --- |
| Open the screen | To be an operator of the instance. |

## Related

- [Console branding](branding): the instance's own colors, logo and name.
- [Instance health](health)
