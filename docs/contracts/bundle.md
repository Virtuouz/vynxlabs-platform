# Bundle format

Formats 1 to 4. Last updated: 2026-11-17

A bundle is the unit of deploy: one workspace's manifests and its code, immutable once built. Its machine-readable form is `schemas/bundle.schema.json`. This document says what each format adds and what a reader and a writer owe each other.

## Rules

- **A bundle is written in the oldest format that can carry it.** A repository that uses nothing newer keeps deploying to an instance that has not been upgraded. A reader refuses a format it does not know.
- **An instance keeps reading every format.** A bundle stays deployable, promotable and a rollback target for as long as its core range is supported.
- **A bundle's digest is SHA-256 over its other fields**, written with sorted keys. A field that is not there is not hashed, so a bundle that says nothing new hashes as it always did.

## Formats

| Format | Adds |
| --- | --- |
| 1 | `manifests` and `code`. Every manifest is `ownership: "code"` |
| 2 | `assets`: the files of the bundle's apps, by checksum |
| 3 | Manifests with `ownership: "ui"`: the resources managed in the console. A format 3 bundle that carries one speaks for every console-managed resource of the workspace |
| 4 | On a manifest: `key`, `title`, `mcp` and `source` |

## What format 4 lets a manifest say

| Field | Meaning | When it is left out |
| --- | --- | --- |
| `key` | The resource's identity. It matches the resource across bundles and workspaces, and a rename does not change it. Written as a path is, and one resource's within a bundle | The key is the path |
| `title` | What people read | The resource has no title |
| `mcp.name` | The name of the tool an agent sees: `^[a-z][a-z0-9_]{0,63}$` | The name is derived from the path |
| `source` | `file`, the file that defines the resource, relative to the repository root, and `generated`, whether that file runs code to produce it | Nothing is known of where it is defined |

A manifest in a format 1 to 3 bundle carries none of these. A bundle in an older format that carries one is refused.

Because a manifest without a `key` has its path as its key, a bundle built before keys names the same resources it always did. Deploying one after a resource was renamed renames it back.

## The key of a start inside a flow

A trigger node of a `flow` manifest may carry `key`: `^[a-z][a-z0-9_]*$`, up to 63 characters, unique among the flow's starts. It names the start for as long as the flow lives. A webhook's address, a form's address, a pause and when the start last fired follow the key when the node is renamed. Left out, the node's own name is the key, so a bundle written before keys behaves as it did: renaming such a node gives a webhook a new address, and the old one stops answering. A deploy that would do that lists it under `summary.breaking`. An older core refuses a bundle that carries `key` on a trigger node, as it refuses any field it does not know.
