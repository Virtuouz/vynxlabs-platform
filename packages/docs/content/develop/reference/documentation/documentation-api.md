---
title: The documentation API
description: "The routes that list a workspace's pages, read one, search them, and answer its glossary: what each needs, takes and returns."
subjects: [documentation, search, repository]
---

Four routes serve the documentation of a workspace. The first three are the ones the console's Documentation screen reads. Every route is under `/api/v1`. The whole API, with its other tags, is in [The API](../api/index).

| Route | What it answers | Needs |
| --- | --- | --- |
| `GET /tenants/:t/workspaces/:w/docs` | The pages and the docs apps of a workspace. | `resource:read` in the workspace, or `doc:read` alone |
| `GET /tenants/:t/workspaces/:w/docs/page/*` | One page, as it is being written. | `resource:read` in the workspace, or `doc:read` alone |
| `GET /tenants/:t/workspaces/:w/docs/search?q=` | A search over the workspace's pages. | `resource:read` in the workspace, or `doc:read` alone |
| `GET /tenants/:t/workspaces/:w/terms` | The glossary and the descriptions of resources, for this caller. | Answers as the caller may read; a caller who may read nothing is given empty lists |

Pages and apps are written with the draft routes, as any resource is: a page is the kind `doc`, with `body: { source }`.

## The list: `/docs`

The answer is as whoever writes sees the workspace: a draft is laid over the page it changes, and a page that is only a draft is listed with the rest.

| Field | What it holds |
| --- | --- |
| `apps` | One entry for each docs app: `path`, `key` (the app's key, which a rename keeps), `title`, `docs` (the folder it serves), `feedback` (the table, or null), `published`, `body`, `deployed`, `drafted`, `url`, `preview` (the same address followed by `_draft/`). |
| `pages` | One entry for each page: `path`, `title`, `description`, `pages`, `topic`, `app`, `url`, `state` (`deployed`, `changed`, `new` or `removed`), `file` (the repository file, or null), `headings`, `terms`, `source` and `revision` (the draft's, to send back with a save; null without a draft). |
| `issues` | Pages that take a term or a topic the product's own help has: `app`, `path`, `code`, `message`. A deploy refuses them, and one deployed before the product took the name loses it silently. |
| `tables` | The workspace's tables as its writers see them. To someone who may read only the documentation, the tables its apps name and `docs-feedback`. |

## One page: `/docs/page/<path>`

Answers `page` (as above), `source` (the draft when there is one, and what is deployed otherwise), `revision` and `deployedSource` (what is deployed, when a draft is over it). A path that is not a page is 404, "The page at <path> was not found."

To save the page, send `PUT` of the draft with the `revision` you were given: a save that names an older one is refused with 409 `draft_changed`, "Someone else saved this draft after you opened it. Reload it, then make your change again." A new page says `create: true`, and a path that is taken is 409 `path_taken`.

## Search: `/docs/search?q=`

`q` is at most 200 characters; a longer one is a 400. The answer is up to 20 `items`, each `path` (under the workspace's pages, with the app's folder first), `app`, `title`, `description` and `excerpt`. Each docs app is searched and gives up to 10, over the pages the caller may read, and no index of pages is handed to a browser. Words must all match, a word matches the start of a longer one, and a small spelling slip still matches. No screen of the console calls this route.

```bash
curl -s "$URL/api/v1/tenants/$TENANT/workspaces/$WORKSPACE/docs/search?q=booking" \
  -H "Authorization: Bearer $KEY"
```

## The glossary: `/terms`

Answers `terms`, `resources`, `extensions`, `attachments` and `topics`:

| Field | What it holds |
| --- | --- |
| `terms` | The terms the workspace's pages define, each with the page that defines it. |
| `resources` | The descriptions of its tables, columns, scripts, flows, apps, connections and queries, each given only to a caller who may use the thing. |
| `extensions` | The workspace's own notes on the product's help, by topic. |
| `attachments` | The pages that say they document a resource. |
| `topics` | The topics of the workspace's pages. |

A term and a page attached to a resource or a topic is given to whoever may open the docs app the page is in. An app may call it for someone who is not signed in, who then gets only what is open to anyone. It is rate-limited for guests.

## Related

- [The API](../api/index)
- [Keep documentation in the repository](../../how-to/docs/keep-documentation-in-the-repository)
- [How a docs app works](../../../console/explanation/docs/how-a-docs-app-works)
