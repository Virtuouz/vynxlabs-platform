---
title: Limits and timings
description: "The numbers the console and the instance keep for sign-in, sessions, the palette, lists, saved views, settings, notices and live updates."
subjects: [sign-in, saving]
---

Each number is held by the instance or the console as written. A limit that can be set by an administrator is in the reference for the screen that sets it.

## Sign-in and accounts

| What | Limit |
| --- | --- |
| A session in the console | 7 days. |
| A password | At least 12 characters, for signing in, changing it and the one-time link. |
| Sign-in attempts | 20 a minute from one address. The same limit holds for changing a password. |
| A password link | Works once, and runs out 2 hours after it was made. A new link makes the earlier one stop working. |
| Recovery codes | 10 at a time, each used once. Making new ones stops the old ones. |
| An API key | Never expires, or expires in 30 days, 90 days or a year, as chosen. |
| A name on **Account** | 200 characters. |

## Finding things

| What | Limit |
| --- | --- |
| Results of one palette search | 20 (the API takes 1 to 50). |
| The text of a palette search | 200 characters. |
| **Pinned** | 12 for each tenant. |
| **Recent** | 20 kept for each tenant, 8 shown. |
| The palette's search | Asks the instance 150 ms after you stop typing. |
| Screens listed with nothing typed | 12, then 4 actions. |

## Lists

| What | Limit |
| --- | --- |
| A page of the tenant list | 50, then **Load more**. |
| A page of **Runs** | 100, then **Load more**. |
| A page of a table's rows | 50. |
| Rows in one batch | 100 for each request. More are sent in groups, one group after another. |
| Saved views | 50 for each list, each with a name of up to 80 characters that is not used by another of your views of that list. A view's state holds up to 16 KB. |
| The inspector's width | 288 to 720 px, one width for all lists. |

## Your settings

| What | Limit |
| --- | --- |
| Settings kept for you | 200, each up to 4 KB. The kinds are fixed: the theme, whether the panel is open, single-key shortcuts, editor settings, row density, panel splits, underlined terms, palette pins, notices you have dismissed and the operator strip. |
| A change to a setting | Is sent to the instance about 0.4 seconds later. A setting changed less than that before you sign out is not kept. |

## Notices and live updates

| What | Limit |
| --- | --- |
| A notice | Leaves after 5 seconds, or 10 when it holds a link or a button. A failure stays until you close it. Pointing at it or focusing it holds it. 3 show at once. |
| **Reconnecting…** | After 3 seconds without run events. |
| **Offline** | After 30 seconds without run events. |
| Streams of run events | At most 5 open at once for one person on one instance replica, 2 for someone who follows only their own runs. |
| The read-only strip | The console asks the instance every 30 seconds whether it takes changes. |
| Work the console asks a worker to do, such as reading a script's schema or trying a connection | If no worker takes it within 20 seconds, the screen says why. |

## Related

- [Sign in to the console](../../how-to/basics/sign-in)
- [Finding your way](finding-your-way)
