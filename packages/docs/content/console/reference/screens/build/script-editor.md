---
title: The script editor
topic: build-scripts-editor
description: "Every control, state and permission of the script editor: its header, Settings, code and test pane, and what makes it read only."
subjects: [scripts, editor]
moved_from:
  - build/script-editor
---

The script editor is where a script is written and tried. Saving makes a draft; nothing that runs changes until the draft is deployed. The same editor, with other settings and no test pane, writes [connectors and trigger sources](extension-editor).

The editor is reached from **New script** on the [Scripts list](scripts), from a script's **Open editor** or **Open the code**, and from a run's **Edit with this input**. The address is `scripts/new` or `scripts/edit/{path}`. F1 (**Help for this page**) opens the help topic `build-scripts-editor`.

::screenshot{name=console/script-editor alt="The script editor: the header with the Deployed pill and the Offer to an agent, Name and path, Remove, Save draft and Deploy buttons, the Settings disclosure, the code on the left and the test pane with its input form on the right."}

## The header

The title is the script's path, or "New script". Beside it are the state pills and the buttons.

| Pill | Meaning |
| --- | --- |
| **Not saved** | A new script that has no draft yet. |
| **Draft** | The script has a draft. |
| **Deployed** | The script is deployed and has no draft. |
| **From the repository** | The repository holds the script. |
| **Removing** | A draft removes the script. |
| **Unsaved changes** | What is on the screen is newer than what is saved. |

| Button | What it does | Shown |
| --- | --- | --- |
| **Offer to an agent…** | Opens the [offer dialog](../../../how-to/scripts/offer-a-script). | When the state is **Deployed** or **From the repository**. |
| **Name and path** | Opens "Name and path of {path}": the read-only **Key**, the **Path** and the **Title**. **Save as a draft** records a rename or a new title as a draft. | An existing script the editor can change. Not for repository code. |
| **Discard draft** / **Remove** | **Discard draft** asks "Discard this draft?": the script goes back to how it was last deployed, and one never deployed is gone. **Remove** asks "Remove this script?" and saves a draft that removes it. For repository code the button is the text "Managed in the repository: the script is removed there." | An existing script the editor can change. |
| **Save draft** | Saves the draft. Disabled while nothing has changed, except on a new script. | The editor can change the script. |
| **Deploy** | A menu: **This change only** deploys this script's draft alone; **Review all drafts** opens the release screen. In production the screen is called **Versions**. A deploy shows "Deployed {path} as version N." with **Promote to {workspace}** when the workspace promotes to another. A deploy the other drafts forbid says "{path} cannot be deployed alone" and offers **Review all drafts**. | Only for a saved draft with nothing unsaved. |

A script drafted for removal opens read only with "This script is removed in your drafts. Nothing changes until that draft is deployed. The code shown is what is deployed now. Keep this script to take the removal back." **Keep this script** asks "Keep this script?" and throws the removal away. It is never saved from here, so an autosave cannot undo a removal.

## A new script

A new script has a **Path** field and **Start from**.

| Control | What it does |
| --- | --- |
| **Path** | The script's name in the workspace: lowercase letters, digits, hyphens and underscores, in folders, such as `orders/sync`. It can be renamed later and stays the same resource. A path already in use is refused on the field: "Something already exists at this path…". |
| **Start from** | **Greet someone**, **Total some numbers** and **A job on a schedule**. Each fills in code and input that run as they are, with nothing to bind. Once the code has been changed, the others are off: "The code has been changed, so starting again from another is off." |

A new script waits for the first **Save draft**, so that a path half typed never becomes a draft. Until then a copy is kept in this browser, and the next time the editor opens on a new script it offers it: "A new script that was not saved is kept in this browser." with **Restore it** and **Discard**.

## Settings

The **Settings** disclosure holds everything the script runs with. It is open on a new script and closed on an existing one. The fields are listed in [Script settings](script-settings). The same disclosure holds **Use as a flow step** and the input schema.

## The code

The code editor has the SDK's types. It also knows `node:` modules, `process` and `Buffer`. If the code editor cannot load, a plain text box takes its place.

A script written in the console has a default export that runs, `export default async function (given, ctx)`, and may export `input` and `output` as zod schemas. It may import `@volvel/sdk` and `node:` modules only, and is at most 256 K characters. See [Scripts in code](../../../../develop/reference/scripts/define-script) for what a script may do. Saving refuses a script with no default export ("needs a default export. That is what runs.") and one that imports anything else: "Code written in the console may import only @volvel/sdk and node: modules, not "x". Put shared code and packages in the repository."

Types are not checked when the script is built; the **Problems** tab shows what the editor's own check finds as you type.

### Input and output schemas

When the code exports `input`, the editor reads its schema from the code. The **Settings** show "Input schema, read from your code" read only, with "From the input export in the code. Change it there, and save." While a worker reads it, the editor says "Reading the schema from your code…", and after 20 seconds "Your schema will be read from the code once a worker is available." A failed read says "The schema could not be read from the code: …". Without an `input` export the schema is "Input schema, as JSON Schema", a text box that takes JSON. Removing the `input` export keeps the last schema for you to edit.

A script's `input` and `output` are checked when it runs: defaults, coercion and transforms apply, and a mismatch fails the run with "The script's input does not match its schema" or "The script's output does not match its schema", then the reasons.

## The test pane

Beside the code (below it on a narrow window) is the test pane. See [Test a script before you deploy it](../../../how-to/scripts/test-a-script) for how to use it.

| Control | What it does |
| --- | --- |
| The input form | A form drawn from the input schema, with **Fields** and **JSON** beside it. It keeps the last input while the editor is open. |
| **Run the draft** / **Save and run** | Starts a test run of the draft on a worker, without deploying anything. It says **Save and run** when there are unsaved changes or the script is new, and saves first. The keys are :kbd[⌘↵] or :kbd[Ctrl+↵]. |
| **Build with all drafts** | Off: the test builds this script's draft and the drafts it names. On: every draft of the workspace, so a draft anywhere that does not build stops the test. |
| **Result** | The test run: its state and times, **Cancel run** (asks "Cancel this run?" with **Cancel run** and **Keep running**) while it goes, **Open full view**, a **Copy as curl** button, then **Why it failed** with the error and, when it points at a line of the script, **Go to line N**. Below: **Attempts**, then the tabs **Logs**, **Input and output** and **Details**, then **Events it published** ("None." when empty). Before the first test: "Run the draft to see what it returns, and its log, here." |
| **Problems** | What is wrong with the code. Each item is a line and column and the message; pressing it selects that place in the code. A refusal of the build carries the tag **Build**. The tab says **Problems (N)** when there are any, and "No problems found." when there are none. Only this script's own build errors are listed. |
| **Runs** | The latest 20 runs of the script, tests and real ones: **State**, **Started** and **Took**. A new script says "A script that is saved lists its runs here." |

The tab that was last open, in the pane and in the run, is kept for you across runs. The pane is not offered for repository code, and a read-only editor says "This script is not run from here. Run it from its page, or edit it in the dev workspace."

A test run is a run of the script with trigger `manual` and no deploy. Its runs and the build behind it are deleted after seven days.

## Saving

- **Autosave.** A draft saves itself 3 seconds after the last change. It applies to drafts and deployed scripts, not to a new script (that waits for **Save draft**), and a save that failed is not tried again until something changes.
- :kbd[⌘S] saves from anywhere on the page, including text typed a moment ago. Text typed while a save is on its way is saved after it.
- A draft keeps its last 30 versions.
- If someone else saved the draft after you opened it, a notice says so, with **Copy what I wrote** and **Load their version**, which asks "Load their version?" first.
- Leaving with unsaved changes asks "Your changes to {path} are not saved. Leave anyway?"
- A failed save shows the refusal above the code: the build error with its file and line, or the field that is wrong.

## When the editor is read only

| Case | What you see |
| --- | --- |
| A production workspace | "This is a production workspace. Code is changed in {dev workspace} and reaches production by promotion.", with **Edit it in {dev workspace}**. |
| Repository code | "This script is defined by the code in the tenant's repository, and is changed there." The source is shown read only. To replace it, make a new script at the same path: deployed, it takes the place with its history and what is bound to it. |
| A script of the platform (`core/…`) | "This step comes with the platform, and is added to the workspace because a flow uses it. It can be read here and not changed." |
| A script drafted for removal | The notice above. |

Saving a draft of a deployed script the console manages is allowed. Saving a draft of a repository script that has no source here "takes it over from the repository".

## Opened from a run

**Edit with this input**, or **Edit in {workspace}** from a production run, opens the editor with the run's input in the test pane: "The input of the run in {workspace} is in the test pane. You are editing the draft here; {workspace} runs version N." with **See what would change**. A value the run masked is left empty: "(masked when shown, enter again: …)".

## Permissions

| Action | Needs |
| --- | --- |
| Save a draft, rename, remove, discard | `resource:write` and `code:write` |
| Run a test | `run:write` and `code:write` |
| Deploy a draft that holds code | `code:write`, and the permission a deploy needs |
| Offer to an agent | `binding:write` |

A tenant can turn writing and testing code in the console off. Saving and testing are then refused with `console_code_off`: "Writing code in the console is turned off for this tenant. Code is deployed from its repository. Someone who may change the tenant can turn it on under Repository." Code deployed from a repository is not affected.

## Related

- [Scripts](scripts)
- [Script settings](script-settings)
- [Test a script before you deploy it](../../../how-to/scripts/test-a-script)
- [Test scripts in code](../../../../develop/how-to/scripts/test-scripts-in-code)
