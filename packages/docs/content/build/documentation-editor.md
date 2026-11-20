---
title: The page editor
order: 13
topic: build-docs-editor
description: Where a page of documentation is written, beside the page as it will be served.
---

The page's source is on one side and the page as its readers will see it on the other. The preview is drawn by the same code that serves the page, so what you see is what is served.

Problems are marked on their lines as you type, by the rules a deploy holds the page to: a link to a page that is not there, a term nobody defines, a component written wrongly. A page with problems can be saved as a draft and cannot be deployed.

Saving makes a :term[draft]{id=draft}. If someone else saved the page after you opened it, your save is refused and nothing of theirs is overwritten.

See [components](../reference/docs/components) for alerts, tabs, terms and the rest, and [the top of a page](../reference/docs/frontmatter) for its title, order and topic.

::screenshot{name=console/page-editor alt="The page editor: the page's Markdown on the left, the page as it will be served on the right, and its problems listed under."}
