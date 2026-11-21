# Every component inside every other

:::tabs
::::tab{label=Card}
:::::steps
1. Find the order.
2. Check its status.
:::::
::::
::::tab{label=Cash}
:::alert[Keep the receipt]{type=warning}
File it with the day's till slips.
:::

:::code-tabs
```js title=JavaScript
refund(order);
```
```py title=Python
refund(order)
```
:::
::::
:::

:::details{summary="Tabs inside details"}
:::tabs
:::tab{label=One}
:::file-tree
- refunds/
  - index.md
:::
:::
:::tab{label=Two}
:::tabs
:::tab{label=Inner}
Tabs inside tabs.
:::
:::
:::
:::
:::

:::steps
1. A step that holds a fold.

   :::details{summary="More"}
   Inside a step, inside a list item.
   :::

2. And one that holds a :kbd[Ctrl] key and a :term[RMA]{id=rma}.
:::

:::alert[Inside a callout]
:::details{summary="A fold in a callout"}
:::steps
1. Deeper still.
:::
:::
:::
