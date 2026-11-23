---
title: Stop every trigger and clear a backlog
description: "Pause all triggers in the instance at once, with the console, the API or an environment setting, and clear queued runs when work piles up."
subjects: [emergency]
---

## Stop every trigger and clear a backlog

By the end nothing new starts from a trigger in any tenant, and the queued runs that piled up are canceled. The pause was run on a Compose stack for this page.

## Before you start

- You are an operator with `instance:write` for the switch, and `instance:read` to read it.
- To clear a backlog in a workspace: an operator with access to that tenant, or a member who may cancel runs there. An operator needs an access grant the tenant can see.
- Know the limits that apply without you. A flow's schedule passes over a time while its last run from that trigger is still going, unless the trigger says `overlap: "allow"`. A workspace with `SCHEDULE_BACKLOG_LIMIT` runs waiting (200 by default) gets no more from its schedules until the queue shrinks, and the trigger shows the time it passed over and why. `0` turns this off. A new dev workspace starts with its triggers paused.

## Stop every trigger

:::steps
1. In the console, open **Instance**, then **Triggers**, and press **Pause every trigger**. Give a reason if you like. Or call the API:

   ```bash
   curl -X PUT "$VOLVEL_URL/api/v1/instance/triggers" -H "content-type: application/json" \
     -H "authorization: Bearer <an operator's API key>" -d '{"paused": true}'
   ```

   Or use the CLI: `volvel instance triggers pause --reason "..."`.
2. If the instance cannot stay up long enough for that, set `TRIGGERS_PAUSED=true` where it runs and restart. The console cannot undo that: its notice says "TRIGGERS_PAUSED is set where the instance runs. Unset it and restart to resume."
3. To resume, press **Resume triggers**, or `PUT` `{"paused": false}`.
:::

While paused:

- nothing new starts from a schedule, source, webhook, form or event, in any tenant;
- schedules keep their times and fire once on resuming;
- webhooks are answered 503;
- runs already queued or going carry on.

The screen's states and words are in [the Triggers screen](../../reference/console/triggers).

## Clear a backlog

:::steps
1. Open the workspace's **Runs** and press **Cancel N queued**, or from a terminal:

   ```bash
   volvel runs cancel --tenant <slug> --workspace <slug> --queued
   ```

   `--all` cancels what is going too, flow runs included. `--older-than <s>` limits it by age.
2. Read the numbers. `volvel_runs_queued` and `volvel_queue_oldest_seconds` fall. See [Monitor an instance](monitor-an-instance).
:::

## The result

In the run for this page, pausing answered 200 with `"paused": true`, and resuming answered 200. The tenant's **Workers** page and the metrics show the queue shrink as runs end or are canceled.

## If it does not work

- **There is no Resume button.** `TRIGGERS_PAUSED` is set in the environment.
- **Schedules did not stop the runs already queued.** A pause stops new starts only. Cancel the queue.
- **The backlog returns.** Find what makes runs slow: add worker capacity ([Sizing and scaling](../../explanation/running/sizing-and-scaling)), or set the schedule to skip.

Related: [Settings](../../reference/settings).
