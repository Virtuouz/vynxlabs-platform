---
title: Call an API from a script
description: "Give a script a connection, a secret and a variable, set them up in a workspace, and run it against an API."
subjects: [connections, secrets, variables]
---

## Call an API from a script

By the end a script will have called an API through a connection, signed in with a secret and sized by a variable, and you will have seen the call arrive. It takes about fifteen minutes.

## Before you start

- A tenant repository, as `volvel init <directory>` writes it, and the CLI signed in with `volvel login --url <instance address> --token <api key>`. Make the key under your account menu.
- A dev workspace to try things in. This page calls it `try-it` in the tenant `fernhill`. Do not use a workspace whose resources you want to keep: a deploy makes the workspace match the repository.
- You are signed in to the console as someone with `connection:write`, `secret:write` and `variable:write` in that workspace, such as a Workspace admin or a Developer.
- Fernhill's stand-in for its supplier is running: `pnpm stand-ins` in `examples/fernhill`. It answers at `http://127.0.0.1:4020` and accepts the token `vs_demo_51be22`. Open that address to see the orders it received.
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

## Write and run the script

:::steps
1. Declare a connection and a variable as two files in the console's folder, `platform/`. They declare a name and a kind. Nothing about where the API is or how to sign in is in them.

```yaml title=platform/stock-orders.connection.yaml
schemaVersion: 1
body:
  connector: http
  description: "VetSupply Direct: prices and orders for stock."
```

```yaml title=platform/stock/reorder-quantity.variable.yaml
schemaVersion: 1
body:
  description: How many units one reorder asks for.
  default: "10"
```

   Then replace the contents of `src/index.ts` with a script that reads them and a secret. A script is code, and names what it reads by path:

```ts title=src/index.ts
import { defineScript, z } from "@volvel/sdk";

export const reorder = defineScript({
  path: "stock/reorder",
  description: "Orders one product from the supplier.",
  input: z.object({ sku: z.string() }),
  output: z.object({ reference: z.string() }),
  connections: ["stock-orders"],
  secrets: ["SUPPLIER_ACCOUNT"],
  variables: ["stock/reorder-quantity"],
  async run(input, ctx) {
    const api = await ctx.connection("stock-orders");
    const account = await ctx.secret("SUPPLIER_ACCOUNT");
    const quantity = Number(await ctx.variable("stock/reorder-quantity"));
    const placed = await api.post("/vetsupply/orders", { account, sku: input.sku, quantity });
    return { reference: (placed.json() as { reference: string }).reference };
  },
});
```

2. Deploy it to the dev workspace.

```bash
volvel deploy --tenant fernhill --workspace try-it
```

The command lists what it made and ends with two notes. A dev workspace takes a deploy with something not set up, and says so.

```text
Deployed version 1 to try-it (dev): 3 created, 0 updated, 0 deleted, 0 unchanged.
  created  connection stock-orders
  created  variable   stock/reorder-quantity
  created  script     stock/reorder
  Note: the connection "stock-orders" is not set up in this workspace
  Note: the secret "SUPPLIER_ACCOUNT" is not set in this workspace
```

3. In the console, open **Configure**, then **Connections**. The row `stock-orders` says **Not set up here** and its **Used by** is `stock/reorder`. Press **Set up**.
4. In the sheet, type `http://127.0.0.1:4020` as the **Address** and `/vetsupply/ping` as the **Test path**, choose **Authorization: Bearer** under **How the credential is sent**, and type `vs_demo_51be22` as the **Token or key**. Press **Save**. The sheet shows **Reached (200)** with the time it took. Press **Close**.
5. Open **Secrets** and press **New secret**. Type `SUPPLIER_ACCOUNT` as the **Name** and `FERNHILL-CFG` as the **Value**, and press **New secret**. The row shows who set it and, under **Used by**, `stock/reorder`.
6. Open **Variables**. The row `stock/reorder-quantity` shows **Default: 10**. Press **Set**, type `12` and press **Save**. The row shows `12`.
7. Run this build of the script in the workspace. It is a test run, and nothing is deployed.

```bash
volvel run stock/reorder --remote --tenant fernhill --workspace try-it --input '{"sku":"VAC-DHPP"}'
```

```text
Test run 01a20fc7-0c2a-71d0-be1c-ceb7cd1007fb of stock/reorder in try-it, from this build (preview, version 1). Nothing was deployed.
Succeeded in 279 ms.
Output: {
  "reference": "VSD-900002"
}
```

8. Open `http://127.0.0.1:4020` in a browser. VetSupply's orders list a line with the reference `VSD-900002`, the account `FERNHILL-CFG`, the product `VAC-DHPP` and the quantity `12`.
:::

## The result

The script called an API it knows only by name. The address and the token came from the connection, the account from the secret and the quantity from the variable, all as set in `try-it`. A production workspace sets its own. Change the variable to another number and run the script again: the next order has the new quantity, with no deploy.

## If it does not work

- **"Failed: GET /runs/…/secrets/SUPPLIER_ACCOUNT?attempt=1 answered 404: The secret SUPPLIER_ACCOUNT was not found."** The secret is not set in the workspace. Make it under **Secrets**.
- **"Failed: GET /runs/…/connections/stock-orders?attempt=1 answered 404: The connection stock-orders was not found."** The connection is not set up in the workspace. Set it up under **Connections**.
- **A 401 from the supplier.** The token is wrong. Press **Change** on the connection and replace the **Token or key**.
- **"A connection can only call its own base URL, not X."** The script called an address outside the connection's. A connection reaches only its own origin.
- **A deploy to a production workspace is refused with a list.** Production refuses a deploy or a promotion while a connection or a secret the code reads is not set up. Each entry has **Set up**.

To write the connection and the variable in TypeScript instead, see [Definitions in code](../../../develop/explanation/cli/definitions-in-code). For all of the fields, see [Connections in code](../../../develop/reference/configure/connections-in-scripts) and the screens under [Configure](../../../console/reference/screens/configure/).
