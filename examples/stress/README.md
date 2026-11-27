# Stress fixtures

This example is what phase 11 stress-tested the product with, kept so the test can be run again. It is not a sample business. It is a set of scripts, one table, one flow, two schedules, one webhook and one dashboard, each made to put one kind of load on an instance. A setup script makes as many tenants as you ask for, deploys it to each, and writes a file that a load generator reads.

Run it only against an instance you can afford to slow down. The setup script and the schedules make a lot of work.

## What is in it

The code is in `src/scripts.ts`. Everything else is a file in `platform/load/`.

| Resource | What it does | The phase 11 scenario |
| --- | --- | --- |
| `load/sleep` | Waits `seconds` (default 20) and returns. | Slow per-minute scripts in many tenants. A slow script holds a run slot. |
| `load/hold-memory` | Fills `megabytes` of buffers (default 300) so they are really resident, holds them for `seconds`, and returns. Its `memoryMb` is 512. | A script holding 700 MB under `memoryMb` 512. Run it with 300 and it succeeds. Run it with 700 and it is stopped as out of memory. |
| `load/burn-cpu` | Busy-loops for `seconds` (default 10). | Heavy scripts slowing the console. |
| `load/quick` | Returns at once with a small payload. | Throughput: how many runs a second are started and finished. |
| `load/items` | Returns the numbers 0 to `count - 1`. A foreach needs a list and an expression cannot make one, so this makes it. | The first step of the flow below. |
| `load/item` | The per-item step of the flow. Does a tiny amount of work. | The cost of one flow item. |
| `load/fill-table` | Inserts rows into `load/records` from `from` up to `rows` (default 200,000), 500 to a call. Stops itself 55 minutes in and says where to carry on. | Four 200k-row workspaces. |
| `load/records` (table) | Ten columns: whole numbers, decimals, text, a date, a timestamp, a yes or no, an enum of eight categories and a region of forty. It has no indexes of its own. | Twenty people browsing large tables: sorts and filters have to work the whole table. |
| `load/fan-out` (flow) | Makes a list of `count` numbers (default 1,000, which is the most a foreach runs), then runs `load/item` for each, ten at a time. | A per-minute flow over 1,000 items. |
| `load/sleep-every-minute` (schedule) | Starts `load/sleep` with 90 seconds every minute. `overlap: allow`, so runs stack. | Slow per-minute scripts. |
| `load/fan-out-every-minute` (schedule) | Starts `load/fan-out` with 1,000 items every minute. `overlap: skip`. Change it to `allow` to see flow runs stack as they did before phase 11. | A per-minute flow over 1,000 items. |
| `load/quick-hook` (webhook) | Starts `load/quick` with the request's body. | Throughput of taking in requests. |
| `load/overview` (dashboard) | Two stats, two charts and a table of the 100 biggest amounts, all over `load/records`. It asks again every minute while open. | Twenty people browsing: reads of widget data over a large table. |

The table, the flow, the schedules, the webhook and the dashboard are YAML files. Only the script bodies are TypeScript.

## Setting up

Build the CLI once, from the repository root: `pnpm exec tsc -b packages/cli`. The setup script deploys with `packages/cli/dist/bin.js`.

Then, from `examples/stress`:

```sh
VOLVEL_URL=https://your-instance \
VOLVEL_ADMIN_EMAIL=you@example.com \
VOLVEL_ADMIN_PASSWORD=… \
node setup/setup.mjs --tenants 12 --fill 200000
```

The options are:

- `--tenants N` makes tenants `stress-01` to `stress-NN`. The default is 1.
- `--prefix NAME` changes `stress`.
- `--out FILE` is where the load generator's file goes. The default is `.platform/stress.json`, which git ignores.
- `--fill ROWS` runs `load/fill-table` in each tenant until the table has that many rows. A fill that is cut short is carried on by running the command again, because the point it reached is kept in the file.
- `--schedules on|off` resumes or pauses the two per-minute schedules in every tenant.
- `--remove` deletes the tenants the prefix and `--tenants` name, and nothing else.
- `--timeout SECONDS` is how long any one wait may take. The default is 300.

For each tenant the script makes the tenant and a production workspace `main`, adds a member that deploys, deploys this repository to it, and makes a service account `load-generator` with a key. The key may start scripts and flows, read their runs, and read and write rows. It may not do anything else.

A new workspace starts with all its triggers paused. The script pauses the two schedules one by one, and then lets the workspace go, so the webhook works and the schedules do not fire. Without `--schedules` a tenant that already exists keeps whatever state its schedules are in.

The script can be run again. A tenant, a workspace, a deployment and a key that exist are kept. Sign-in is limited to 20 a minute from one address, so the script signs in twice in all: the operator once, and the deploying member once. The deploying member's key is kept beside the output file as `<prefix>-deployer.key`. The member's account stays after `--remove`, because members' accounts are not deleted with a tenant.

## What it writes

```json
{
  "users": [
    {
      "label": "stress-01",
      "tenant": "<tenant id>",
      "workspace": "<workspace id>",
      "cookie": null,
      "apiKey": "vxk_…",
      "extra": {
        "scripts": [{ "path": "load/quick", "input": {} }, …],
        "webhookUrl": "https://…/api/v1/hooks/…",
        "table": "load/records",
        "flow": "load/fan-out",
        "flowInput": { "count": 1000 },
        "dashboard": "load/overview",
        "tenantSlug": "stress-01",
        "workspaceSlug": "main",
        "filled": 200000
      }
    }
  ]
}
```

A load generator signs in with `Authorization: Bearer <apiKey>` and calls, under `/api/v1/tenants/<tenant>/workspaces/<workspace>`:

- `POST /runs` with `{ "script": "load/quick", "input": {} }` starts a script, and `GET /runs/<id>` follows it.
- `POST /flow-runs` with `{ "flow": "load/fan-out", "input": { "count": 1000 } }` starts the flow.
- `GET /rows/load/records?sort=amount&limit=50` reads rows. Sorting a column that has no index is the point.
- `POST` to `webhookUrl` starts `load/quick` with no key at all.

The webhook address is a credential. The file is written with mode 600.

## Running the scenarios

- Slow scripts in many tenants: set up N tenants (phase 11 used 12), then `--schedules on`. Watch free memory on the machine, queued runs, and how long the console takes to answer.
- A script holding too much: start `load/hold-memory` with `{ "megabytes": 700, "seconds": 20 }`. It should fail with an out-of-memory message. With 300 it should succeed.
- Browsing large tables: set up with `--fill 200000`, then read rows and open the dashboard from many sessions at once. Busy reads should answer 503 or 422, never 500.
- A flow over 1,000 items: `--schedules on` starts both schedules. With the flow's `overlap: skip` there should be one flow run at a time and later ticks skipped.

When you are done, `node setup/setup.mjs --tenants N --remove`. It pauses each workspace, cancels what is queued or running, and deletes the tenant.
