---
title: Page through a list
description: Read a list that is longer than one answer, with limit and cursor, and know which lists have no cursor.
subjects: [api, rows]
---

## Page through a list

By the end you will have a loop that reads every item of a list, whatever its length.

## Before you start

- A key and the instance's address, as in [Call the API with an API key](call-the-api-with-a-key).
- The workspace and a list to read. The example reads the rows of a table called `api-visits`; the same loop reads runs, flow runs, members and the other lists that page.

## Read every page

:::steps
1. Ask for the first page with `limit`. A list takes `limit` from 1 to 200, and 50 when you leave it out. The rows of a table take up to 1,000.
2. Read the answer. It is `{ "items": [...], "nextCursor": "..." }`. `nextCursor` is a string while there is more, and `null` on the last page.
3. Pass `nextCursor` back, unchanged, as `cursor`, with the same `limit` and the same filters and sort. Do not read it, build it or keep it between runs: it is opaque and can change.
4. Stop when `nextCursor` is `null`.
:::

```js title=page.mjs
const base = process.env.VOLVEL_URL;
const key = process.env.VOLVEL_KEY;
const url = `${base}/api/v1/tenants/${process.env.TENANT}/workspaces/${process.env.WORKSPACE}/rows/api-visits`;

let cursor;
const pets = [];
do {
  const query = new URLSearchParams({ limit: "2", sort: "pet" });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`${url}?${query}`, { headers: { authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const page = await response.json();
  pets.push(...page.items.map((row) => row.pet));
  cursor = page.nextCursor ?? undefined;
} while (cursor);
console.log(pets.join(", "));
```

With six rows and `limit` 2, the loop makes three requests and prints the six pets in order.

```text
Biscuit, Juno, Miso, Moose, Olive, Pickle
```

## Lists that have no cursor

Some lists do not take `cursor`. Each says in its response description which kind it is: "Every one there is. The list has no cursor." means the answer is the whole list, and "At most N. The list has no cursor, so what is past N is not reachable through this route." means it is cut at N. Such a list answers `{ "items": [...] }` with no `nextCursor`. The cuts include clones (50), bundles (100), deployments (100), promotion requests (200) and files (200).

Do not wait for a `nextCursor` on a list whose description does not give one. The [API reference](../../reference/api/index) has each route's description.

## How a cursor behaves

A cursor holds where the last page ended, not a copy of the list. For the rows of a table that has a key and is sorted by one column at most, a page starts after the last row it gave, so rows added before it do not repeat or skip a row, and a deep page costs what the first costs. For a table with no key, or a sort by several columns, a cursor counts rows instead.

## The result

You have every item, in the order you asked for. Changes made while you read can appear in later pages, because the list is read live.

## If it does not work

- **400 "The cursor is not valid."** The cursor was changed, or belongs to another request. Start again without it.
- **400 on `limit`.** The answer says "must be <= 200" (or 1000 for rows). Ask for less.
- **A page has fewer items than `limit` and a `nextCursor`.** That is allowed. Keep going until `nextCursor` is `null`.
