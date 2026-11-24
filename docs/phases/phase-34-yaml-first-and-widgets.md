# Phase 34: definitions are YAML first, and developers write their own widgets

Status: in progress, on branch `phase-34-yaml-first-and-widgets`, off `main` (phases 29 to 33 merged, PR #19).
Last updated: 2026-11-24

The owner (2026-11-24), on console- and repository-managed tables: "definitions don't need logic or the capabilities of js and thus it makes sense to just use yaml at which point almost anything that is defined should be yaml based over js based", then "yaml first with it as the default, but definitions retained for complex use cases at which point repository managed vs console would make sense. Additionally incorporate finishing building out the feature that allows developers to define and use their own custom widgets". The plan is `~/.claude/plans/i-would-like-to-fuzzy-meteor-of-45518b7f-b8fc-41f4-9613-9ba4253edadd.md`.

**Exit criterion.** On `examples/fernhill`, now YAML first, in a browser and a terminal:

- a developer starts a repository with `volvel init` and finds its tables, schedules and access as YAML files, with scripts in TypeScript typed by name (`ctx.table("visits")` knows its columns), in their editor and in the console's script editor;
- a table defined in YAML is changed in the console, and a repository deploy then refuses with the paths the console changed; `volvel pull` brings them in and the deploy passes; `--force` overrides, recorded in the audit log;
- a table defined in TypeScript (`defineTable`) is taken over on its Definition tab, and a deploy that still defines it takes it back;
- `volvel convert` turns an example's declarative TypeScript into YAML and says what it left and why;
- a developer writes a widget in the repository, previews it with `volvel dev`, deploys it, and a member places it from Add to page, sets it in the inspector and publishes; it draws in an app and on a dashboard inside a sandboxed frame that cannot fetch, read a cookie or send an event it does not declare;
- every page about these is written YAML first and checked.

## Owner decisions

| Area | Decision |
|---|---|
| Form | YAML first and the default; TypeScript definitions kept for complex cases (composition, shared values, generated families) |
| A repository deploy after console edits | Refused: pull first; `--force` overrides on purpose (2026-11-24) |
| Examples | Fernhill and acme YAML first; higher-ed-devices stays the example of definitions in code |
| Widget authoring | In a repository only, previewed with `volvel dev`; no widget editor in the console |
| Widget safety | Decision 0005 as designed: a sandboxed frame, no network, no cookies, data only through declared inputs read by the server under the viewer's rules, events out only as declared |
| Agents | Sonnet, up to 20 at once |
| Stops | After A2, A3, B3 and B4 (pull first, typed scripts, a tenant widget in its frame), and at the end |

## Milestones

| # | Milestone |
|---|---|
| A1 | One source for both forms: SDK input types generated from the kind schemas; a parity test; binding→role checked at build |
| A2 | Shared ownership ("Files" and "Code") and "pull first" |
| A3 | Types generated from the definitions, in the repository and in the console's script editor |
| A4 | `volvel convert` |
| A5 | YAML by default: `volvel init`, Fernhill and acme |
| A6 | Take-over for tables, as for other resources |
| A7 | Documentation, YAML first |
| B1 | The `widget` kind, `defineWidget` in a repository, `@volvel/widget-frame` |
| B2 | Build, deploy and pin a widget's version |
| B3 | Tenant widgets in the builder, the runtime and the checker |
| B4 | The sandboxed frame and its protocol |
| B5 | `volvel dev` for widgets |
| B6 | Documentation, and a Fernhill widget |

## Findings

(none yet)

## Polish gate

(answered at the end; A6, B3 and B4 change screens)
