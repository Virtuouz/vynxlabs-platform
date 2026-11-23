---
title: Keyboard shortcuts
description: "Every shortcut of the console by where it works, the keys a list takes that the sheet does not show, and the switch that turns single keys off."
subjects: [shortcuts, navigation]
---

Press :kbd[?] outside a text field, or choose **Keyboard shortcuts** in the account menu or the palette, to open the sheet of shortcuts. It is drawn from one list in the console, so it is always what the console does. Keys show as ⌘, ⇧ and ⌥ on a Mac and as Ctrl, Shift and Alt elsewhere; this page writes the Mac forms, and `Mod` stands for ⌘ on a Mac and Ctrl elsewhere.

## Single keys

A key that types something on its own (`?`, `/`, `j`, `k`, `x`, `a`, and the `g` shortcuts) is ignored while you type in a field, and can be turned off. In the sheet, the checkbox **Single-key shortcuts** turns them all off, for a screen reader or speech input that gets in their way. It is one of your settings. With it off, the sheet marks a row "(off)" when every key of it is off, and "(single keys off)" when some keys still work. Enter, Space, the arrows, Home, End, Page keys and Shift+F10 stay on, and so do the shortcuts that use ⌘, Ctrl or Alt.

## Everywhere

| Keys | What it does |
| --- | --- |
| :kbd[⌘K] | Find anything, or do something: opens the palette. |
| :kbd[?] | Opens the sheet. |
| :kbd[/] | Searches the list on screen: puts the cursor in its search box. Where there is none, opens the palette. |
| :kbd[F1] or :kbd[⌘/] | Help for this page. |

## Go to

Press :kbd[g], then the second key within 1 second.

| Keys | Goes to |
| --- | --- |
| :kbd[g o] | **Overview** of the workspace. |
| :kbd[g r] | **Runs**. |
| :kbd[g f] | **Flows**. |
| :kbd[g s] | **Scripts**. |
| :kbd[g t] | **Triggers**. |
| :kbd[g a] | **Approvals**: the workspace's own inside a workspace, the tenant's inside a tenant. |

All but :kbd[g a] work only inside a workspace. :kbd[g a] needs a tenant.

## Lists

These work while the focus is inside a table.

| Keys | What it does |
| --- | --- |
| :kbd[j] :kbd[k] :kbd[↓] :kbd[↑] | Move down or up the list. |
| :kbd[←] :kbd[→] | Move between cells. |
| :kbd[Home] :kbd[End] | First or last cell of the row. With :kbd[⌘] the first or last row. |
| :kbd[PageUp] :kbd[PageDown] | Move a page. |
| :kbd[Enter] | Open the row. |
| :kbd[⌘↵] | Open the row in a new tab, for a list whose rows have an address. |
| :kbd[x] or :kbd[Space] | Check the row. |
| :kbd[⇧J] :kbd[⇧K] | Check the rows from here down or up. |
| :kbd[⌘A] | Check every row shown. |
| :kbd[Esc] | Uncheck the rows. With none checked, close what is open beside the list. |

## Editors

| Keys | What it does |
| --- | --- |
| :kbd[a] | Add to the page being built, in the page editor. |
| :kbd[⌘S] | Save now. |
| :kbd[⌘↵] | Run the draft, in a script's editor. |
| :kbd[F2] | Rename the page of documentation that is open. |
| :kbd[⌘Z] | Undo. |
| :kbd[⇧⌘Z] or :kbd[Ctrl+Y] | Redo. |

Undo, redo and rename are ignored while you type in a field, which has its own.

## Flow editor

| Keys | What it does |
| --- | --- |
| :kbd[⌘D] | Duplicate the chosen steps. |
| :kbd[⌘C] :kbd[⌘X] :kbd[⌘V] | Copy, cut or paste the chosen steps, here or in another flow. |
| :kbd[⇧F10] | The menu for a step, or for the canvas. |

## Palette

| Keys | What it does |
| --- | --- |
| :kbd[>] | Then an ID: open a run. |
| :kbd[#] | Then a name: find a script, a flow, a table and the like. |
| :kbd[/] | Then a word: run a script, start a flow, pause a trigger and the like. |
| :kbd[@] | Then a name: find a person. |
| :kbd[⌘↵] | Run, start or run again what is chosen. |
| :kbd[⌘P] | Pin or unpin what is chosen. Not on the sheet. |
| :kbd[Backspace] | In an empty box, leave a picker. Not on the sheet. |

## Logs

| Keys | What it does |
| --- | --- |
| :kbd[⌘F] | Find in the log. |

## Related

- [Finding your way](finding-your-way): the palette and the rest of the frame.
- [Filter, sort and save a list](../../how-to/basics/work-with-lists)
