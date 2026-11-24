---
title: Give an agent a tool
description: Make a service account, offer it one of Fernhill's scripts, make it a key, try the tool in the console and call it as an agent would over MCP, then see that a script you did not offer is not there.
subjects: [agents, access, scripts]
---

You will have a service account that an agent can sign in as, one script offered to it as a tool, and a call to that tool from the console and from a command line. You will also see the error for a tool that was not offered. It takes about 30 minutes.

## Before you start

- You can sign in to the console as Maya Brooks, `maya.brooks@fernhill.example`, a tenant admin of Fernhill. The seeded password is `fernhill-demo-2026`. Making a service account, a key and an offer are tenant admin acts.
- Fernhill is set up, with its Sandbox workspace and the deployed script `agent/clinic-day`. See [Set up the Fernhill example](../../start/how-to/example/set-up-the-fernhill-example).
- A terminal with `curl` and `python3` on the machine where you work, on the same network as the instance. The command lines write the instance as `http://localhost:8091`: use your own address.
- A browser at least as wide as a laptop screen.

:::steps
1. **Make a service account.** Sign in as Maya. In the narrow bar on the left press **Tenant**, then choose **Service accounts**. Press **Create service account**. In **Name** type `tut-agent`. In **What it is for** type `An agent for the tutorial.` Press **Create service account**. The account opens on **Keys** with "No keys yet". Its tabs are **Identity**, **Keys**, **Access** and **Agent tools**.

2. **See what it may do.** Choose **Access**. It says "WHAT GIVES THEM ACCESS" "Nothing: they hold no permission in this tenant." Choose **Agent tools**. Under **In the workspace** choose **Sandbox (dev)**. The page shows **Address for the agent**, a button **Copy the address**, **Copy the settings** with a JSON for an agent's settings, and the notice "An agent would be refused here: the account has no place in this workspace. Offer it a script or flow from that script's or flow's page, or give it a role here under Access." Under it the page says "No tools".

3. **Offer a script.** Press **Build**, then **Scripts**, and open `agent/clinic-day`. Press **Open the code**. At the top press **Offer to an agent…**. The dialog says "The account may run the script agent/clinic-day and nothing else: it is given the Agent runner role here, at this script alone. An agent connecting with its key sees no other script, flow or run in the workspace." In **Service account** choose `tut-agent` and press **Offer**. The dialog now says "tut-agent may now run the script agent/clinic-day, and nothing else here. An agent connecting with one of its keys is offered it as a tool." Press **Done**.

4. **Make a key.** Go back to `tut-agent` and choose **Keys**. Press **Create API key**. In **Name** type `tut-key`, leave **Expires** at **Never**, or choose **In 30 days**, and press **Create API key**. The page says "Copy this key now. It is shown only once, and cannot be read again." Press **Copy the key**, keep it where you can paste it, and press **Done**. The list shows the key as `vxk_` and its first characters, with **Active** and **Revoke**.

5. **See the tools.** Choose **Agent tools** and **Sandbox (dev)**. The table **Tool**, **What it does**, **It takes** lists:
   - `run_agent__clinic_day`, "Runs the script agent/clinic-day. How a clinic's day looks: visits by status, who has not arrived, and what was invoiced, in dollars. …", taking `date?`, `clinic` and `idempotencyKey?`.
   - `get_run`, "Reads a run of a script: its status, and its output or error once it has ended.", taking `runId`.
   - `get_flow_run`, "Reads a flow run: its status, and its output or error once it has ended. A flow can wait a long time for an approval.", taking `flowRunId`.

   The first tool is the script's own name with `/` and `-` turned into `_`, after `run_`.

6. **Try it.** Press **Try** on `run_agent__clinic_day`. The dialog says "The call is made as this account, with only what it may do. It is real: a script runs and a flow starts, with whatever effects they have. You are recorded as the one who asked." Under **Clinic** choose **riverside** and press **Call it**. The dialog shows "The agent would be told this." and the result: `runId`, `script` `agent/clinic-day`, `status` `succeeded`, and an `output` with the date, the clinic, the visits counted by status, who is `waiting`, and what was invoiced and paid, in cents.

7. **Call it as an agent does.** In the terminal put the key in a variable and the address from **Copy the address** in another:

   ```bash
   KEY=paste-the-key-here
   URL=http://localhost:8091/api/v1/tenants/<tenant id>/workspaces/<sandbox id>/mcp
   H='-H content-type:application/json -H accept:application/json,text/event-stream'
   curl -s -X POST "$URL" $H -H "Authorization: Bearer $KEY" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

   The answer is JSON with `result.tools`. The tool names are `run_agent__clinic_day`, `get_run` and `get_flow_run`, and each tool has an `inputSchema`. An agent such as Claude Code does the same from its settings: **Copy the settings** on the **Agent tools** tab gives the JSON, with the address and the header `Authorization: Bearer <one of this account's API keys>`.

8. **Call the tool.** In the same terminal:

   ```bash
   curl -s -X POST "$URL" $H -H "Authorization: Bearer $KEY" \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run_agent__clinic_day","arguments":{"clinic":"northside"}}}'
   ```

   The answer has `result.content[0].text`, a JSON text with `status` `succeeded` and the same kind of `output` as in the console.

9. **Ask for a tool that was not offered.** Fernhill has another agent script, `agent/find-client`, which you did not offer. Call its name:

   ```bash
   curl -s -X POST "$URL" $H -H "Authorization: Bearer $KEY" \
     -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"run_agent__find_client","arguments":{"query":"Biscuit"}}}'
   ```

   The answer has `isError` true and the text "There is no tool run_agent__find_client, or you may not use it." The tool is not in `tools/list` either.
:::

## What you built

- A service account `tut-agent`, with one API key, and the role Agent runner at one script and nothing else. Under **Access** the account lists the role `agent_runner` with "script agent/clinic-day in Sandbox" as what gives it its permissions.
- A tool, `run_agent__clinic_day`, that an agent sees and calls, and a refusal for the rest of the workspace.
- A way to try a tool as the account before an agent does, from the console.

To stop the agent, press **Revoke** on its key in **Keys**.
