---
title: Links, pictures and moved pages
description: "How a link, a topic link, a heading anchor and a picture in a page are resolved and checked, and what a page that moves leaves behind."
subjects: [documentation, links, pages]
---

How a page's links and pictures are read, which are checked at build and deploy, and what readers of an old address are given. What a page may say at its top is listed in [the top of a page](../docs/frontmatter), and the components in [Components](../docs/components).

## Links

A link is checked when the workspace is built and at every deploy. A broken link is an error: the page cannot be deployed.

| Link | Written as | Resolves to |
| --- | --- | --- |
| A page | `[Refunds](refunds)`, `[Refunds](refunds.md)`, `[Refunds](../support/refunds)` | The page at that path, from the folder of the page that holds the link. `.md` on the end is optional. |
| A folder | `[Support](../support)` | The folder's own page, `support/index`. |
| The home page | `[Home](../index)` | The site's `index`. |
| A heading | `[Refunds](refunds#partial)`, `[Below](#partial)` | The heading whose id is the slug of its text. The id is checked: a heading that is not there is `anchor_missing`. |
| A topic | `[Refunds](topic:support-refunds)`, `topic:support-refunds#partial` | Whichever page has that topic, wherever it has moved to. A topic no page has is `topic_unknown`. |
| A web address | `https://…`, `http://…`, `mailto:…` | Itself. |

A link that leaves the pages of the site (`../../..` past the top) is refused: "The link to "…" leads out of the documentation." A link to a page that is not there says "The link to "…" leads nowhere: there is no page at …". Any other scheme, an empty link, and a link that begins `//` or `\` are refused.

A heading's id is its text as a slug, and a second heading with the same text gets `-1`. Renaming a heading that is linked breaks the link, and the build says so.

## Pictures

A picture is `![alt](path)`.

| Picture | Written as | What happens |
| --- | --- | --- |
| A file | `![The till](img/till.png)` | A file in the folder of pages, relative to the page that holds it: `docs/handbook/img/till.png` is `img/till.png` from `handbook/index`. It is checked by a deploy, not by `volvel build`: "The picture "…" is not there: no file at …". |
| A web address | `![The till](https://example.com/till.png)` | Allowed on a served site. Not drawn offline, and not by `volvel dev`. |
| Anything else | `http:` | Refused. |

A file is a picture when its name ends `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif` or `.svg`. Pictures live in the repository, beside the pages, and reach the instance with a deploy. The console has no upload, so a page written there can only use a picture the repository already holds or an `https` address. The preview with drafts shows the deployed app's pictures, since a picture is not drafted in the console.

## A page that moves

| What moves it | What a reader of the old address gets |
| --- | --- |
| A rename or a move in the console, then a deploy | A permanent redirect (308) to the new address, for 90 days. |
| A rename or a move in the console, before the deploy | The old page. A preview with drafts makes no redirect. |

`key` and `moved_from` are written in the page's top:

| Field | What it does |
| --- | --- |
| `key` | The page's identity when it is not its path: the path it had, so that it stays the same page with its history. Say it only when you move a page. A copy made in the console takes none. |
| `moved_from` | The paths the page had, without `.md`, at most 20. A path is inside the site, as a link writes it: for the page `handbook/support/refunds`, in the site `handbook`, the page is `support/refunds`, and an old path is `support/returns`, not `handbook/support/returns`. A reader who follows an old address is taken here. It is written into the build's manifest, as `redirects`, and used when a site is exported as files. |

A live docs app answers an old address from the alias made by a deployed rename in the console. It does not read `moved_from`. The field is checked, and a bad one is an error:

- `moved_from_self`: it lists the page's own path.
- `moved_from_exists`: it lists a path that is still a page. A path that is still a page cannot lead somewhere else.
- `moved_from_duplicate`: two pages list the same old path. An old path leads to one page.

## Related

- [Move, rename or delete a page](../../../console/how-to/docs/move-rename-or-delete-a-page)
- [Keep documentation in the repository](../../how-to/docs/keep-documentation-in-the-repository)
