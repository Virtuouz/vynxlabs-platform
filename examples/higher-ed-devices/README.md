# Lakeshore State University: student device lending

A sample tenant built to test the platform's developer ergonomics and its MCP server: a university Tech Desk that lends laptops, Chromebooks, hotspots, iPads, calculators and chargers to students.

| What | Where |
| --- | --- |
| Tables: `students`, `devices`, `requests`, `loans` | `src/model.ts` |
| Scripts: submit, cancel, decide, check out, check in, mark overdue, availability, desk queue, look up a student | `src/scripts.ts` |
| Review flow: calculators and chargers approved at once, the rest wait for the "Tech Desk" group. Overdue loans are marked each weekday at 07:00 Central | `src/flows.ts` |
| Apps with no code: **Device desk** (queue, check out and check in, shelf) for staff; **Borrow a device** for students | `src/apps.ts` |
| Help-desk agent: the `helpdesk-assistant` service account over MCP, bound to look-up, availability, queue, submit and cancel | `src/apps.ts`, `setup/agent.mjs` |
| The tenant's access: the Tech Desk group and the agent's service account | `tenant/` |

Students are end users with a `student_id` attribute. The tables' rules show them their own record, requests and loans, and every device.

## Set it up

The repository brings up its own tenant. The Tech Desk group and the `helpdesk-assistant` service account are files under `tenant/`, and the bindings and the review flow name them by key (`tech-desk`, `helpdesk-assistant`), so what they are called can change later without touching the code. Release the tenant's access, then deploy. Turn triggers on in a dev workspace, or the review flow never starts.

```sh
platform tenant plan --tenant higher-ed       # what the release would make
platform tenant release --tenant higher-ed
platform deploy --tenant higher-ed --workspace devices-dev
platform promote --tenant higher-ed --workspace devices-dev
PLATFORM_EMAIL=… PLATFORM_PASSWORD=… node setup/setup.mjs --tenant higher-ed --workspace devices
```

`setup.mjs` fills an empty workspace: 40 students (two with holds), 58 devices, a term's loans with every hotspot out, three students who can sign in (password `lakeshore-demo-2026`), and a key for the agent. Addresses and the key are written to `.platform/<workspace>.json`, which is ignored by git.

## Talk to it as the agent

```sh
node setup/agent.mjs list
node setup/agent.mjs call run_students__look_up '{"query":"S1002371"}'
WORKSPACE=devices-dev node setup/agent.mjs call run_desk__queue '{}'
```

Or connect Claude Code to it:

```sh
claude mcp add --transport http lakeshore <agent.mcp from .platform/devices.json> \
  --header "Authorization: Bearer <agent.key>"
```
