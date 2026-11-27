# S8: Command palette with entities and actions

Roadmap item (the 2026 roadmap, in volvel-internal): P1-10. Priority P1. Complexity M.

## Problem (observed)

⌘K ("Go to", `apps/console/src/kit/CommandPalette.tsx`, sources in `Shell.tsx:532`) searches destinations only. Typing `reminders` in Fernhill returns "Nothing matches", even though the workspace has a `reminders/send` script, a `reminders/hourly` schedule and runs of both. The reference products search entities and run actions from the palette: n8n ([shortcuts](https://docs.n8n.io/build/keyboard-shortcuts.md)), Windmill ([search](https://windmill.dev/docs/core_concepts/search_bar)) and Retool ([palette](https://docs.retool.com/apps/management/concepts/command-palette)).

## Design

### API

`GET /tenants/:t/search?q=&workspace=&limit=20` returns `[{kind, id, path, workspaceId, title, hint}]`.
- **Resources:** script, flow, app, interface, table, trigger, connection, event, from `resource` by path prefix and trigram match, filtered by `check()` per workspace.
- **Runs and flow runs:** exact ID or ID prefix of 8 or more characters, and tags (S4).
- **Members and end users:** by name or email, for those who can read them.

### Palette

- **Sections in order:**
  1. Recent: the last 8 opened entities, from `/me/recent` extended to entities, stored as a preference and not audited (P0-4).
  2. Matches in this workspace.
  3. Other workspaces.
  4. Screens (today's list).
  5. Actions.
- **Prefixes:**
  - `>` runs (paste an ID)
  - `#` resources
  - `/` actions
  - `@` people
- **Actions**, each permission-checked from `/me`:
  - Run script…, Start flow…: pick, then SchemaForm (S6), then a toast linking to the run
  - New script, New flow (dev workspaces)
  - Pause or resume trigger…
  - Switch workspace…
  - Copy the workspace ID
  - Toggle theme
  - Open API docs (`/api/v1/openapi.json`)
- **Entity results** carry inline secondary actions with ⌘↵: a script offers Run; a trigger offers Pause; a run offers Re-run.
- **Keyboard:**
  - ↑↓ move, ↵ open, ⌘↵ secondary action, Esc close.
  - `?` from anywhere opens a shortcut sheet listing these and the CollectionView keys (j/k).

## Acceptance criteria

1. `reminders` lists the script, the schedule and the flow if any, in the current workspace first.
2. Pasting a full run ID opens that run's page.
3. `/run` then picking `agent/find-client` opens a form, and submitting it starts a run and offers "Open run".
4. Results never include resources the user can't read (test with a `viewer` and a `developer`).
5. Search answers in under 100 ms for a tenant with 2,000 resources (seeded test).
6. The palette works at 390 px as a full-screen sheet.

## Dependencies

S4 for run lookup by tag; S6 for action forms; P0-4 for non-audited recents.
