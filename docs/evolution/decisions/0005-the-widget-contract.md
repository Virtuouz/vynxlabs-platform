# Decision 0005: the widget contract, and where a developer's widget would run

Status: **accepted** by the owner, 2026-11-21 (phase 25 owner decision 7). The contract is built in phase 25; developer widgets are designed here and not built.
Date: 2026-11-21.
Prompted by: the owner: "The widget system should be extendable by developers for their own users … the widgets that do come with the system are just a core pack." And: "Developers create capabilities. End users configure and compose them. The platform enforces the boundary between the two."

## Summary

A widget is a **definition** (data: type, version, category, configuration schema with inspector hints, data inputs, events, layout limits) and a **renderer** (a component given its config, its data and a way to raise its events, and nothing else). The platform's own widgets are a pack written against that contract. A developer's widget would be another pack, run in a sandboxed frame. Nothing about it changes what a builder sees or can do.

## Context

| Fact | Evidence |
|---|---|
| Today's extension point is `{ name, configSchema, render(config, context) }`, a name lookup in the browser | `packages/sdk/src/extensions.ts:85`, `packages/ui/src/widgets.tsx:59` |
| `context` is a bag of table-shaped hooks (`rows`, `onSubmit`, `onEdit`, …); config is never validated | `extensions.ts:50-82`, `widgets.tsx:77` |
| Interface bodies are data, and the control plane never runs tenant code | decision 0001, rule 1 |
| Nodes are the model of a pack: a reserved `core/` prefix, the version used pinned in each bundle | `packages/nodes`, `bundle-check.ts:23`, `packages/compose/src/index.ts:321` |
| Code apps are served on a separate address under a CSP with no inline script and `connect-src 'self'`, with an HttpOnly cookie | `kernel/apps/front.ts:86-98`, `kernel/apps/sessions.ts` |

## Decision

### The contract (built in phase 25)

`@volvel/widgets` (`packages/widget-sdk`):

- `defineWidget(definition)` returns the definition, checked: `type` (`pack/name`), `version` (semver), `title`, `description`, `category`, `icon`, `surfaces` (`app`, `dashboard`), `data` (named inputs with a shape: `rows`, `record`, `summary`), `config` (JSON Schema with `x-volvel` hints), `events` (named, each with what it gives), `layout` (`min`, `default`, `max`, `phone`).
- `WidgetView<D>`: the renderer's props, `{ config, data, state, size, emit }`, typed from the definition.
- A registry of definitions, importable without React, used by the manifest to validate bodies and by the console to draw the inspector and "Add to page"; and a registry of renderers, used by the page renderer.
- The inspector is made only from the hints, from a fixed set of controls. A widget cannot add inspector code.

The core pack (`packages/widgets-core`) imports only `@volvel/widgets` and `@volvel/ui`, checked by `enforce.test.ts`. A second internal pack (`packages/widgets-labs`, one widget) proves that nothing in the builder is written for the core pack only.

### Developer widgets (designed, not built)

**Packaging.** A new resource kind, `widget`, in a tenant's repository: the definition as the body, and the renderer built by the CLI with the repository's own build tool into an asset listed by checksum, as app files are (spec, App files). `type` is prefixed by the tenant's pack name; `core/` and `labs/` are reserved. A page names `type` without a version; a deploy pins the version present in the bundle, so promotion moves a page and the widget it was built with together, as nodes do. A new major version is a new type for any page that hasn't been moved to it.

**Execution.** A developer's renderer is tenant code, so it never runs in the console's or the page's own document:

- it runs in an `<iframe sandbox="allow-scripts">` (no `allow-same-origin`), served from the app address with a CSP of `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:`, so it has **no network** and no cookies;
- the host posts in `{ config, data, state, size, theme }` and posts again when any changes;
- the frame posts out only `{ event, payload }` for an event its definition declares; the host checks the payload against the event's shape and drops anything else, and a frame that posts too much is stopped;
- it gets the data its inputs resolved, already read under the viewer's permissions by the server; never a token, a secret, the API, or another widget's data;
- its size is the cell the host gives it; it cannot draw outside it, open windows or navigate the page.

**What stays the same for a builder.** The same "Add to page", the same inspector made from the same hints, the same Data, Display, Actions and Rules, the same events mapped to the same actions. The only difference shown is the pack's name.

**Not built now, and not planned:** a marketplace, sharing a pack across tenants, a widget editor in the console, widgets with server code of their own.

## Consequences

- The spec's "Interface widget" extension point is this contract.
- Every built-in widget proves the contract; when one needs more, the contract grows for all.
- A developer's widget can show data badly; it can't show data the viewer may not read, or do something the page didn't say.

## Alternatives

- **Developer widgets in the page's own document**, trusted as code apps are. Simpler and faster, but a widget would hold the viewer's session, and the spec keeps an operator's reach and a tenant's code apart.
- **Web components.** No isolation; the same problem.
- **A widget that fetches its own data.** Rejected: a widget could then ask any question the viewer may, and a published page would no longer say what it reads.
