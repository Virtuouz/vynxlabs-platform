---
title: Why a deploy or promotion is refused
description: "Each code a deploy, a promotion, a draft save or a Git sync can refuse with, the words it carries, what it names and what to do."
subjects: [deploy, promotion, git-sync]
---

A deploy, a promotion, a draft save and a Git sync check what they would do before they do it. When one cannot go ahead, the API answers with a status and a code, and the console shows the code's words and a list of what it names. This page lists each code the release screens and the command line can meet.

A refused deploy or promotion changes nothing. The console's preview (the panel **Deploy to this dev workspace**, the step **Promote**) finds a refusal by carrying the deploy out and taking it all back, so what it shows is what the deploy would answer.

Every code here is a `409`, except `console_code_off`, which is a `403`. A code that names things gives each as a path and a sentence. The console writes a path such as `/connections/x` as a link **Set up** where the thing can be set up.

## Deploy and promotion

| Code | The words | What it names | What to do |
| --- | --- | --- | --- |
| `incompatible_bundle` | "This bundle needs a core from *a* up to, not including, *b*. This instance runs *v*. Upgrade the instance, or rebuild the bundle with the SDK that matches it." Or: "This bundle was built for a core from *a*, which this instance no longer runs: it runs *v* and supports bundles built for 0.2.0 or later. Rebuild the bundle with a current SDK." | Nothing | Rebuild the bundle with the SDK that matches the instance, or upgrade the instance. The oldest core still run is `0.2.0`. |
| `kind_changed` | "*path* has the key "*key*", which is the key of the *kind* at *other path*. A resource cannot change kind: give this one a key of its own." | Nothing | Give the new resource a key of its own. A key stays with one kind. |
| `rename_suspected` | "This deploy would delete something that holds history or data, and create something of the same kind. If it was renamed, deploying this cuts the new one off from what the old one holds: give the new one the old one's key. To delete it anyway, deploy again allowing each path by name." | Each path that would be deleted, with what it holds ("runs", "access given to it", "rows") and what is created | If it was a rename, give the new resource the old one's key (in a resource file, a first line `key: <the old key>`) and deploy again. If it was not, allow the path: **Delete them anyway** in the console, `--allow-delete <path>` on the command line. |
| `path_taken` | "*path* (*kind*) cannot be deployed: that is the path of the *kind* with the key "*key*", which this deploy does not move or remove. Rename or remove that one, or give this one that key if it is the same resource." | Nothing | Rename or remove the resource in the way, or give this one its key. |
| `breaking_changes` | "Promoting this changes a name that something outside calls. Read each one, then promote again confirming them." | Each change, as a sentence: "the tool *name* is removed with its *kind*. An agent that calls it will fail." | Read each. Promote again confirming them: the console asks, `volvel promote --confirm-breaking` on the command line. Only a promotion to a production workspace asks. |
| `bindings_missing` | "The workspace is missing something this bundle needs. Set up each one, then promote again." (or "deploy again") | `/connections/x`: "the connection "x" is not bound in this workspace"; `/secrets/x`: "the secret "x" is not set in this workspace"; `/variables/x`: "the variable "x" has no value in this workspace and no default"; `/sources/x`: "the data source "x" is not bound in this workspace" | Set up each one in the target workspace, then promote or deploy again. A dev workspace does not refuse a deploy for this: it deploys and warns "Not bound here, and the deploy still works". A promotion, and a deploy to production, refuse. |
| `bindings_invalid` | "Something bound in this workspace does not fit the connector this bundle gives it. Bind it again, then promote again." | Each binding that does not fit | Bind it again in the target workspace. |
| `nothing_to_deploy` | "There are no drafts to deploy." | Nothing | Save a draft first. |

What a bundle needs is found from the scripts, trigger sources, webhook signatures and flow steps it holds: the connections, secrets, variables and data sources they name.

## Drafts and production

| Code | The words | What to do |
| --- | --- | --- |
| `production_workspace` | "Resources are edited in a dev workspace and reach production by promotion." Or: "A code-managed resource is kept in the repository and changes in production by a deploy." Or, for a branch: "Only a dev workspace follows a branch. Production changes by promotion, or by a deploy from the default branch." | Make the change in a dev workspace and promote it. A person who holds `promotion:write` may change a console-made resource in production directly. A resource defined in code changes there by a deploy only. |
| `draft_changed` | "Someone else saved this draft after you opened it. Reload it, then make your change again." (a page of documentation says "this page"; "This draft was discarded or deployed after you opened it. Reload it, then make your change again." when the draft is gone) | Reload the editor and make the change again. A draft belongs to the workspace, not to one person. |
| `console_code_off` | "Writing code in the console is turned off for this tenant. Code is deployed from its repository. Someone who may change the tenant can turn it on under Repository." (`403`) | Turn it on under **Repository**, or deploy the code from the repository. See [the Repository page](../../../administer/reference/screens/repository). |

A draft save also answers `path_taken` ("*path* is the path of a *kind*. Choose another path, or open that one.") when you create a resource at a path that holds a draft or a deployed resource, and when you rename one to a path that is taken.

## Git sync

| Code | The words | What to do |
| --- | --- | --- |
| `no_branch` | "This workspace does not follow a branch yet. Choose one under Git sync." | Choose a branch under **Git sync**. |
| `git_busy` | "Another push or pull of this workspace is in progress. Try again in a moment." A push or pull holds the workspace for 120 seconds at most. | Wait and try again. |
| `git_paused` | "Sync is paused for this tenant. It was imported from another instance: check the repository's settings, then turn sync on." | Save the repository's settings to turn sync on. |
| `no_repository` | "Connect the tenant's repository first." or "This tenant has no repository connected." | Connect it on the **Repository** page. |
| `repository_unreachable` | The reason, such as "The repository refused the access token. Check that it is still valid." | See the [Repository page](../../../administer/reference/screens/repository). |

A push or pull that the repository answers without a failure ends as one of four outcomes: `done`, `nothing` (nothing to write), `refused` (a file changed on the branch since the last sync: pull first) and `failed`. A pull that stops at a suspected rename lists the paths as `suspected` and asks again with `allowDelete`.

## In the console and on the command line

| Where | Refusal | How it shows |
| --- | --- | --- |
| **Deploy** | Any of the deploy codes | The panel **These changes cannot be deployed yet.** with the reason and the list. |
| **Promote** | Any of the promotion codes | The notice **It cannot be promoted yet.** with the reason and the list. |
| **Versions** | `rename_suspected` when deploying a version | The question "Delete *paths* in *workspace*?". |
| **Git sync** | `rename_suspected` in a pull | **Delete them anyway**. |
| `volvel deploy`, `volvel promote` | The same codes | `--preview` shows them without deploying. `volvel promote --preview` exits with 4 when production would refuse for breaking changes. |

## Related

- [Deploy and Versions](../../../console/reference/screens/operate/releases)
- [How a change gets from a draft to production](../../../console/explanation/releases/how-changes-move)
