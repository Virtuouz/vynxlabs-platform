---
title: Git sync
topic: operate-git
description: "Every control, state and permission of the screen that keeps a dev workspace and a branch of the tenant's repository the same, and of a production workspace's release branch."
subjects: [git-sync, repository]
moved_from:
  - operate/git-sync
---

**Git sync** sets a dev workspace beside the branch of the tenant's repository that it follows. A **push** commits what is deployed in the workspace to the branch. A **pull** deploys what was changed on the branch. Push and pull are on this screen and nowhere else.

A production workspace follows no branch, because it changes by promotion. Its Git sync shows the release branch that each promotion is committed to.

The screen is reached from **Operate**, then **Git sync**. F1 (**Help for this page**) opens the help topic `operate-git`. The repository itself is connected on the tenant's [Repository](../../../../administer/reference/screens/repository) page.

::screenshot{name=console/git-sync alt="Git sync for a dev workspace that follows a branch: the two cards for this workspace and the branch, the commit message, the Push and Pull buttons, and the list of files that differ."}

Git sync moves resource files: each resource that the console owns is a file, kept where the repository keeps it, and new ones go in the repository's folder for them. Sync never builds code: a resource defined in the repository's TypeScript changes in a workspace by a deploy, and the `entry` key of `volvel.yaml` is for the command line only. A pull needs `code:write` because it can bring code from the repository into what workers run. Nothing runs on a schedule or on a webhook: a push, a pull and the release commit happen when someone asks for them, or after a promotion.

## A dev workspace

### States of the screen

| State | What you see |
| --- | --- |
| No repository | "No repository is connected" and "Connect the tenant's repository below, then choose a branch for this workspace." A panel **Repository** says what is missing and links to **Connect the tenant's repository**. |
| A repository and no branch | "This workspace follows no branch yet" and "Choose a branch below for this workspace to follow." A panel **Repository** says "Choose the branch this workspace keeps its console-written resources on. It is created from *default branch* by the first push." with the field **Branch** (for example `console/dev`) and **Follow this branch**. |
| Following a branch | The line **Follows *branch***, the two cards, the commit message, the buttons and the lists below. |
| Sync is paused | A notice "Sync is paused for this tenant. Save its repository settings to turn it on." Push, pull and **Push with drafts** are disabled. A tenant imported from another instance starts this way. |
| Not loaded | The error state of the request, with a retry. |

A workspace cannot follow the default branch: "A workspace cannot follow the default branch. Changes reach it by a pull request." The first push creates the branch from the default branch.

### Controls

| Control | What it does |
| --- | --- |
| **Follow this branch** | Makes the workspace follow the branch you typed. The message says "This workspace now syncs with *branch*." |
| **Change branch** | Asks "Follow another branch?" with the field **Branch** and the action **Follow it**: "This workspace follows *branch*. It will compare against the branch you name instead, as if it had never synced: files that differ show as changes on one side or both. Nothing on either branch is changed." |
| **Stop following** | Asks "Stop following this branch?": "This workspace stops syncing with *branch*. The branch and what is on it stay as they are, and the workspace can follow it again." |
| The card **This workspace** | "N changed here": the files of resources that changed in the workspace since the two last agreed. "Last agreed … ago at *commit*" gives when and the commit. |
| The card of the branch | The branch name, "N changed there", and its head commit with its message, author and time. If the branch does not exist: "The branch does not exist yet: the first push makes it." |
| **Commit message** | Up to 500 characters; the default is "Deploy from the console". Used by **Push** and **Push with drafts**. |
| **Push N change(s)** | Commits what is deployed here to the branch, in one commit authored by you. Disabled when nothing changed here, when a file changed on both sides, and when sync is paused. A resource made here that was not on the branch when a pull ran stays under **New here** and is counted in N after the pull. |
| **Pull N change(s)** | Deploys what changed on the branch. Disabled when nothing changed there, while a conflict has no choice for each file, and when sync is paused. |
| **Push with drafts** | Commits what is deployed and what is drafted, for a developer to pick up. The default message is "Drafts from the console". After it the screen says: "A plain push leaves these files on the branch while their drafts are saved." The drafted files are not listed under **Files that differ** and are not counted for **Push**. Disabled when a file changed on both sides. |
| **Delete them anyway** | Shown after a pull stopped at a deletion it took for a rename. Asks "Delete *paths* in this workspace?" and, on **Delete them and look again**, pulls again allowing those paths. |

After a push or a pull the screen says what happened: "Committed what is deployed here to the branch.", "Deployed what changed on the branch.", "Already the same: nothing to write.", or the reason it was refused or failed. A push the branch refused says "Nothing was written: the branch changed. Pull first." That happens when a resource file changed on the branch after the screen last compared, so a push from a screen that was open before a developer's commit is refused. A file that is not a resource (a README) changing on the branch does not refuse it: the push goes on top.

A pull makes a version of the workspace whose message is "Pulled *commit* from *branch*" (*commit* is the first seven characters), shown in [Versions](releases).

A pull takes at most 2000 files and 8 MB. A push and a pull take a lease on the workspace for at most 120 seconds, so that two cannot run together: the second is refused with `git_busy`.

### Changed on both sides

When files changed on both sides, the section **Changed on both sides: choose for each** shows each resource, with its files side by side: **In this workspace** and **On the branch**. Choose for each resource:

| Control | What it does |
| --- | --- |
| **Keep workspace** | Keeps the workspace's version. It writes nothing to Git until the next push. |
| **Take branch** | Takes the branch's version on the next pull. |
| **Undo** | Takes the choice back. |

The chosen side is tagged **Kept**: after **Take branch** it is the branch's side that carries the tag. A file that was removed on one side shows "(removed)". A pull needs a choice for every resource.

When `volvel.yaml` moves the resources folder after the last sync, a file that is in the old folder at the last sync and in the new one now is read as moved: a file edited here shows as **Changed here**, not as changed on both sides.

### Files that differ

When nothing is in conflict, **Files that differ** lists each file with a tag: **New here**, **Removed here**, **New there**, **Removed there**, **Changed here** or **Changed there**. A line under it explains **New here**: "a resource made in the console since the last sync, or one the repository's code defined that a draft took over. Code is not synced, so until then it had no file. A push adds the file to the branch; remove its definition from the code there, or a deploy from the repository takes it back." The row **Repository** gives the repository's address.

### History

**History** lists the last 50 pushes and pulls of this workspace, newest first: the kind (**Push**, **Pull** or **Release**, for the commit to a release branch after a promotion), the outcome tag (`done`, `nothing`, `refused`, `failed`), the commit's first seven characters, the message and when. Empty: "Nothing has been pushed or pulled here yet."

### Branches

**Branches** lists each workspace of the tenant: its name, its branch, a tag **Follows** (a dev workspace) or **Release** (a production workspace), its state, and the last error in red. A workspace with no branch says "Follows none", or "No release branch" for a production workspace.

A workspace's state is `never` (followed, never synced), `synced`, `ahead`, `behind`, `conflict` or `error`. It is the state the last push, pull or deploy left, not a fresh comparison: a deploy makes it `ahead`, a push the branch refused `behind`, a pull that stopped at a conflict `conflict`, a failed push or pull `error`, and a developer's commit on the branch changes nothing here until the screen compares or someone pushes or pulls. The side panel shows the same state beside **Git sync**.

## A production workspace

The page says "A production workspace changes by promotion, so it follows no branch. After each promotion, what it runs is committed to its release branch." It has no **Follow this branch**.

| State | What you see |
| --- | --- |
| No repository | "No repository is connected" with the link **Connect the tenant's repository**. |
| The repository has no release branch | "The repository has no release branch": "Without one, nothing is committed after a promotion. A release branch is set on the tenant's repository." |
| A release branch | The card **Release branch** with the branch as `release/<workspace slug>` (the repository's release branch, a slash, the workspace's slug), and the last result: "failed … ago: *reason*", "nothing to write, … ago", "done … ago at *commit*", or "Nothing has been committed to it yet." |
| Sync is paused | The same notice as for a dev workspace. The button is disabled. |
| The last commit failed | A notice "The last promotion is live, but its commit did not reach the release branch. Commit it again below." |

**Commit to the release branch again** commits what the workspace runs now. It says "Committed what runs here to *branch*.", "*Branch* already has what runs here: nothing to write.", "It did not reach *branch*: *reason*", or "Sync is paused, or the repository has no release branch, so nothing was written." **History** and **Branches** are shown as for a dev workspace.

## Permissions

| Action | Needs |
| --- | --- |
| See the screen, its history and the branches | `git:read` |
| **Follow this branch**, **Change branch**, **Stop following**, **Push**, **Push with drafts** | `git:write` |
| **Pull**, **Delete them anyway** | `deployment:write`, and `code:write` |
| **Commit to the release branch again** | `promotion:write` in the production workspace |

## Related

- [Sync a workspace with Git](../../../how-to/releases/sync-a-workspace-with-git)
- [Repository](../../../../administer/reference/screens/repository)
- [How a change gets from a draft to production](../../../explanation/releases/how-changes-move)
