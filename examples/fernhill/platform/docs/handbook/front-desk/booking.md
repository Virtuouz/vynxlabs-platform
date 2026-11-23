---
title: Booking a visit
description: Which slot to give, how long to book, and what to ask.
topic: desk-booking
subjects: [visits]
about:
  - table: appointments
extends: [data-tables]
terms:
  - id: recheck
    term: recheck
    aliases: [rechecks]
    short: A short follow-up visit for something the vet has already seen. Ten minutes, not charged as a new consultation.
  - id: first-visit
    term: first visit
    aliases: [first visits]
    short: A pet's first time at any of our clinics. Thirty minutes, and the owner fills in the registration form first.
---

Every booking is a row of the :term[appointments]{table=appointments} table. The Front desk app writes it for you.

# How long to book

:::tabs
::::tab{label="First visit"}
Book thirty minutes for a :term[first visit]{id=first-visit}. Send the registration form before the day.
::::
::::tab{label="Recheck"}
Book ten minutes for a :term[recheck]{id=recheck}, with the vet who saw the pet last where you can.
::::
::::tab{label="Anything else"}
Twenty minutes. If the owner describes more than one problem, book two slots back to back.
::::
:::

# What to ask

:::steps
1. The pet's name, and which owner is bringing it.
2. The reason, in the owner's own words. It goes in the :term[reason]{table=appointments column=reason} column and the vet reads it first.
3. Whether it can wait. If it cannot, say so to the duty vet before you book.
:::

Once a visit is finished its invoice is made for you. See [invoices](invoices).
