---
title: Versions and the API policy
description: The versions of the CLI, the SDK and the instance, how a bundle's core range is checked on deploy, the bundle formats, and how /api/v1 may change.
subjects: [cli, versions, reference]
---

Three things have a version: the command line, the SDK a repository is written against, and the instance. A bundle carries the SDK's. This page says how they meet.

## The versions

| What | Where you read it | Now |
| --- | --- | --- |
| The CLI | `volvel --version` prints `volvel <version>`. | 0.5.0 |
| The SDK | `SDK_VERSION`, exported by `@volvel/sdk`. `volvel build` prints it: `Bundle 6e4dd43ae5f2, 753 KB of code, SDK 0.5.0`. | 0.5.0 |
| The instance | `volvel status` prints `Version <core>, migration level <n>`. The API answers the same at `/api/v1/instance`, as `coreVersion` and `migrationLevel`. | 0.5.0 on the instance these pages were checked on |

`volvel --version` prints the CLI's version only. The CLI makes no check that the instance and itself match; the instance checks the bundle.

No `@volvel` package is published to npm yet, and the first publish date is not set.

## What a bundle says about versions

A bundle records the version of the SDK that built it, `sdkVersion`, and a **core range**: `core.min`, the lowest core version it runs on, and `core.below`, the first it does not. `CORE_RANGE` in the SDK sets the range, and the repository's SDK sets it, not the CLI. SDK 0.5.0 gives `min` 0.5.0 and `below` 0.6.0.

When you deploy or promote, the instance compares its own core version with the bundle's range:

| The instance's version | Result |
| --- | --- |
| Below `min` | Refused. `This bundle needs a core from 0.5.0 up to, not including, 0.6.0. This instance runs 0.4.0. Upgrade the instance, or rebuild the bundle with the SDK that matches it.` The code is `incompatible_bundle`, status 409. |
| From `min` up to, not including, `below` | Accepted. |
| `below` or higher, and `min` is 0.2.0 or higher | Accepted. A newer core runs bundles back to 0.2.0. |
| `below` or higher, and `min` is lower than 0.2.0 | Refused. `This bundle was built for a core from <min>, which this instance no longer runs: it runs <version> and supports bundles built for 0.2.0 or later. Rebuild the bundle with a current SDK.` The code is `incompatible_bundle`. |

`volvel build` makes no request, so it does not check any of this. A rollback is a deploy, so an earlier version is checked the same way.

## Bundle formats

A bundle has a `formatVersion`, 1 to 4, and the CLI writes the oldest that can carry what the bundle holds:

| Format | What it adds |
| --- | --- |
| 1 | Manifests and code. |
| 2 | `assets`: the files of apps. |
| 3 | A manifest may be console-managed. The bundle then speaks for every console-managed resource of the workspace. |
| 4 | A manifest may carry `key`, `title`, `mcp` and `source`. |

## The API

The command line talks to `/api/v1`. The policy for it is the one the API's own description gives:

> Before Volvel 1.0, a minor version (0.7, 0.8) may change `v1`: a route, a field or a parameter may change or be taken away, and that version's release notes say what to do. A patch version (0.7.1) only adds and fixes. From 1.0, `v1` only grows: nothing that exists changes its meaning or is taken away, and what is to be removed is first marked `deprecated` here, in an earlier release.

Before 1.0, read the release notes of each minor version before you move to it. Write a program against `v1` so that it ignores a field it does not know, and does not rely on a route that is marked `deprecated`. The routes are in [the API reference](../api/index), with what each needs.

A resource renamed in a repository is a smaller case of the same rule: its old path answers for 90 days, with the headers `Deprecation`, `Sunset` and `Volvel-Resource-Moved`.

## Related

- [Install the command line](../../how-to/cli/install-the-cli)
- [Preview and deploy a repository](../../how-to/cli/deploy-a-repository)
