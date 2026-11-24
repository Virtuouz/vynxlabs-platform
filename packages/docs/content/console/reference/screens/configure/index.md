---
title: Configure
icon: wrench
description: "The five Configure screens of a workspace: connections, variables, secrets, alerts and workspace settings."
pages:
  - connections
  - variables
  - secrets
  - alerts
  - settings
moved_from:
  - configure/index
---

Configure is where a workspace is told what its code needs from the outside, and how it behaves. Code declares a name and a kind: a connection called `stock-orders` of kind HTTP, a variable called `stock/reorder-quantity`. Each workspace sets the rest: an address, a credential, a value. See [How a connection gets set up](../../../explanation/configure/how-a-connection-gets-set-up).

- [Connections](connections): where each connection points in this workspace, whether it was reached, and connection groups.
- [Variables](variables): the values that scripts and trigger sources read, set per workspace over a default from the code.
- [Secrets](secrets): values kept encrypted, written once and never shown again.
- [Alerts](alerts): who is told when a script or a flow fails, and the alerts that were sent.
- [Workspace settings](settings): the workspace's name, promotion target, time zone and run limit; pausing triggers, copying and deleting it; who holds a role in it.
