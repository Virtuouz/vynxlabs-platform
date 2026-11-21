# Deploying

Each :term[workspace]{id=workspace} belongs to one tenant, and :product[] keeps them apart.

The :term[status]{table=sales/orders column=status} column drives the board. An :term[RMA]{id=rma} has no page.
Press :kbd[Ctrl+K] to search.

:::alert{type=warning}
Deleting a table drops its data.
:::

:::alert[Before you start]
You need a dev workspace.
:::

::field{path="table.columns.*.type"}

::field{path="table.columns.*.missing"}

:::tabs
::::tab{label="CLI"}
`volvel deploy`
::::
::::tab{label="Console"}
Open **Deploy** in the header.

:::::alert{type=info}
An alert inside a tab.
:::::
::::
:::

:::steps
1. Write the page.
2. Deploy it.
:::

:::details{summary="Why a deploy?"}
Because production changes arrive only by deploy.
:::

:::code-tabs
```ts
export default defineScript({});
```
```yaml title="YAML"
kind: script
```
:::

:::file-tree
- docs/
  - index.md
  - guides/
    - refunds.md
:::

::screenshot{name=console/deploy alt="The deploy dialog"}

::screenshot{name=console/missing alt="A picture that is not there"}
