---
title: Invoices and chasing them
description: When an invoice is made, when it counts as paid, and what happens when it is not.
topic: desk-invoices
about:
  - table: invoices
  - flow: billing/chase-unpaid
---

An invoice is made when a visit is finished. Nobody types one. Its :term[status]{table=invoices column=status} stays unpaid until the payment provider tells us it was paid.

:::details{summary="What if an owner says they paid and it still shows unpaid?"}
Ask for the reference on their receipt and find it in the payment provider's own records. If it is there, tell the practice manager: do not mark it paid by hand.
:::

# Chasing

An invoice unpaid after fourteen days is chased by a flow, which writes to the owner and waits for the practice manager to approve anything further. The desk does not chase by phone unless the manager asks.

| Days unpaid | What happens |
| ---: | --- |
| 14 | A reminder is sent |
| 28 | The practice manager is asked what to do |

Back to [booking](booking).
