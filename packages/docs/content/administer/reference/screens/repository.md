---
title: Repository
topic: tenant-repository
description: "Every field, button, state and permission of the page that connects a tenant's Git repository, the folder in force and volvel.yaml, and the switch for writing code in the console."
subjects: [repository, git-sync]
moved_from:
  - tenant/repository
---

The **Repository** page connects the tenant to a Git repository. Dev workspaces keep their resources in it as files, on a branch each. Production workspaces commit what they run to a release branch after each promotion. A tenant has one repository.

The page also holds the switch **Code in the console**, which decides whether people may write code in the console at all.

The page is under **Tenant**, **Repository**. F1 (**Help for this page**) opens the help topic `tenant-repository`.

::screenshot{name=administer/repository alt="The Repository page with its form: Address, Default branch, Folder, User name, Release branch, Access branch and Access token, and below it the Code in the console switch."}

Nothing in the repository is touched except what Volvel writes: the resource files of a workspace's branch, the release branches, and the access branch's `tenant/` files. The default branch is never written to: changes reach it by a pull request.

There is no webhook from the repository and no scheduled sync. Push and pull happen when someone asks for them in [Git sync](../../../console/reference/screens/operate/git-sync), and the release commit happens after a promotion. An instance reaches a repository on an internal host only if the operator has allowed it; ask the operator.

## Fields

| Field | What it takes |
| --- | --- |
| **Address** | The repository's HTTPS address, with no user name or token in it, for example `https://github.com/acme/platform.git`. An `http://` address is accepted only for `127.0.0.1` or `localhost` (with or without a port), for a repository on the same machine. At most 500 characters. If you change it to another host and leave the token empty, the hint says: "This is another host than the stored token was given for. Enter the access token again." |
| **Default branch** | The branch each workspace's branch starts from. Default `main`. "Never written to. Changes reach it by a pull request." The repository must have it. |
| **Folder** | Where resources made in the console are written. Default `platform`. A path inside the repository: letters, digits, dots, dashes and underscores, with `/` between names; no `..`. See the folder in force below. |
| **User name** | Sent with the token. The default is `x-access-token`; most hosts accept it. Bitbucket and some GitLab tokens need their own. It is not shown again, and it is kept when you leave the field empty. |
| **Release branch** | Each promotion to a production workspace commits what it runs to `<release branch>/<workspace slug>`. A new connection starts with `release`. Empty: off. |
| **Access branch** | Each access change is committed here, under `tenant/`, for a developer to merge. Never the default branch. Empty: off. |
| **Access token** | A token that can read and write the repository's contents: a fine-grained personal access token on GitHub, a project access token on GitLab. It is stored encrypted and never shown again. Required to connect. When one is stored, the field says "Stored · set *when* by *who*", with **Replace** and "Stored encrypted. It is never shown." |

A branch name is the name git accepts: letters, digits, `.`, `_`, `-` and `/`, at most 200 characters (150 for the release and access branches), no `..`, no `//`, and not ending in `/`, `.` or `.lock`.

### The folder in force, and volvel.yaml

A file at the repository's root, `volvel.yaml`, can say where the resource files are. When it names `resources`, that folder is the one Volvel uses, and it wins over the **Folder** field. This is the folder in force.

| State of the **Folder** field | What you see |
| --- | --- |
| `volvel.yaml` names `resources` | The field is read only and shows that folder. The hint says: "Set in volvel.yaml (resources). Change it there. Sync never builds code, so entry in that file is for the command line only." |
| The file has not been read yet | The field is editable. The hint says: "Where resources made in the console are written. volvel.yaml has not been read yet: a resources folder named there wins after the next sync or check." |
| The file names no `resources` | The field is editable. The hint says: "Where resources made in the console are written. A resources folder named in volvel.yaml wins over this." |

Push, pull, the comparison, the release branch and the folders of documentation pages all use the folder in force. Each reads the file from the branch it works on: a workspace's push and pull read it from that workspace's branch, a release commit from the release branch (from the default branch while the release branch does not exist yet), and **Check the connection** from the default branch. This page shows what the last read found, so a check of a default branch that has no `volvel.yaml` makes the field editable again. A release branch is a mirror of what production runs, and its files go under the folder that file names, or under **Folder** when the release branch holds no `volvel.yaml`. Changing the address or the default branch forgets what the file said until it is read again.

A `resources` that is not a folder inside the repository, or climbs out of it with `..`, stops a pull and a push, with the message: "volvel.yaml: resources is "…", which is not a folder inside the repository. Name one, such as platform, or take resources out of the file to use the folder on the Repository page." There is no fallback to the **Folder** field.

`volvel.yaml` has five keys and no others. Any other key is an error.

| Key | Takes | What it does |
| --- | --- | --- |
| `roots` | A list of folders | Folders whose inside gives a resource its path: under `src`, the file `src/lending/items.table.yaml` is the table `lending/items`. The folder the console writes to is always one. |
| `ignore` | A list of folders | Folders to leave unread, besides `node_modules`, `dist`, `build` and any folder whose name starts with a dot. |
| `docs` | A list of folders | Folders of documentation pages: under `handbook`, the file `handbook/support/refunds.md` is the page `support/refunds`. When none is named, the folder of pages is `docs` inside the folder the console writes to. |
| `entry` | One path | The file that exports every resource defined in code. Left out: `src/index.ts`. For the command line only: sync never builds code. A flag of the command wins. |
| `resources` | One path | The folder the console writes its resources to. Left out: `platform`. A flag of the command wins. |

A pull takes at most 2000 resource files and 8 MB. When a branch holds more, the pull says so and tells you to leave out what is not the workspace's with `ignore:` in `volvel.yaml`.

## Buttons

| Button | What it does |
| --- | --- |
| **Connect** (**Save** once connected) | Reaches the repository with the token before saving anything. While it works the button says "Reaching the repository…". When it works: "Connected. The repository was reached with the token." Saving turns a paused sync back on. |
| **Check the connection** | Reaches the repository again with the stored token. It says "The repository was reached with the stored token just now." or the reason it could not. |
| **Disconnect** | Asks "Disconnect the repository?": "Workspaces stop following their branches. Nothing in the repository is changed." Each workspace's branch link is removed. |

Under the form, "The stored token last reached the repository … ago." tells when a connect or a check last worked.

### What a refused connection says

| Message | When |
| --- | --- |
| "The repository's address must start with https:// and carry no user name or token." | The address is not an HTTPS address (or an http one at `127.0.0.1` or `localhost`), or has a user name in it. |
| "An access token is needed to connect a repository." | A first connection with no token. |
| "The address is at another host than the one the stored token was given for. Enter the access token again." | The host changed and no token was typed. |
| "The folder is a path inside the repository, such as platform." | The folder is not one. |
| "The branch for the tenant's access is not a branch name git accepts." and "The release branch is not a branch name git accepts." | A bad branch name. |
| "The repository refused the access token. Check that it is still valid." | The host answered 401. |
| "The access token may not do that. It needs to read and write the repository's contents." | The host answered 403. |
| "The repository was not found at that address, or the access token cannot see it." | The host answered 404. |
| "The repository is empty. Make a first commit on *branch* there (a README will do), then try again: each workspace's branch starts from it." | The repository has no commits. |
| "The repository has no branch called *branch*. It has *names*: give one of them as the default branch." | The default branch is not there. |
| "The repository could not be reached: *reason*" | Anything else, such as a host that does not answer. |

A refused connection saves nothing and changes nothing.

## States

| State | What you see |
| --- | --- |
| Not connected | The form with **Connect**. |
| Connected | The form with **Save**, **Check the connection** and **Disconnect**, and the fields filled. |
| Sync paused | A notice "Sync is paused. This tenant was imported from another instance, which may still push to the same branches. Check the details below and save to turn sync on." Git sync's push, pull and release commit do nothing until then. |
| Not loaded | The error state of the request, with a retry. |
| Without `git:write` | A line says "You can see the repository this tenant is kept in, not change it. It needs `git:write`." and adds who to ask. The form is shown with its fields disabled. |

## Code in the console

The section **Code in the console** says "Writing code in the console is on." or "… is off." and has one button.

| State | What it says | Button |
| --- | --- | --- |
| On | "People with the code permission can write scripts, connectors and trigger sources in a dev workspace." | **Turn off code in the console** |
| Off | "Code is deployed from the repository only. What is deployed keeps running." | **Turn on code in the console** |

The button asks first. Turning off: "Turn off code in the console for *tenant*?": "People can no longer save or test scripts, connectors and trigger sources in the console, in any workspace of this tenant. Drafts are kept, and what is deployed keeps running. A tenant admin or an operator can turn it on again." Turning on: "Turn on code in the console for *tenant*?": "People with the code permission can write and test code in the console again." The result says "Code in the console is on for *tenant*." or "… is off …". The change is written to the audit log.

With it off, saving or testing a script, a connector or a trigger source in the console is refused with `console_code_off`. Code that is deployed from the repository is not affected. The same button is on the tenant's overview and in the Tenants inspector. A person who may not change the tenant sees "Changing it needs permission to change the tenant." The command line has no switch for it.

## Permissions

| Action | Needs |
| --- | --- |
| See the repository (never the token) | `git:read` |
| **Connect**, **Save**, **Check the connection**, **Disconnect** | `git:write` |
| **Turn on code in the console**, **Turn off code in the console** | `tenant:write` |

A tenant admin holds both. See the [permissions reference](../permissions).

## Related

- [Git sync](../../../console/reference/screens/operate/git-sync)
- [Connect the tenant's repository](../../how-to/releases/connect-the-repository)
- [How a change gets from a draft to production](../../../console/explanation/releases/how-changes-move)
