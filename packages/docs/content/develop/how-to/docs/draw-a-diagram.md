---
title: Draw a diagram in a page
description: "Write a diagram as a mermaid block in a page, and know how it is drawn in the console and on a served site, how a reader moves it, and what shows without script."
subjects: [documentation]
---

## Draw a diagram in a page

By the end a page holds a diagram that is drawn in the site's colors, that a reader can move and zoom, and that is its source for a reader with no script.

## Before you start

- A page of a workspace's documentation, in the console or in the repository.
- Diagrams are written as Mermaid.

## Steps

:::steps
1. In the page's source, write a fenced block whose language is `mermaid`:

   ````md
   ```mermaid
   flowchart LR
     A[Customer asks] --> B{Has an RMA?}
     B -- yes --> C[Refund]
   ```
   ````

2. In the console, look at the preview beside the source. The diagram is drawn there as it will be served.
3. Save the page and deploy it. The site draws the diagram when the page loads.
:::

## What a reader can do

The diagram is drawn in the site's own colors, and again when the reader's theme changes. To move and zoom it:

| Do | To |
| --- | --- |
| Drag | Move |
| :kbd[⌘] or :kbd[Ctrl] and scroll, or two fingers | Zoom |
| :kbd[+] or :kbd[=] and :kbd[-] | Zoom in and out |
| :kbd[0] | Fit it to its box |
| The arrow keys | Move it by a step |

The keys work when the diagram has the focus.

## The result

The diagram appears in the page and on the served site. A reader whose script is off, or a browser that has none, sees the Mermaid source in its place. The instance serves the drawing code and a reader fetches it only for a page that has a diagram.

## If it does not work

- **The diagram is its source under `volvel dev`.** A local site does not draw diagrams.
- **The diagram is its source on a served site.** The drawing code did not load, or the Mermaid in the block does not read. Fix the Mermaid in the editor's preview first.

## Related

- [Run a docs app locally](run-a-docs-app-locally)
- [Components](../../reference/docs/components)
