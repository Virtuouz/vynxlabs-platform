---
title: Offer a script to an agent
description: Let one service account start one script and nothing else, and copy the address its AI agent connects to.
subjects: [scripts, agents]
---

## Offer a script to an agent

By the end a service account will be allowed to start one script, and you will have the address an agent connects to, where it is offered that script as a tool.

## Before you start

- A deployed script. **Offer to an agent…** is not drawn for a script that is only a draft, because a draft cannot be started.
- `binding:write` in the workspace, or on the script. A workspace admin has it. See the [permissions reference](../../../administer/reference/permissions).
- A service account. An agent connects as one, with one of its keys. If the tenant has none, the dialog says "An agent connects as a service account, with one of its keys. This tenant has none yet." and links to **Create a service account**. See [Service accounts](../../../administer/reference/screens/service-accounts).

## Offer it

:::steps
1. Open **Build**, then **Scripts**, and choose the script's row. Press **Offer to an agent…** in the inspector. In the editor the same button is in the header, for a script that is **Deployed**.
2. Read the dialog: "The account may run the script {path} and nothing else: it is given the Agent runner role here, at this script alone. An agent connecting with its key sees no other script, flow or run in the workspace."
3. Choose the **Service account**.
4. Press **Offer**. If that account already has the role on this script, the button says **Continue** instead, and the dialog says "It is offered to this account already. Continue to see where the agent connects."
5. The dialog says "{account} may now run the script {path}, and nothing else here. An agent connecting with one of its keys is offered it as a tool." Under **Address for the agent** is an address. Press **Copy the address**.
6. Press **Done**. To see or make the account's keys, follow **Keys and tools of {account}**.
:::

::screenshot{name=console/scripts-offer-done alt="The Offer to an agent dialog after a service account was chosen and Offer pressed: a confirmation, the address for the agent with a Copy the address button, and a link to the account's keys and tools."}

## The result

The service account holds the built-in role `agent_runner` on this one script. The role has `run:write` and `flow_run:write`, so it can start the script, and a flow if one is offered the same way, and nothing more. An agent that connects to the copied address with one of the account's keys is offered the script as a tool.

## If it does not work

- **Offer to an agent… is grayed out.** You lack `binding:write` on the script or the workspace. The inspector names the permission.
- **"This instance has no Agent runner role. Upgrade it first."** The instance lacks the built-in role. An operator must upgrade it.
- **There is no button.** The script is not deployed. Deploy it first: see [Test a script before you deploy it](test-a-script).
- The offer gives an agent one script. It does not give a person access, and a key cannot reach anything else in the workspace.
