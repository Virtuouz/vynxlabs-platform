---
title: Versions, support and license
description: "How versions are numbered, which versions get security fixes, what is published and what is not yet, and the license."
subjects: [upgrade, security]
---

What version an instance is, which versions are supported, and where the image and packages come from.

## The version an instance reports

`GET /api/v1/instance` answers the `coreVersion`, the `apiVersion` (`v1`) and the `migrationLevel`. At the time of this page the tree is at version 0.5.0 and migration level 99. The image reports the version it was released as: a release writes one version into the published packages, the control plane, the console, the worker, the SDK's constants and the command line's starter range.

Versions before 1.0 may change the API, the manifest format and the worker protocol. Each entry of the changelog says what an operator and a tenant developer need to do.

## Supported versions

The newest minor version and the one before it get fixes for security problems. Older ones do not: upgrade.

The first publish date is not set. Until it is, nothing has been published to be supported. See [Report a vulnerability](security-reports).

## What is published

Nothing is published yet: no git tag, and the changelog says "Unreleased". A release is made by pushing a tag `v*`. The job `release.yml` then:

- stages the packages `@volvel/widgets`, `@volvel/markup`, `@volvel/docs-engine`, `@volvel/docs-site`, `@volvel/docs`, `@volvel/ui`, `@volvel/app`, `@volvel/sdk` and `@volvel/cli` under `latest`, which the maintainer then approves on npm;
- pushes the image `volvel/volvel:<version>` and `volvel/volvel:latest`.

A push to `main` can stage `<base>-next.<commit>` under `next`, when the repository variable `PUBLISH_NEXT` is `true`. Nothing is published unless the repository variable `RELEASE_ENABLED` is `true`. Until then the job builds, checks and rehearses the release on Postgres 18 and stops.

Until there is an image to pull, build one: [Build the image from source](../../how-to/running/build-the-image).

## Upgrading between versions

Migrations run on start and move forward only. You can upgrade from any earlier version straight to the newest. There is no downgrade: go back by restoring a backup. A database that is newer than the image refuses to start with it.

| Rule | Value |
| --- | --- |
| Oldest bundle core an instance still runs | 0.2.0. A version states the oldest it runs and refuses older ones with a message that says to rebuild. |
| A tenant import needs | An equal migration level on both instances. |
| Standalone workers | The same version as the instance. Upgrade the instance first. |

See [Upgrade an instance](../../how-to/running/upgrade-an-instance).

## License

The repository's `LICENSE` is the Apache License, Version 2.0. A check, `scripts/check-licenses.mjs`, fails when a dependency that ships in the image carries a license outside an allowlist of permissive ones (Apache-2.0, MIT, ISC, the BSD licenses and a few others).

Related: [Requirements](requirements).
