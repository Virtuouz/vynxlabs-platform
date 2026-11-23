---
title: Let an agent run a script
description: "Offer one script or flow to an AI agent, connect the agent over the Model Context Protocol with a service account's key, and try a tool."
subjects: [access, agents]
---

## Let an agent run a script

You let an agent that speaks the Model Context Protocol start one script or flow, and nothing else in the workspace.

### Before you start

- You need `binding:write` on the script or flow, and a service account with a key (see [Make a service account and a key](make-a-service-account-and-key)).
- A flow is offered only when it has a manual trigger.

:::steps
1. For a script, open **Scripts**, the script, then **Open the code**, and press **Offer to an agent…** (the script's own page does not have it). For a flow, open the flow and press **Offer to an agent…**.
2. Choose the **Service account** and press **Offer**. The account is given the **Agent runner** role on that script or flow alone. The dialog says an agent connecting with one of its keys is offered it as a tool, and shows **Address for the agent** with **Copy the address**.
3. Open the account's page, then the **Agent tools** tab, and choose the workspace under **In the workspace**.
4. Press **Copy the settings** and paste the JSON into the agent's settings. Replace `<one of this account's API keys>` with one of the account's keys.
5. In **Tools offered**, press **Try** on a tool, fill in what it takes and press **Call it**.
:::

### The result

The agent connects to the address with the key and is offered a tool for each script or flow it may start, besides `get_run`, `get_flow_run` and `list_approvals`. **Try** shows what the agent would be told: "The agent would be told this." or "The agent would be told this failed." Try is real: a script runs and a flow starts, and you are recorded as the one who asked.

### Connect without the console

The settings are:

```json
{
  "mcpServers": {
    "volvel": {
      "type": "http",
      "url": "https://volvel.example.com/api/v1/tenants/<tenant-id>/workspaces/<workspace-id>/mcp",
      "headers": { "Authorization": "Bearer <one of this account's API keys>" }
    }
  }
}
```

The tool names, limits and the approval tools are in the [MCP reference](../../../develop/reference/access/mcp).

### Things to know

- A run another person started, and an approval waiting for someone else, are masked for the agent as they are on screen. The agent's own are given as they are.
- A tool waits up to 25 seconds for the run to end, then returns a run ID for `get_run`.
- Giving the account **Agent runner** for the whole workspace, from **Access**, is enough to connect. It is then offered every script and flow in the workspace it may start. An account with no role in the workspace and none on a script or flow in it is refused, and the Agent tools tab says so in a notice.

### If it does not work

- **Offer to an agent…** is disabled without `binding:write` on that script or flow.
- "An agent connects as a service account, with one of its keys. This tenant has none yet.": the dialog links to **Create a service account**.
- "No tools. The account may start no script or flow here.": offer one, or give the account a role that may start them.

## Related

- [Service accounts](../../reference/screens/service-accounts), the **Agent tools** tab.
- [MCP reference](../../../develop/reference/access/mcp).
