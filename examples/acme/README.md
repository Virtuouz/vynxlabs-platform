# Acme: a shop, an ERP and a portal

A sample tenant repository: an integration between a shop and an ERP, and a portal for staff and customers. It is YAML first: the tables, events, variable, connections, roles, bindings, schedule, trigger, flows, interface and theme are files under `resources/` (`volvel.yaml` says so), and the code is only what runs.

`ctx.table("orders")` in a script is typed by `.platform/volvel-env.d.ts`, which `volvel build` writes. The portal types its tables with `table<TableOf<"orders">>("orders")` from `@volvel/sdk`.

## What stays code, and why

- **Scripts** (`src/index.ts`): `orders/sync`, `orders/receive`, `orders/check`, `orders/record`, `orders/request`, `orders/send-to-erp`, `alerts/run-failed`. They run.
- **Code apps** `portal` and `public` (`apps/`): an app made of files has its source in the repository, and its definition says where.

The shape of an order is written twice: `Order` in `src/index.ts`, which the scripts check their input by, and the payload of `resources/orders/received.event.yaml`. A file cannot share a value with code; the event's file says so in a comment.
