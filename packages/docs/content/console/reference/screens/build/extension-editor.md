---
title: The extension editor
topic: build-extensions-editor
description: "Every field, control, state and limit of the editor for a connector or a trigger source."
subjects: [extensions, connectors]
moved_from:
  - build/extension-editor
---

The extension editor is where a connector or a trigger source is written in the console. One screen serves both kinds. It holds the code, a **Settings** section, and a list of **Problems** under the code. Saving makes a draft. Nothing that runs changes until the draft is deployed.

The editor has no test pane and no **Run** button for either kind. A trigger source is started by a webhook or a schedule, and a connector by a connection that uses it. To try one, deploy it and use it: see [Write a connector or a trigger source in the console](../../../how-to/extensions/write-an-extension).

It is reached from **Build**, **Extensions**, by pressing **New connector**, **New trigger source** or a row's path. The address is `/extensions/connector/new` or `/extensions/trigger_source/new` for a new one, and `/extensions/connector/edit/<path>` or `/extensions/trigger_source/edit/<path>` for one that exists. F1 (**Help for this page**) opens the help topic `build-extensions-editor`.

::screenshot{name=console/extensions-editor alt="The editor for a new connector: the title New connector with the pill Not saved and the Save draft button, the Path field, the Settings section with What it does and the connection schema, and the starter code with a Problems list under it."}

## Header and controls

The title is **New connector** or **New trigger source**, and after the first save the extension's path. Beside it are state pills and the buttons below.

| Control | What it does |
| --- | --- |
| **Path** | Only before the first save. The extension's name in the workspace: "Its name in this workspace. It can be renamed later, and stays the same resource." The placeholder is `connectors/shop` for a connector and `sources/payments` for a trigger source. A path is lowercase letters, digits, hyphens and underscores, in folders. |
| **Name and path** | After the first save. Opens a dialog titled "Name and path of" the path, with the **Key** (which never changes), a **Path** field and a **Title** field, and **Save as a draft**. The old path keeps answering for 90 days. Disabled with "Save the draft first." while there are unsaved changes, and for an extension from the repository. |
| **Discard draft** | For an extension that has a draft. Asks "Discard this draft?" and, on **Discard**, takes it back to what was last deployed. One never deployed is gone. |
| **Remove** | For a deployed extension with no draft. Asks "Remove this connector?" (or "trigger source") and, on **Remove**, saves a draft that removes it. Nothing changes until that draft is deployed. |
| **Save draft** | The primary button. Disabled when nothing changed, except on a new extension. |
| **Deploy** | A menu with **This change only** and **Review all drafts**. It appears when the extension has a draft with no unsaved changes. |

**This change only** checks what a deploy of this one extension would do. If it would be refused, a dialog titled "<path> cannot be deployed alone" lists each refusal, with **Review all drafts** and **Close**. If it goes ahead, a toast says "Deployed <path> as version N." and, when the workspace has a linked production workspace, offers **Promote to** that workspace. **Review all drafts** opens the release screen.

### Keys and saving

- :kbd[Ctrl+S] or :kbd[⌘S] saves the draft from anywhere on the page.
- A draft saves itself 3 seconds after the last change, once it has been saved or deployed. A new extension waits for its first **Save draft**, so a path half typed never becomes a draft. Until then a copy is kept in this browser; the editor offers "A new connector (path) that was not saved is kept in this browser." with **Restore it** and **Discard**.
- Leaving with unsaved changes asks "Your changes to <path> are not saved. Leave anyway?"
- :kbd[⌘↵] runs a script, not an extension.

## Settings

The **Settings** section is open when the editor opens. These fields are the same for both kinds.

| Field | What it holds |
| --- | --- |
| **What it does** | Optional text. Shown in the **What it does** column of the Extensions list. |

### A connector

| Field | What it holds |
| --- | --- |
| **What a connection is set up with, as JSON Schema** | The schema a connection's settings must fit. The form on the **Connections** screen is drawn from it: "The form for a connection of this kind is drawn from this. The secret is not part of it." A new connector starts with an object with a required text field `baseUrl`, titled **Address**, with format `uri`. Text that is not JSON is refused on save with "The schema is not valid JSON." An invalid JSON Schema is refused by the server. |

A connector has no timeout, `uses` or worker pool of its own. Below the schema: "A connection names this connector by its path. To try it, deploy it and set up a connection of this kind: Test on the connection runs the code's test export, or only builds its client when there is none."

### A trigger source

| Field | What it holds |
| --- | --- |
| **It is handed** | **Each request to a webhook** or **Each tick of a schedule**. "A webhook or a schedule names the source, and must be of the kind it takes." Changing it swaps the code for the starter of the other kind while the code is still an untouched starter. Once you have edited the code, it leaves the code alone. |
| **Give up after (seconds)** | 1 to 300. A new trigger source starts at 30. Server refusals of the value show under the field. |
| **Connections it uses** | Connections of the workspace. "A trigger source reaches only what it names here." |
| **Secrets it reads** | Secrets of the workspace, by name. |
| **Variables it reads** | Variables of the workspace. |
| **Worker pool** | **The default pool** or a pool of the tenant. "Where a run of this trigger source happens. Pick a pool only when it has to run in a particular place, such as inside a client's network. Test and failure alerts use it too." |

A trigger source has no memory limit, **Runs at once**, retries or tables of its own; those fields exist for scripts. Below the fields: "Nobody starts a trigger source by hand. To try it, deploy it and name it in a webhook or a schedule." The names a trigger source lists are checked when a version is deployed: a name that does not exist refuses the deploy.

## The code

The code is TypeScript in a code editor labeled "Source of <path>". A new extension starts from a starter: a connector with a default export that builds the client and an optional `test` export, a webhook source that refuses a request with no `x-example` header and otherwise lets its body through, or a poll source that returns no items and keeps its cursor.

| Limit | Value |
| --- | --- |
| What may be imported | `@volvel/sdk` and `node:` modules. Anything else fails the build with "Code written in the console may import only @volvel/sdk and node: modules, not "<name>". Put shared code and packages in the repository." |
| Size | 256 KiB of source. |
| Exports | A default export is required. A connector may also export `test`. |

Under the code, **Problems** (or **Problems (n)**) lists what the editor found and what a build refused. Each line gives `line:column` and the message, and pressing it moves the cursor to the place. A line from a build carries a **Build** tag. A build error is shown only after a deploy, a preview or a connection's **Test** has built the code; saving a draft raises none. The list says "No problems found." when it is empty.

## States

| State | What the editor shows |
| --- | --- |
| New | **Not saved**. The **Path** field and a starter. |
| Draft | **Draft**, and **Unsaved changes** while something is not saved. |
| Deployed | **Deployed**. Editing it and saving makes a draft. |
| From the repository | **From the repository**. The source is shown read-only, with the notice "This connector is defined by the code in the tenant's repository, and is changed there. It cannot be turned into one the console edits: its code leans on the rest of the repository's, and one written here stands alone. Its source is shown read-only. To replace it, make a new connector here at the same path: deployed, that takes its place, with its history and what is bound to it." (the kind's name is in it). A **File** list chooses which of the repository's files to read, and "Defined at line N" says where the extension starts. A bundle built without its TypeScript shows "The source is in the repository" and says to deploy it again with a newer CLI. |
| Removing | **Removing**. "This connector is removed in your drafts. Nothing changes until that draft is deployed. The code shown is what is deployed now. Keep this connector to take the removal back." The button is **Keep this connector**, which asks "Keep this connector?" |
| Production workspace | Read-only, with the notice that the extension is changed in the dev workspace and reaches production by promotion, and a link **Edit it in** the dev workspace. |
| Taken over | A repository extension whose definition carries its own source, which the editor opens editable: "Saving a draft of this connector takes it over from the repository." |
| Clash | "Someone else saved this connector after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." The notice offers **Copy what I wrote** and **Load their version**, which asks "Load their version?" (with "What you changed since you opened the connector is replaced by what they saved." and **Load theirs**) before it replaces what you changed. **Copy what I wrote** copies the code only. |
| Failed save | A red notice with the server's words. A path already used shows under **Path**: "Something already exists at this path. Choose another, or open that one." |

## Permissions

| Action | Needs |
| --- | --- |
| Open the editor | `resource:read`. |
| Save a draft | `resource:write` and `code:write`, in a dev workspace, with the tenant's switch **Code in the console** on. |
| Deploy | `deployment:write` and `code:write`. |

See the [permissions reference](../../../../administer/reference/permissions).

## Related

- [Extensions](extensions): the list this editor is opened from.
- [Connections](../configure/connections): where a connection of a connector is set up and tested.
- [What an extension is](../../../../develop/explanation/extensions/what-an-extension-is).
