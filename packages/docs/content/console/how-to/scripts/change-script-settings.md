---
title: Change a script's settings
description: Change a script's limits, what it uses and what it does when it fails, save the change as a draft and deploy it.
subjects: [scripts, settings]
---

## Change a script's settings

By the end a script will run with the limits and the access you chose, in a deployed version.

## Before you start

- You are in a dev workspace. Settings change there and reach production by promotion.
- The script is managed in the console. A script the repository holds is changed in its `defineScript`: see [Scripts in code](../../../develop/reference/scripts/define-script).
- `resource:write` and `code:write`. A workspace admin has them. See the [permissions reference](../../../administer/reference/permissions).

## Change them

:::steps
1. Open **Build**, then **Scripts**, and open the script. Choose the **Settings** tab. It lists what the script sets.
2. Press **Change the settings**. The fields of the editor's settings open.
3. Change what you need. For example, set **Give up after (seconds)** to `90` and **Try again (times)** to `2`. Choose **Connections it uses**, **Secrets it reads**, **Variables it reads** and **Tables it reads and writes** from the lists the workspace offers. Every field is explained in [Script settings](../../reference/screens/build/script-settings).
4. Press **Save as a draft**. The tab says "Saved as a draft. It runs this way once it is deployed." and lists the draft's new settings.
5. Press **Open the draft**. The editor opens on the draft.
6. Press **Deploy**, then **This change only**. The console says "Deployed {path} as version N."
:::

To change a field the page's form does not have, **What it does**, **Use as a flow step** or the input schema, change it in the editor's **Settings** and press **Save draft**. A draft autosaves 3 seconds after the last change.

## The result

The script's inspector in the list shows the new **Timeout** and **Retries**, and the **Settings** tab lists the new values. A run that started before the deploy keeps the version it started on. The next run uses the new settings.

## If it does not work

- **A field is refused.** The message is under the field: a number outside its range, or a **One lane for each value of** key that is not `input.` followed by field names.
- **"{path} cannot be deployed alone."** The deploy cannot go ahead on its own: the console says why and lists what to set up. Press **Review all drafts** and read the list.
- **Change the settings is not offered.** The workspace is production, or the repository holds the script. The tab says which: "Settings change in a dev workspace and reach production by promotion." or "The repository holds this script: change its settings there." A script the repository holds has its settings in `defineScript`: see [Scripts in code](../../../develop/reference/scripts/define-script).
- **Change the settings is grayed out.** You lack `resource:write`.
- **"One lane for each value of" is disabled.** Set **Runs at once** first.
